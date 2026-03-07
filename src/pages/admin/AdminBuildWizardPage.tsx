import { useEffect, useState, useRef } from 'react'
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
import { loadAllSessions } from '../../lib/sessionMapper'
import { deriveUnitsFromSessions, filterUnitsForJob, sampleUnits, summarizeUnits } from '../../lib/billableUnitEngine'
import { loadClients, saveExportJob, upsertBillableUnits, lockUnitsForJob, loadDeliveredBuIdsForClient, insertDeliveryRecords, upsertLedgerEntries } from '../../lib/adminStore'
import { type MultiplierState, generateLedgerEntries } from '../../lib/ledgerEngine'
import { generateUUID } from '../../lib/uuid'

const STEPS = ['납품처', 'SKU + 옵션', '수량 + 조건', '시뮬레이션']
const MVP_SKUS = SKU_CATALOG.filter(s => s.isAvailableMvp)
const MVP_COMPONENTS = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)

export default function AdminBuildWizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // 데이터
  const [clients, setClients] = useState<Client[]>([])
  const [allUnits, setAllUnits] = useState<BillableUnit[]>([])
  const [loading, setLoading] = useState(true)

  // Step 1
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // Step 2
  const [selectedSkuId, setSelectedSkuId] = useState<SkuId | null>(null)
  const [selectedComponents, setSelectedComponents] = useState<SkuComponentId[]>(['BASIC'])

  // Step 3
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

  // Step 4
  const [executing, setExecuting] = useState(false)

  const loadedRef = useRef(false)

  useEffect(() => {
    // React 18 Strict Mode 중복 실행 방지
    if (loadedRef.current) return
    loadedRef.current = true

    Promise.all([
      loadClients(),
      loadAllSessions({ skipUserFilter: true }).then((sessions: Session[]) => deriveUnitsFromSessions(sessions)),
    ]).then(([c, units]) => {
      setClients(c)
      setAllUnits(units)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminBuildWizard] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  // 선택된 client 변경 시 기납품 BU 로드
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

  // Step 4 시뮬레이션
  const eligible = selectedSkuId
    ? filterUnitsForJob(allUnits, filters, selectedComponents, excludeBuIds.size > 0 ? excludeBuIds : undefined)
    : []
  const eligibleSummary = summarizeUnits(eligible)
  const sampled = selectedSkuId
    ? sampleUnits(eligible, requestedUnits, samplingStrategy)
    : []

  function toggleComponent(id: SkuComponentId) {
    if (id === 'BASIC') return // 항상 포함
    setSelectedComponents(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    )
  }

  async function handleExecute() {
    if (!selectedSkuId || sampled.length === 0) return
    setExecuting(true)

    try {
      // BU를 Supabase에 먼저 저장 (아직 없을 수 있으므로)
      await upsertBillableUnits(allUnits)

      const jobId = generateUUID()
      const unitIds = sampled.map(u => u.id)

      // 유닛 잠금
      await lockUnitsForJob(unitIds, jobId)

      // Per-client 납품 이력 기록
      if (selectedClientId) {
        await insertDeliveryRecords(unitIds, selectedClientId, jobId)
      }

      // Ledger entry 생성 (사용자별 그룹)
      const userBuMap = new Map<string, typeof sampled>()
      for (const bu of sampled) {
        const uid = bu.userId ?? 'unknown'
        const arr = userBuMap.get(uid) ?? []
        arr.push(bu)
        userBuMap.set(uid, arr)
      }
      const defaultState: MultiplierState = {
        labeledRatio: 0, avgTrustScore: 0.5,
        isComplianceComplete: false, profileComplete: false,
        contributorLevel: 'basic', userConfirmedRatio: 0,
      }
      const allLedgerEntries = Array.from(userBuMap.entries()).flatMap(
        ([uid, bus]) => generateLedgerEntries(bus, defaultState, uid)
          .map(e => ({ ...e, exportJobId: jobId })),
      )
      if (allLedgerEntries.length > 0) {
        await upsertLedgerEntries(allLedgerEntries)
      }

      // Export Job 생성
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
        selectionManifest: unitIds,
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

      navigate(`/admin/jobs/${jobId}`)
    } catch (err) {
      console.error('Build execute error:', err)
      setExecuting(false)
    }
  }

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
      <div className="flex items-center gap-1 px-4 py-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{
                backgroundColor: i <= step ? '#1337ec' : 'rgba(255,255,255,0.08)',
                color: i <= step ? 'white' : 'rgba(255,255,255,0.3)',
              }}
            >
              {i + 1}
            </div>
            <span
              className="text-[10px] truncate"
              style={{ color: i === step ? 'white' : 'rgba(255,255,255,0.3)' }}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
            )}
          </div>
        ))}
      </div>

      {/* 스텝 컨텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
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

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>SKU 선택</p>
              <div className="grid grid-cols-2 gap-2">
                {MVP_SKUS.map(sku => (
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

        {step === 2 && (
          <div className="space-y-4">
            {/* 수량 */}
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
            {/* 최소 등급 */}
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
            {/* 동의 필수 */}
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
            {/* 샘플링 */}
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
                  조건을 완화하거나 수량을 줄여주세요.
                </p>
              </div>
            )}

            {/* 등급 분포 */}
            <div className="rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
              <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>추출 등급 분포</p>
              {(['A', 'B', 'C'] as const).map(g => {
                const count = sampled.filter(u => u.qualityGrade === g).length
                const pct = sampled.length > 0 ? Math.round((count / sampled.length) * 100) : 0
                return (
                  <div key={g} className="flex items-center gap-2 text-xs">
                    <span style={{ color: g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#ef4444' }}>{g}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${pct}%`,
                        backgroundColor: g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#ef4444',
                      }} />
                    </div>
                    <span className="text-white w-8 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 하단 네비게이션 */}
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
    </div>
  )
}
