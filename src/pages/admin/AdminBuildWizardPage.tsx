import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Session } from '../../types/session'
import { type SkuId, SKU_CATALOG, SKU_COMPONENT_CATALOG } from '../../types/sku'
import {
  type BillableUnit,
  type SkuComponentId,
  type ExportJobFilters,
  type SamplingStrategy,
  type Client,
} from '../../types/admin'
import { type SkuInventory, type ExportUtterance } from '../../types/export'
import { loadAllSessions } from '../../lib/sessionMapper'
import { deriveUnitsFromSessions, filterUnitsForJob, sampleUnits, summarizeUnits } from '../../lib/billableUnitEngine'
import { loadClients, saveExportJob, upsertBillableUnits, loadDeliveredBuIdsForClient, loadSkuInventory, confirmExportRequest, processExportRequest, loadExportUtterances, downloadExportRequest } from '../../lib/adminStore'
import { generateUUID } from '../../lib/uuid'
import SkuInventoryCard from '../../components/domain/SkuInventoryCard'
import UtteranceReviewTable from '../../components/domain/UtteranceReviewTable'
import UtteranceReviewGuide from '../../components/domain/UtteranceReviewGuide'

const STEPS = ['납품처', 'SKU + 옵션', '수량 + 조건', '시뮬레이션', '미리보기', '처리 진행', '검수', '다운로드']
const MVP_SKUS = SKU_CATALOG.filter(s => s.isAvailableMvp)
const MVP_COMPONENTS = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)

export default function AdminBuildWizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // 데이터
  const [clients, setClients] = useState<Client[]>([])
  const [allUnits, setAllUnits] = useState<BillableUnit[]>([])
  const [loading, setLoading] = useState(true)

  // Step 0: 납품처
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // Step 1: SKU + 옵션
  const [selectedSkuId, setSelectedSkuId] = useState<SkuId | null>(null)
  const [selectedComponents, setSelectedComponents] = useState<SkuComponentId[]>(['BASIC'])
  const [inventory, setInventory] = useState<SkuInventory[]>([])

  // Step 2: 수량 + 조건
  const [requestedUnits, setRequestedUnits] = useState(100)
  const [filters, setFilters] = useState<ExportJobFilters>({
    minQualityGrade: null,
    qualityTier: null,
    labelSource: null,
    requireConsent: true,
    requirePiiCleaned: false,
    dateRange: null,
    userIds: [],
  })
  const [samplingStrategy, setSamplingStrategy] = useState<SamplingStrategy>('all')

  // Per-client 기납품 BU 제외
  const [excludeBuIds, setExcludeBuIds] = useState<Set<string>>(new Set())

  // Step 3: 시뮬레이션
  const [executing, setExecuting] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)

  // Step 5: 처리 진행
  const [processPhase, setProcessPhase] = useState<'idle' | 'extracting' | 'analyzing' | 'splitting' | 'done'>('idle')
  const [processProgress, setProcessProgress] = useState(0)

  // Step 6: 검수
  const [reviewUtterances, setReviewUtterances] = useState<ExportUtterance[]>([])

  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    Promise.all([
      loadClients(),
      loadAllSessions({ skipUserFilter: true }).then((sessions: Session[]) => deriveUnitsFromSessions(sessions)),
      loadSkuInventory().catch(() => []),
    ]).then(([c, units, inv]) => {
      setClients(c)
      setAllUnits(units)
      setInventory(Array.isArray(inv) ? inv : [])
      setLoading(false)
    }).catch(err => {
      console.error('[AdminBuildWizard] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setExcludeBuIds(new Set())
      return
    }
    loadDeliveredBuIdsForClient(selectedClientId)
      .then(ids => setExcludeBuIds(ids))
      .catch(err => {
        console.error('[AdminBuildWizard] loadDeliveredBuIds failed:', err)
        setExcludeBuIds(new Set())
      })
  }, [selectedClientId])

  // Step 3 시뮬레이션
  const eligible = selectedSkuId
    ? filterUnitsForJob(allUnits, filters, selectedComponents, excludeBuIds.size > 0 ? excludeBuIds : undefined)
    : []
  const eligibleSummary = summarizeUnits(eligible)
  const sampled = selectedSkuId
    ? sampleUnits(eligible, requestedUnits, samplingStrategy)
    : []

  function toggleComponent(id: SkuComponentId) {
    if (id === 'BASIC') return
    setSelectedComponents(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    )
  }

  // Step 5: 처리 실행
  const handleStartProcess = useCallback(async () => {
    if (!createdJobId) return
    setProcessPhase('extracting')
    setProcessProgress(10)
    try {
      setProcessPhase('analyzing')
      setProcessProgress(30)
      await processExportRequest(createdJobId)
      setProcessPhase('splitting')
      setProcessProgress(70)
      // 처리 완료 후 발화 목록 로드
      const utts = await loadExportUtterances(createdJobId)
      setReviewUtterances(utts)
      setProcessPhase('done')
      setProcessProgress(100)
    } catch (err) {
      console.error('[AdminBuildWizard] process failed:', err)
      setProcessPhase('idle')
      setProcessProgress(0)
    }
  }, [createdJobId])

  // Step 6: 검수 핸들러
  const handleReviewToggle = useCallback((utteranceId: string, isIncluded: boolean, reason?: string) => {
    setReviewUtterances(prev =>
      prev.map(u =>
        u.utteranceId === utteranceId
          ? { ...u, isIncluded, excludeReason: isIncluded ? undefined : (reason ?? 'manual') }
          : u
      )
    )
  }, [])

  const handleReviewAutoFilter = useCallback((type: 'short' | 'gradeC' | 'highBeep') => {
    setReviewUtterances(prev =>
      prev.map(u => {
        if (!u.isIncluded) return u
        const match =
          (type === 'short' && u.durationSec < 3) ||
          (type === 'gradeC' && u.qualityGrade === 'C') ||
          (type === 'highBeep' && u.beepMaskRatio >= 0.3)
        if (!match) return u
        const reason = type === 'short' ? 'too_short' : type === 'gradeC' ? 'low_grade' : 'high_beep'
        return { ...u, isIncluded: false, excludeReason: reason }
      })
    )
  }, [])

  async function handleExecute() {
    if (!selectedSkuId || sampled.length === 0) return
    setExecuting(true)

    try {
      const jobId = generateUUID()

      await upsertBillableUnits(allUnits)

      await saveExportJob({
        id: jobId,
        clientId: selectedClientId,
        skuId: selectedSkuId,
        componentIds: selectedComponents,
        deliveryProfileId: null,
        requestedUnits,
        actualUnits: sampled.length,
        samplingStrategy,
        filters,
        status: 'draft',
        selectionManifest: sampled.map(u => u.id),
        outputFormat: 'jsonl',
        logs: [{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `빌드 생성: ${selectedSkuId} + [${selectedComponents.join(',')}], ${sampled.length}유닛`,
        }],
        errorMessage: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      })

      await confirmExportRequest(jobId)
      setCreatedJobId(jobId)
      setStep(4)
      setExecuting(false)
    } catch (err) {
      console.error('Build execute error:', err)
      setExecuting(false)
    }
  }

  // SKU name lookup
  const skuNameMap = new Map(SKU_CATALOG.map(s => [s.id, s.nameKo]))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: '#1337ec' }}>progress_activity</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{
                backgroundColor: i <= step ? '#1337ec' : 'rgba(255,255,255,0.08)',
                color: i <= step ? 'white' : 'rgba(255,255,255,0.3)',
              }}
            >
              {i + 1}
            </div>
            <span
              className="text-[9px] truncate max-w-[56px]"
              style={{ color: i === step ? 'white' : 'rgba(255,255,255,0.3)' }}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div className="w-3 h-px flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
            )}
          </div>
        ))}
      </div>

      {/* 스텝 컨텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Step 0: 납품처 */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>납품처 선택 (선택사항)</p>
            <button
              onClick={() => setSelectedClientId(null)}
              className="w-full text-left p-3 rounded-xl transition-colors"
              style={{
                backgroundColor: selectedClientId === null ? 'rgba(19,55,236,0.15)' : '#1b1e2e',
                borderWidth: 1,
                borderColor: selectedClientId === null ? '#1337ec' : 'transparent',
              }}
            >
              <p className="text-sm text-white">내부 사용</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>고객사 없이 내부 빌드</p>
            </button>
            {clients.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClientId(c.id)}
                className="w-full text-left p-3 rounded-xl transition-colors"
                style={{
                  backgroundColor: selectedClientId === c.id ? 'rgba(19,55,236,0.15)' : '#1b1e2e',
                  borderWidth: 1,
                  borderColor: selectedClientId === c.id ? '#1337ec' : 'transparent',
                }}
              >
                <p className="text-sm text-white">{c.name}</p>
                {c.contactName && <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.contactName}</p>}
              </button>
            ))}
            {clients.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                등록된 납품처가 없습니다
              </p>
            )}
          </div>
        )}

        {/* Step 1: SKU + 옵션 (with SkuInventoryCard) */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>SKU 선택 (재고 현황)</p>
              <div className="grid grid-cols-2 gap-2">
                {inventory.map(inv => (
                  <SkuInventoryCard
                    key={inv.skuId}
                    inventory={inv}
                    skuName={skuNameMap.get(inv.skuId as SkuId)}
                    selected={selectedSkuId === inv.skuId}
                    onClick={() => setSelectedSkuId(inv.skuId as SkuId)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>SKU 전체 목록</p>
              <div className="grid grid-cols-2 gap-2">
                {MVP_SKUS.filter(s => !inventory.some(inv => inv.skuId === s.id)).map(sku => (
                  <button
                    key={sku.id}
                    onClick={() => setSelectedSkuId(sku.id)}
                    className="text-left p-3 rounded-xl transition-colors"
                    style={{
                      backgroundColor: selectedSkuId === sku.id ? 'rgba(19,55,236,0.15)' : '#1b1e2e',
                      borderWidth: 1,
                      borderColor: selectedSkuId === sku.id ? '#1337ec' : 'transparent',
                    }}
                  >
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: sku.category === 'voice' ? 'rgba(19,55,236,0.15)' : 'rgba(234,179,8,0.15)',
                        color: sku.category === 'voice' ? '#7b9aff' : '#eab308',
                      }}
                    >
                      {sku.id}
                    </span>
                    <p className="text-xs text-white mt-1">{sku.nameKo}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>부가옵션</p>
              <div className="flex flex-wrap gap-2">
                {MVP_COMPONENTS.map(comp => {
                  const active = selectedComponents.includes(comp.id)
                  return (
                    <button
                      key={comp.id}
                      onClick={() => toggleComponent(comp.id)}
                      disabled={comp.id === 'BASIC'}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{
                        backgroundColor: active ? '#1337ec' : 'rgba(255,255,255,0.06)',
                        color: active ? 'white' : 'rgba(255,255,255,0.5)',
                        opacity: comp.id === 'BASIC' ? 0.7 : 1,
                      }}
                    >
                      {comp.nameKo}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 수량 + 조건 */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>요청 유닛 수</p>
              <input
                type="number"
                value={requestedUnits}
                onChange={e => setRequestedUnits(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                = 약 {requestedUnits}분 ({(requestedUnits / 60).toFixed(1)}시간)
              </p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>최소 품질 등급</p>
              <div className="flex gap-2">
                {[null, 'C', 'B', 'A'].map(g => (
                  <button
                    key={g ?? 'any'}
                    onClick={() => setFilters(f => ({ ...f, minQualityGrade: g as ExportJobFilters['minQualityGrade'] }))}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      backgroundColor: filters.minQualityGrade === g ? '#1337ec' : 'rgba(255,255,255,0.06)',
                      color: filters.minQualityGrade === g ? 'white' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {g ? `${g}+` : '전체'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>공개 동의 필수</span>
              <button
                onClick={() => setFilters(f => ({ ...f, requireConsent: !f.requireConsent }))}
                className="w-10 h-5 rounded-full transition-colors"
                style={{ backgroundColor: filters.requireConsent ? '#1337ec' : 'rgba(255,255,255,0.15)' }}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: filters.requireConsent ? 'translateX(20px)' : 'translateX(2px)' }}
                />
              </button>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>샘플링 전략</p>
              <div className="flex gap-2">
                {(['all', 'random', 'quality_first', 'stratified'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSamplingStrategy(s)}
                    className="text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                    style={{
                      backgroundColor: samplingStrategy === s ? '#1337ec' : 'rgba(255,255,255,0.06)',
                      color: samplingStrategy === s ? 'white' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {s === 'all' ? '전체' : s === 'random' ? '랜덤' : s === 'quality_first' ? '품질우선' : '층화'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 시뮬레이션 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
              <p className="text-xs font-medium text-white mb-2">시뮬레이션 결과</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>적합 유닛</p>
                  <p className="text-lg font-bold" style={{ color: eligible.length >= requestedUnits ? '#22c55e' : '#ef4444' }}>
                    {eligible.length.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>요청 유닛</p>
                  <p className="text-lg font-bold text-white">{requestedUnits.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>실제 추출</p>
                  <p className="text-lg font-bold" style={{ color: '#1337ec' }}>{sampled.length.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>유효 시간</p>
                  <p className="text-lg font-bold text-white">{eligibleSummary.totalEffectiveHours}h</p>
                </div>
              </div>
            </div>

            {excludeBuIds.size > 0 && (
              <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(234,179,8,0.1)' }}>
                <p className="text-xs" style={{ color: '#eab308' }}>
                  이 납품처에 이미 납품된 {excludeBuIds.size.toLocaleString()}개 유닛이 제외되었습니다.
                </p>
              </div>
            )}

            {eligible.length < requestedUnits && (
              <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                <p className="text-xs" style={{ color: '#ef4444' }}>
                  요청 수량({requestedUnits})보다 적합 유닛({eligible.length})이 부족합니다.
                </p>
              </div>
            )}

            <div className="rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
              <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>추출 등급 분포</p>
              {(['A', 'B', 'C'] as const).map(g => {
                const count = sampled.filter(u => u.qualityGrade === g).length
                const pct = sampled.length > 0 ? Math.round((count / sampled.length) * 100) : 0
                return (
                  <div key={g} className="flex items-center gap-2 text-xs">
                    <span style={{ color: g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#6b7280' }}>{g}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${pct}%`,
                        backgroundColor: g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#6b7280',
                      }} />
                    </div>
                    <span className="text-white w-8 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 4: 미리보기 */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-outlined text-sm" style={{ color: '#22c55e' }}>check_circle</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>적합 데이터</span>
                </div>
                <p className="text-xl font-bold text-white">{sampled.length}</p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {(sampled.length / 60).toFixed(1)}시간
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-outlined text-sm" style={{ color: '#8b5cf6' }}>group</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>화자 다양성</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {new Set(sampled.map(u => u.userId)).size}
                </p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>유니크 화자</p>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-outlined text-sm" style={{ color: '#f59e0b' }}>bar_chart</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>품질 분포</span>
                </div>
                <div className="flex gap-1 text-[10px]">
                  {(['A', 'B', 'C'] as const).map(g => (
                    <span key={g} style={{ color: g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#6b7280' }}>
                      {g}:{sampled.filter(u => u.qualityGrade === g).length}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1b1e2e' }}>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                미리보기 확인 후 추출을 시작하세요
              </p>
              <button
                onClick={() => setStep(5)}
                className="text-xs px-6 py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: '#1337ec' }}
              >
                <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>play_arrow</span>
                추출 시작
              </button>
            </div>
          </div>
        )}

        {/* Step 5: 처리 진행 */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#1b1e2e' }}>
              {processPhase === 'idle' ? (
                <>
                  <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: '#1337ec' }}>rocket_launch</span>
                  <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>처리를 시작하면 추출 → 분석 → 분할 순서로 진행됩니다</p>
                  <button
                    onClick={handleStartProcess}
                    className="text-xs px-6 py-2 rounded-lg font-medium text-white"
                    style={{ backgroundColor: '#1337ec' }}
                  >
                    처리 시작
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 mb-4">
                    {processPhase !== 'done' && (
                      <span className="material-symbols-outlined text-xl animate-spin" style={{ color: '#1337ec' }}>progress_activity</span>
                    )}
                    {processPhase === 'done' && (
                      <span className="material-symbols-outlined text-xl" style={{ color: '#22c55e' }}>check_circle</span>
                    )}
                    <span className="text-sm font-medium text-white">
                      {processPhase === 'extracting' && '음성 추출 중...'}
                      {processPhase === 'analyzing' && '품질 분석 중...'}
                      {processPhase === 'splitting' && '발화 분할 중...'}
                      {processPhase === 'done' && '처리 완료'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${processProgress}%`, backgroundColor: processPhase === 'done' ? '#22c55e' : '#1337ec' }}
                    />
                  </div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{processProgress}%</p>

                  {/* Phase indicators */}
                  <div className="flex justify-between mt-4 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {['추출', '분석', '분할'].map((label, i) => {
                      const phases = ['extracting', 'analyzing', 'splitting']
                      const phaseIdx = phases.indexOf(processPhase)
                      const done = processPhase === 'done' || phaseIdx > i
                      const active = phaseIdx === i
                      return (
                        <span key={label} style={{ color: done ? '#22c55e' : active ? '#1337ec' : undefined }}>
                          {done ? '✓ ' : active ? '● ' : '○ '}{label}
                        </span>
                      )
                    })}
                  </div>

                  {processPhase === 'done' && (
                    <button
                      onClick={() => setStep(6)}
                      className="mt-4 text-xs px-6 py-2 rounded-lg font-medium text-white"
                      style={{ backgroundColor: '#1337ec' }}
                    >
                      검수 진행
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 6: 검수 */}
        {step === 6 && (
          <div className="space-y-3">
            <UtteranceReviewGuide />
            <UtteranceReviewTable
              utterances={reviewUtterances}
              onToggle={handleReviewToggle}
              onAutoFilter={handleReviewAutoFilter}
              onFinalize={() => setStep(7)}
              requestedMinutes={requestedUnits}
            />
          </div>
        )}

        {/* Step 7: 다운로드 */}
        {step === 7 && (
          <div className="space-y-4">
            <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#1b1e2e' }}>
              <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: '#22c55e' }}>package_2</span>
              <p className="text-sm font-medium text-white mb-1">패키징 완료</p>
              <p className="text-[10px] mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>다운로드 준비가 완료되었습니다</p>

              <div className="rounded-lg p-4 text-left space-y-2 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>파일명</span>
                  <span className="text-white font-mono">export_{selectedSkuId}_{new Date().toISOString().slice(0, 10)}.zip</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>크기</span>
                  <span className="text-white">~{(sampled.length * 0.8).toFixed(1)} MB (추정)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>포맷</span>
                  <span className="text-white">WAV + JSONL manifest</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>발화 수</span>
                  <span className="text-white">{reviewUtterances.filter(u => u.isIncluded).length}건</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>SKU</span>
                  <span className="text-white">{selectedSkuId}</span>
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!createdJobId) return
                  try {
                    const { downloadUrl } = await downloadExportRequest(createdJobId)
                    window.open(downloadUrl, '_blank')
                  } catch (err) {
                    console.error('[AdminBuildWizard] download failed:', err)
                    alert('다운로드에 실패했습니다')
                  }
                }}
                className="text-xs px-6 py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: '#22c55e' }}
              >
                <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>download</span>
                ZIP 다운로드
              </button>
            </div>

            <button
              onClick={() => navigate('/admin/jobs')}
              className="w-full text-xs py-2 rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            >
              작업 목록으로
            </button>
          </div>
        )}
      </div>

      {/* 하단 네비게이션 (Steps 0-3만) */}
      {step <= 3 && (
        <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
            >
              이전
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !selectedSkuId}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-30"
              style={{ backgroundColor: '#1337ec' }}
            >
              다음
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={executing || sampled.length === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-30"
              style={{ backgroundColor: '#1337ec' }}
            >
              {executing ? '생성 중...' : `빌드 실행 (${sampled.length}유닛)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
