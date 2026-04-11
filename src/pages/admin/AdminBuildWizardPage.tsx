import { useEffect, useState, useRef, useCallback } from 'react'
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
import { getDefaultRecipe, recipeToApiFilters } from '../../lib/skuStudio'
import { fetchAllSessionsAdminApi } from '../../lib/api/sessions'
import { loadClients, saveExportJob, upsertBillableUnits, loadDeliveredBuIdsForClient, loadSkuInventory, confirmExportRequest, processExportRequest, loadExportUtterances } from '../../lib/adminStore'
import { forceUpdateConsentApi, fetchTranscriptIdsApi } from '../../lib/api/admin'
import { generateUUID } from '../../lib/uuid'
import SkuInventoryCard from '../../components/domain/SkuInventoryCard'
import { AudioStepProcess, AudioStepReview, AudioStepDownload } from '../../components/domain/AudioProcessingSteps'
// Metadata flow components
import { type MetadataFilterState } from '../../components/domain/metadata/MetadataQualityFilter'
import MetadataExportConfirm from '../../components/domain/metadata/MetadataExportConfirm'
import { MetadataStepInventory, MetadataStepPreview } from '../../components/domain/metadata/MetadataWizardSteps'
import { type MetadataSkuInventory, type MetadataSkuStats } from '../../lib/api/admin'

const AUDIO_steps = ['납품처', 'SKU + 옵션', '수량 + 조건', '시뮬레이션', '미리보기', '처리 진행', '검수', '다운로드']
const META_steps = ['납품처', 'SKU + 옵션', '재고 + 필터', '이벤트 프리뷰', '패키징 + 다운로드']
const MVP_SKUS = SKU_CATALOG.filter(s => s.isAvailableMvp)
const MVP_COMPONENTS = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)

export default function AdminBuildWizardPage() {
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

  // 서버 하드코딩 제약 동기화: 전사 보유 세션 ID
  const [transcriptSessionIds, setTranscriptSessionIds] = useState<Set<string>>(new Set())

  // Step 2: 양자동의 전환 (F6)
  const [consentUpdating, setConsentUpdating] = useState(false)

  // Step 3: 시뮬레이션
  const [executing, setExecuting] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)

  // Step 5: 처리 진행
  const [processPhase, setProcessPhase] = useState<'idle' | 'extracting' | 'analyzing' | 'splitting' | 'done'>('idle')
  const [processProgress, setProcessProgress] = useState(0)

  // Step 6: 검수
  const [reviewUtterances, setReviewUtterances] = useState<ExportUtterance[]>([])
  const [reviewSelectedIds, setReviewSelectedIds] = useState<Set<string>>(new Set())
  const [piiEditId, setPiiEditId] = useState<string | null>(null)

  // ── Metadata flow state ──
  const [metaSkus, setMetaSkus] = useState<MetadataSkuInventory[]>([])
  const [selectedMetaSkuIds, setSelectedMetaSkuIds] = useState<Set<string>>(new Set())
  const [metaFilter, setMetaFilter] = useState<MetadataFilterState>({
    excludeSparse: false, excludeStaleDevices: false,
    dateFrom: '', dateTo: '', selectedPseudoIds: [],
  })
  const [metaStatsCache, setMetaStatsCache] = useState<Record<string, MetadataSkuStats>>({})
  const [metaInventoryLoaded, setMetaInventoryLoaded] = useState(false)
  // Derived: is metadata flow?
  const selectedSkuCategory = selectedSkuId
    ? SKU_CATALOG.find(s => s.id === selectedSkuId)?.category ?? 'voice'
    : null
  const isMetadataFlow = selectedSkuCategory === 'metadata'
  const steps = isMetadataFlow ? META_steps : AUDIO_steps

  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    Promise.all([
      loadClients(),
      loadAllSessions({ skipUserFilter: true }).then((sessions: Session[]) => {
        return deriveUnitsFromSessions(sessions)
      }),
      loadSkuInventory().catch(() => []),
      fetchTranscriptIdsApi().then(({ data }) => data ?? []),
    ]).then(([c, units, inv, transcriptIds]) => {
      setClients(c)
      setAllUnits(units)
      setInventory(Array.isArray(inv) ? inv : [])
      setTranscriptSessionIds(new Set(transcriptIds as string[]))
      setLoading(false)
    }).catch(err => {
      console.error('[AdminBuildWizard] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  // SKU 선택 시 해당 SKU 조건에 맞는 세션만 API에서 재조회
  useEffect(() => {
    if (!selectedSkuId) return
    const recipe = getDefaultRecipe(selectedSkuId)
    const apiFilters = recipeToApiFilters(recipe)

    fetchAllSessionsAdminApi(apiFilters).then(({ data }) => {
      if (!data) return
      const units = deriveUnitsFromSessions(data)
      setAllUnits(units)
    }).catch(err => {
      console.error('[AdminBuildWizard] SKU session fetch failed:', err)
    })
  }, [selectedSkuId])

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

  // Step 3 시뮬레이션 — 서버 하드코딩 제약(requirePiiCleaned, minQaScore=50, requireTranscript)을 동일 적용
  const eligible = selectedSkuId
    ? (() => {
        const strictFilters = { ...filters, requirePiiCleaned: true }
        const filtered = filterUnitsForJob(
          allUnits,
          strictFilters,
          selectedComponents,
          excludeBuIds.size > 0 ? excludeBuIds : undefined,
          { minQaScore: 50, transcriptSessionIds },
        )
        const recipe = getDefaultRecipe(selectedSkuId)
        if (recipe.filters.requireLabels === true) {
          return filtered.filter(u => u.hasLabels)
        }
        return filtered
      })()
    : []
  const eligibleSummary = summarizeUnits(eligible)
  const eligibleMinutes = Math.round(eligible.reduce((sum, u) => sum + u.effectiveSeconds, 0) / 60 * 10) / 10
  const sampled = selectedSkuId
    ? sampleUnits(eligible, requestedUnits, samplingStrategy)
    : []
  const sampledMinutes = Math.round(sampled.reduce((sum, u) => sum + u.effectiveSeconds, 0) / 60 * 10) / 10

  function toggleComponent(id: SkuComponentId) {
    if (id === 'BASIC') return
    setSelectedComponents(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    )
  }

  // F6: 팀 내부 통화 양자동의 전환
  async function handleForceConsent() {
    const nonConsentedIds = [...new Set(
      allUnits
        .filter(u => u.consentStatus !== 'PUBLIC_CONSENTED')
        .map(u => u.sessionId)
    )]
    if (nonConsentedIds.length === 0) {
      alert('이미 모든 세션이 동의 완료 상태입니다.')
      return
    }
    if (!confirm(`${nonConsentedIds.length}개 세션을 납품 가능 상태로 설정하시겠습니까?\n동의 상태(consent_status)가 업데이트되며 추출 대상에 포함됩니다.`)) return
    setConsentUpdating(true)
    try {
      const { data, error } = await forceUpdateConsentApi(nonConsentedIds, 'both_agreed')
      if (error) {
        alert(`동의 전환 실패: ${error}`)
      } else {
        const skipped = data?.skipped ?? 0
        const updated = data?.updated ?? 0
        alert(`완료: ${updated}개 세션 동의 전환${skipped > 0 ? `\n업로드 미완료 ${skipped}건 제외됨` : ''}`)
      }
    } catch (err) {
      alert(`오류: ${err}`)
    }
    setConsentUpdating(false)
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
      const msg = err instanceof Error ? err.message : String(err)
      alert(`처리 실패: ${msg}`)
    }
  }, [createdJobId])

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
      setReviewUtterances([])
      setProcessPhase('idle')
      setProcessProgress(0)
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
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              onClick={() => { if (i < step) setStep(i) }}
              style={{
                backgroundColor: i <= step ? '#1337ec' : 'rgba(255,255,255,0.08)',
                color: i <= step ? 'white' : 'rgba(255,255,255,0.3)',
                cursor: i < step ? 'pointer' : 'default',
              }}
            >
              {i + 1}
            </div>
            <span
              className="text-[9px] truncate max-w-[56px]"
              onClick={() => { if (i < step) setStep(i) }}
              style={{
                color: i === step ? 'white' : 'rgba(255,255,255,0.3)',
                cursor: i < step ? 'pointer' : 'default',
              }}
            >
              {s}
            </span>
            {i < steps.length - 1 && (
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

        {/* ── Metadata Flow: Step 2m 재고+필터 ── */}
        {step === 2 && isMetadataFlow && (
          <MetadataStepInventory
            selectedSkuId={selectedSkuId!}
            metaSkus={metaSkus}
            setMetaSkus={setMetaSkus}
            selectedMetaSkuIds={selectedMetaSkuIds}
            setSelectedMetaSkuIds={setSelectedMetaSkuIds}
            setMetaFilter={setMetaFilter}
            metaStatsCache={metaStatsCache}
            setMetaStatsCache={setMetaStatsCache}
            metaInventoryLoaded={metaInventoryLoaded}
            setMetaInventoryLoaded={setMetaInventoryLoaded}
          />
        )}

        {/* ── Metadata Flow: Step 3m 이벤트 프리뷰 ── */}
        {step === 3 && isMetadataFlow && (
          <MetadataStepPreview
            schemaId={[...selectedMetaSkuIds][0] ?? selectedSkuId!}
            metaStatsCache={metaStatsCache}
            filters={{
              dateFrom: metaFilter.dateFrom,
              dateTo: metaFilter.dateTo,
              pseudoId: metaFilter.selectedPseudoIds[0],
              excludeSparse: metaFilter.excludeSparse,
            }}
          />
        )}

        {/* ── Metadata Flow: Step 4m 패키징+다운로드 ── */}
        {step === 4 && isMetadataFlow && (() => {
          const schemaId = [...selectedMetaSkuIds][0] ?? selectedSkuId!
          const skuInfo = metaSkus.find(s => s.schemaId === schemaId) ?? metaSkus.find(s => s.schemaId.startsWith(selectedSkuId!))
          const stats = metaStatsCache[schemaId]

          // Compute filter-adjusted values from stats cache
          let filteredEvents = skuInfo?.totalEvents ?? 0
          let filteredDevices = skuInfo?.deviceCount ?? 0
          if (stats) {
            let devices = stats.devices
            if (metaFilter.excludeStaleDevices) {
              devices = devices.filter(d => (d.syncStatus as string) === 'upToDate' || (d.syncStatus as string) === 'up_to_date')
            }
            if (metaFilter.selectedPseudoIds.length > 0) {
              devices = devices.filter(d => metaFilter.selectedPseudoIds.includes(d.pseudoId))
            }
            filteredDevices = devices.length
            filteredEvents = devices.reduce((sum, d) => sum + d.eventCount, 0)
          }

          const period = metaFilter.dateFrom || metaFilter.dateTo
            ? `${metaFilter.dateFrom || skuInfo?.periodStart || '?'} ~ ${metaFilter.dateTo || skuInfo?.periodEnd || '?'}`
            : skuInfo?.periodStart && skuInfo?.periodEnd
              ? `${skuInfo.periodStart} ~ ${skuInfo.periodEnd}`
              : '-'

          return (
            <MetadataExportConfirm
              selectedSchemaIds={[schemaId]}
              filter={metaFilter}
              totalEvents={filteredEvents}
              deviceCount={filteredDevices}
              period={period}
              clientName={selectedClientId ? (clients.find(c => c.id === selectedClientId)?.name ?? '내부 사용') : '내부 사용'}
            />
          )
        })()}

        {/* Step 2: 수량 + 조건 (Audio only) */}
        {step === 2 && !isMetadataFlow && (
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
            {/* F6: 팀 내부 통화 납품 가능 처리 */}
            <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#22c55e' }}>팀 내부 통화 납품 가능 처리</p>
              <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                팀원 간 통화 세션의 동의 상태(consent_status)를 both_agreed로 강제 설정합니다.
                납품 대상에 포함하려면 추출 전 실행하세요.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  납품 미설정 세션: {new Set(allUnits.filter(u => u.consentStatus !== 'PUBLIC_CONSENTED').map(u => u.sessionId)).size}건 (업로드 완료 기준 적용)
                </span>
                <button
                  onClick={handleForceConsent}
                  disabled={consentUpdating}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  <span className="material-symbols-outlined text-sm">verified_user</span>
                  {consentUpdating ? '처리중...' : '납품 가능으로 설정'}
                </button>
              </div>
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

        {/* Step 3: 시뮬레이션 (Audio only) */}
        {step === 3 && !isMetadataFlow && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
              <p className="text-xs font-medium text-white mb-2">시뮬레이션 결과</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>적합 분량</p>
                  <p className="text-lg font-bold" style={{ color: eligibleMinutes >= requestedUnits ? '#22c55e' : '#ef4444' }}>
                    {eligibleMinutes.toLocaleString()}분
                  </p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>요청 수량</p>
                  <p className="text-lg font-bold text-white">{requestedUnits.toLocaleString()}분</p>
                </div>
                <div>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>실제 추출</p>
                  <p className="text-lg font-bold" style={{ color: '#1337ec' }}>{sampledMinutes.toLocaleString()}분</p>
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

            {eligibleMinutes < requestedUnits && (
              <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                <p className="text-xs" style={{ color: '#ef4444' }}>
                  요청 수량({requestedUnits}분)보다 적합 분량({eligibleMinutes}분)이 부족합니다.
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

        {/* Step 4: 미리보기 (Audio only) */}
        {step === 4 && !isMetadataFlow && (
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

        {/* Step 5: 처리 진행 (Audio only) */}
        {step === 5 && !isMetadataFlow && (
          <AudioStepProcess
            reviewUtterances={reviewUtterances}
            processPhase={processPhase}
            processProgress={processProgress}
            onStartProcess={handleStartProcess}
            onSetStep={setStep}
          />
        )}

        {/* Step 6: 검수 (Audio only) */}
        {step === 6 && !isMetadataFlow && (
          <AudioStepReview
            reviewUtterances={reviewUtterances}
            setReviewUtterances={setReviewUtterances}
            requestedUnits={requestedUnits}
            createdJobId={createdJobId}
            selectedSkuId={selectedSkuId}
            reviewSelectedIds={reviewSelectedIds}
            setReviewSelectedIds={setReviewSelectedIds}
            piiEditId={piiEditId}
            setPiiEditId={setPiiEditId}
            onSetStep={setStep}
          />
        )}

        {/* Step 7: 다운로드 (Audio only) */}
        {step === 7 && !isMetadataFlow && (
          <AudioStepDownload
            selectedSkuId={selectedSkuId}
            sampled={sampled}
            reviewUtterances={reviewUtterances}
            createdJobId={createdJobId}
          />
        )}
      </div>

      {/* 하단 네비게이션 */}
      {(isMetadataFlow ? step < steps.length - 1 : step <= 3) && (
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
          {isMetadataFlow ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !selectedSkuId}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-30"
              style={{ backgroundColor: '#8b5cf6' }}
            >
              다음
            </button>
          ) : step < 3 ? (
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
