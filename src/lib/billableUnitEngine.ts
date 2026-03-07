import { type Session } from '../types/session'
import {
  type BillableUnit,
  type BillableUnitStats,
  type PendingBalance,
  type QualityTier,
  type ExportJobFilters,
  type SkuComponentId,
  type SamplingStrategy,
  type DeviceContextSnapshot,
} from '../types/admin'
import { SKU_COMPONENT_CATALOG } from '../types/sku'
import { calcQualityGrade } from './valueEngine'
import { getCurrentNetworkType } from './networkCollector'

// ── 설정 상수 ─────────────────────────────────────────────────────────────────

const MIN_DURATION_SECONDS = 15    // 15초 미만 세션 제외
const C_GRADE_PENALTY = 0.5        // C등급 유효시간 50% 감액 (0이면 제외)

// ── Device Context Snapshot (BU 생성 시 기기 상태 캡처) ──────────────────────

/** 현재 기기 상태를 캡처 — BU 생성 시 호출 */
function captureDeviceContext(): DeviceContextSnapshot {
  let batteryLevel: DeviceContextSnapshot['batteryLevel'] = null
  let isCharging: boolean | null = null

  // 배터리 상태: localStorage에서 최신 상태 읽기 (batteryCollector가 관리)
  try {
    const raw = localStorage.getItem('uncounted_battery_state')
    if (raw) {
      const state = JSON.parse(raw)
      isCharging = state.isCharging ?? null
      // levelAtStart는 충전 시작 시점 값이므로 대략적 추정
      if (typeof state.levelAtStart === 'number') {
        const lvl = state.levelAtStart
        batteryLevel = lvl > 0.6 ? 'high' : lvl > 0.2 ? 'medium' : 'low'
      }
    }
  } catch { /* ignore */ }

  // 화면 상태: screenSessionCollector 상태 읽기
  let screenActive: boolean | null = null
  try {
    const raw = localStorage.getItem('uncounted_screen_state')
    if (raw) {
      const state = JSON.parse(raw)
      screenActive = state.visibleSinceMs != null
    }
  } catch { /* ignore */ }

  return {
    networkType: getCurrentNetworkType(),
    batteryLevel,
    isCharging,
    screenActive,
    capturedAt: new Date().toISOString().slice(0, 10),
  }
}

// ── BU 산정 알고리즘 ─────────────────────────────────────────────────────────

/** 세션의 유효 초 계산 (audioMetrics override → duration fallback) */
export function calcEffectiveSeconds(session: Session): number {
  if (session.audioMetrics?.effectiveMinutes != null) {
    return session.audioMetrics.effectiveMinutes * 60
  }
  return session.duration
}

/** 품질 티어 결정: audioMetrics 없으면 basic, confirmed+A→gold, confirmed→verified */
export function determineQualityTier(
  session: Session,
  grade: 'A' | 'B' | 'C',
): QualityTier {
  if (session.audioMetrics === null) return 'basic'

  const confirmedSources = ['user_confirmed', 'multi_confirmed']
  const isConfirmed = session.labelSource != null && confirmedSources.includes(session.labelSource)

  if (isConfirmed && grade === 'A') return 'gold'
  if (isConfirmed) return 'verified'
  return 'basic'
}

/** 단일 세션 → BillableUnit[] 변환 */
export function deriveUnitsFromSession(session: Session): BillableUnit[] {
  // 15초 미만 제외
  if (session.duration < MIN_DURATION_SECONDS) return []

  let billableSeconds = calcEffectiveSeconds(session)
  const grade = calcQualityGrade(session.qaScore ?? 0)

  // C등급 가드레일: 감액 적용 (C_GRADE_PENALTY=0이면 완전 제외)
  if (grade === 'C') {
    if (C_GRADE_PENALTY <= 0) return []
    billableSeconds *= C_GRADE_PENALTY
  }

  // floor(billableSeconds / 60), 올림 없음
  const unitCount = Math.floor(billableSeconds / 60)
  if (unitCount === 0) return []

  const qualityTier = determineQualityTier(session, grade)
  const consentStatus = session.visibilityStatus === 'PUBLIC_CONSENTED'
    ? 'PUBLIC_CONSENTED' as const
    : 'PRIVATE' as const

  // device_context 스냅샷: 첫 유닛 생성 시 1회 캡처 (같은 세션 내 유닛은 동일 컨텍스트)
  const deviceContext = captureDeviceContext()

  const units: BillableUnit[] = []
  for (let i = 0; i < unitCount; i++) {
    // 마지막 유닛이 아닌 경우 60초, 마지막은 나머지 (최대 60)
    const effectiveSeconds = (i < unitCount - 1)
      ? 60
      : Math.min(60, billableSeconds - (unitCount - 1) * 60)

    units.push({
      id: `${session.id}_${i}`,
      sessionId: session.id,
      minuteIndex: i,
      effectiveSeconds: Math.round(effectiveSeconds * 100) / 100,
      qualityGrade: grade,
      qaScore: session.qaScore ?? 0,
      qualityTier,
      labelSource: session.labelSource ?? null,
      hasLabels: session.labels !== null,
      consentStatus,
      piiStatus: session.piiStatus ?? 'CLEAR',
      lockStatus: 'available',
      lockedByJobId: null,
      sessionDate: session.date,
      userId: session.userId ?? null,
      deviceContext,
    })
  }

  return units
}

/** 세션 배열 → 전체 BillableUnit[] (레거시: 누적 없음, 60초 미만 버림) */
export function deriveUnitsFromSessions(sessions: Session[]): BillableUnit[] {
  const units: BillableUnit[] = []
  for (const s of sessions) {
    const derived = deriveUnitsFromSession(s)
    for (const u of derived) units.push(u)
  }
  return units
}

// ── 누적 정산 (Accumulated Settlement) ───────────────────────────────────────
//
// 하이브리드 방식:
//   - 60초 이상 세션 → 기존 방식대로 정분(整分) BU 생성 (세션 자체 품질 유지)
//   - 60초 미만 세션 + 정분 후 나머지 초 → 누적 풀에 합산
//   - 누적 풀이 60초 도달 시 가중평균 qaScore로 누적 BU 생성
//   - 동의/PII는 보수적 (하나라도 PRIVATE이면 PRIVATE)

export type AccumulationResult = {
  units: BillableUnit[]
  pendingBalance: PendingBalance
  stats: {
    totalSessionsProcessed: number
    sessionsDirectBU: number      // 자체적으로 1+ BU 생성한 세션 수
    sessionsAccumulated: number   // 누적 풀에만 기여한 세션 수 (sub-60s)
    sessionsSkipped: number       // 15초 미만 / C등급 제외
    accumulatedBUs: number        // 누적 풀에서 생성된 BU 수
    remainderSecondsRecovered: number  // 정분 후 나머지로 회수된 초
  }
}

/** 세션 유효초 계산 (C등급 감액 포함). null이면 제외 대상 */
function calcBillableSeconds(session: Session): number | null {
  if (session.duration < MIN_DURATION_SECONDS) return null

  let seconds = calcEffectiveSeconds(session)
  const grade = calcQualityGrade(session.qaScore ?? 0)

  if (grade === 'C') {
    if (C_GRADE_PENALTY <= 0) return null
    seconds *= C_GRADE_PENALTY
  }

  return seconds
}

/**
 * 세션 배열 → BillableUnit[] + PendingBalance (누적 정산)
 *
 * - previousPending: 이전 이월분 (없으면 빈 상태로 시작)
 * - 소급 적용: 전체 세션을 넣고 previousPending 없이 호출하면 과거 데이터 재계산
 */
export function deriveUnitsWithAccumulation(
  sessions: Session[],
  previousPending?: PendingBalance,
): AccumulationResult {
  // 누적 풀 상태
  let poolSeconds = previousPending?.pendingSeconds ?? 0
  let poolWeightedQa = previousPending?.weightedQaSum ?? 0
  let poolSessionIds = [...(previousPending?.sourceSessionIds ?? [])]
  let poolAllConsented = true   // 하나라도 PRIVATE이면 false
  let poolAllPiiClear = true    // 하나라도 SUSPECT/LOCKED이면 false
  let poolHasLabels = false
  let poolLastDate = ''
  let poolUserId: string | null = null

  const allUnits: BillableUnit[] = []
  let sessionsDirectBU = 0
  let sessionsAccumulated = 0
  let sessionsSkipped = 0
  let accumulatedBUs = 0
  let remainderSecondsRecovered = 0

  // 날짜순 정렬 (안정적 처리)
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))

  for (const session of sorted) {
    const billable = calcBillableSeconds(session)
    if (billable === null) {
      sessionsSkipped++
      continue
    }

    const qaScore = session.qaScore ?? 0
    const isConsented = session.visibilityStatus === 'PUBLIC_CONSENTED'
    const isPiiOk = (session.piiStatus ?? 'CLEAR') === 'CLEAR' || (session.piiStatus ?? 'CLEAR') === 'REVIEWED'

    const fullBUs = Math.floor(billable / 60)
    const remainder = billable - fullBUs * 60

    // ── 정분(60초 단위) BU: 세션 자체 품질로 생성 ──
    if (fullBUs >= 1) {
      sessionsDirectBU++
      const grade = calcQualityGrade(qaScore)
      const qualityTier = determineQualityTier(session, grade)
      const consentStatus = isConsented ? 'PUBLIC_CONSENTED' as const : 'PRIVATE' as const

      for (let i = 0; i < fullBUs; i++) {
        allUnits.push({
          id: `${session.id}_${i}`,
          sessionId: session.id,
          minuteIndex: i,
          effectiveSeconds: 60,
          qualityGrade: grade,
          qaScore,
          qualityTier,
          labelSource: session.labelSource ?? null,
          hasLabels: session.labels !== null,
          consentStatus,
          piiStatus: session.piiStatus ?? 'CLEAR',
          lockStatus: 'available',
          lockedByJobId: null,
          sessionDate: session.date,
          userId: session.userId ?? null,
        })
      }
    }

    // ── 나머지(remainder) + sub-60s 세션 → 누적 풀 ──
    const secondsToPool = fullBUs >= 1 ? remainder : billable
    if (secondsToPool > 0) {
      if (fullBUs === 0) sessionsAccumulated++
      if (fullBUs >= 1) remainderSecondsRecovered += remainder

      poolSeconds += secondsToPool
      poolWeightedQa += secondsToPool * qaScore
      poolSessionIds.push(session.id)
      if (!isConsented) poolAllConsented = false
      if (!isPiiOk) poolAllPiiClear = false
      if (session.labels !== null) poolHasLabels = true
      poolLastDate = session.date
      poolUserId = session.userId ?? poolUserId
    }

    // ── 누적 풀에서 BU 생성 (60초 도달마다) ──
    while (poolSeconds >= 60) {
      const avgQa = poolWeightedQa / poolSeconds
      const accGrade = calcQualityGrade(avgQa)

      allUnits.push({
        id: `acc_${poolUserId ?? 'u'}_${Date.now()}_${accumulatedBUs}`,
        sessionId: session.id,  // 마지막 기여 세션
        minuteIndex: 0,
        effectiveSeconds: 60,
        qualityGrade: accGrade,
        qaScore: Math.round(avgQa * 100) / 100,
        qualityTier: 'basic',   // 누적 BU는 항상 basic tier
        labelSource: session.labelSource ?? null,
        hasLabels: poolHasLabels,
        consentStatus: poolAllConsented ? 'PUBLIC_CONSENTED' : 'PRIVATE',
        piiStatus: poolAllPiiClear ? 'CLEAR' : 'SUSPECT',
        lockStatus: 'available',
        lockedByJobId: null,
        sessionDate: poolLastDate,
        userId: poolUserId,
        sourceSessionIds: [...poolSessionIds],
      })

      accumulatedBUs++

      // 60초 소비, 가중합도 비례 차감
      poolWeightedQa -= avgQa * 60
      poolSeconds -= 60

      // 풀이 비었으면 세션 목록 + 상태 리셋
      if (poolSeconds < 0.01) {
        poolSeconds = 0
        poolWeightedQa = 0
        poolSessionIds = []
        poolAllConsented = true
        poolAllPiiClear = true
        poolHasLabels = false
      }
    }
  }

  return {
    units: allUnits,
    pendingBalance: {
      userId: poolUserId ?? sorted[0]?.userId ?? 'unknown',
      pendingSeconds: Math.round(poolSeconds * 100) / 100,
      weightedQaSum: Math.round(poolWeightedQa * 100) / 100,
      sourceSessionIds: poolSessionIds,
      lastUpdated: new Date().toISOString(),
    },
    stats: {
      totalSessionsProcessed: sessions.length,
      sessionsDirectBU,
      sessionsAccumulated,
      sessionsSkipped,
      accumulatedBUs,
      remainderSecondsRecovered: Math.round(remainderSecondsRecovered * 100) / 100,
    },
  }
}

// ── 유닛 필터링 (Export Job용) ────────────────────────────────────────────────

const GRADE_ORDER: Record<string, number> = { A: 3, B: 2, C: 1 }

/** ExportJob 필터 + SKU 컴포넌트 조건으로 유닛 필터링.
 *  excludeBuIds: per-client 기납품 BU ID Set (optional) */
export function filterUnitsForJob(
  units: BillableUnit[],
  filters: ExportJobFilters,
  componentIds: SkuComponentId[],
  excludeBuIds?: Set<string>,
): BillableUnit[] {
  // 컴포넌트 필터 조건 병합
  const mergedFilter = mergeComponentFilters(componentIds)

  return units.filter(u => {
    // lock 상태: available만
    if (u.lockStatus !== 'available') return false

    // per-client 기납품 제외
    if (excludeBuIds && excludeBuIds.has(u.id)) return false

    // Job 필터: 최소 등급
    if (filters.minQualityGrade) {
      if (GRADE_ORDER[u.qualityGrade] < GRADE_ORDER[filters.minQualityGrade]) return false
    }

    // Job 필터: 품질 티어
    if (filters.qualityTier && filters.qualityTier.length > 0) {
      if (!filters.qualityTier.includes(u.qualityTier)) return false
    }

    // Job 필터: 라벨 소스
    if (filters.labelSource && filters.labelSource.length > 0) {
      if (!u.labelSource || !filters.labelSource.includes(u.labelSource)) return false
    }

    // Job 필터: 동의 필수
    if (filters.requireConsent && u.consentStatus !== 'PUBLIC_CONSENTED') return false

    // Job 필터: PII 정제 필수
    if (filters.requirePiiCleaned && u.piiStatus !== 'REVIEWED' && u.piiStatus !== 'CLEAR') return false

    // Job 필터: 날짜 범위
    if (filters.dateRange) {
      if (u.sessionDate < filters.dateRange.from || u.sessionDate > filters.dateRange.to) return false
    }

    // Job 필터: 사용자 제한
    if (filters.userIds.length > 0) {
      if (!u.userId || !filters.userIds.includes(u.userId)) return false
    }

    // 컴포넌트 필터: 최소 등급
    if (mergedFilter.minQualityGrade) {
      if (GRADE_ORDER[u.qualityGrade] < GRADE_ORDER[mergedFilter.minQualityGrade]) return false
    }

    // 컴포넌트 필터: 라벨 소스
    if (mergedFilter.labelSource && mergedFilter.labelSource.length > 0) {
      if (!u.labelSource || !mergedFilter.labelSource.includes(u.labelSource as 'user_confirmed' | 'multi_confirmed')) return false
    }

    // 컴포넌트 필터: PII
    if (mergedFilter.requirePiiCleaned && u.piiStatus !== 'REVIEWED' && u.piiStatus !== 'CLEAR') return false

    // 컴포넌트 필터: 동의
    if (mergedFilter.requireConsent && u.consentStatus !== 'PUBLIC_CONSENTED') return false

    return true
  })
}

/** 여러 컴포넌트의 filterCriteria를 가장 엄격한 조건으로 병합 */
function mergeComponentFilters(componentIds: SkuComponentId[]) {
  let minGrade: 'A' | 'B' | 'C' | undefined
  let labelSource: ('user_confirmed' | 'multi_confirmed')[] | undefined
  let requirePii = false
  let requireConsent = false

  for (const cid of componentIds) {
    const comp = SKU_COMPONENT_CATALOG.find(c => c.id === cid)
    if (!comp) continue
    const cf = comp.filterCriteria

    if (cf.minQualityGrade) {
      if (!minGrade || GRADE_ORDER[cf.minQualityGrade] > GRADE_ORDER[minGrade]) {
        minGrade = cf.minQualityGrade
      }
    }
    if (cf.labelSource) {
      labelSource = cf.labelSource
    }
    if (cf.requirePiiCleaned) requirePii = true
    if (cf.requireConsent) requireConsent = true
  }

  return { minQualityGrade: minGrade, labelSource, requirePiiCleaned: requirePii, requireConsent }
}

// ── 샘플링 ───────────────────────────────────────────────────────────────────

/** 수량 제한 샘플링 */
export function sampleUnits(
  eligible: BillableUnit[],
  count: number,
  strategy: SamplingStrategy,
): BillableUnit[] {
  if (strategy === 'all' || eligible.length <= count) {
    return eligible.slice(0, count)
  }

  switch (strategy) {
    case 'random':
      return fisherYatesSample(eligible, count)

    case 'quality_first':
      return [...eligible]
        .sort((a, b) => b.qaScore - a.qaScore)
        .slice(0, count)

    case 'stratified':
      return stratifiedSample(eligible, count)

    default:
      return eligible.slice(0, count)
  }
}

function fisherYatesSample(arr: BillableUnit[], count: number): BillableUnit[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

function stratifiedSample(eligible: BillableUnit[], count: number): BillableUnit[] {
  const byGrade: Record<string, BillableUnit[]> = { A: [], B: [], C: [] }
  for (const u of eligible) byGrade[u.qualityGrade].push(u)

  const total = eligible.length
  const result: BillableUnit[] = []

  for (const grade of ['A', 'B', 'C'] as const) {
    const proportion = byGrade[grade].length / total
    const allocation = Math.round(count * proportion)
    // 등급 내에서는 랜덤
    const sampled = fisherYatesSample(byGrade[grade], allocation)
    for (const u of sampled) result.push(u)
  }

  // 반올림 차이로 count와 다를 수 있음 → 부족하면 추가, 초과하면 자르기
  if (result.length < count) {
    const remaining = eligible.filter(u => !result.includes(u))
    const extra = fisherYatesSample(remaining, count - result.length)
    for (const u of extra) result.push(u)
  }

  return result.slice(0, count)
}

// ── 요약 통계 ─────────────────────────────────────────────────────────────────

export type BillableUnitSummary = BillableUnitStats & {
  totalEffectiveHours: number
}

export function summarizeUnits(units: BillableUnit[]): BillableUnitSummary {
  const stats: BillableUnitSummary = {
    total: units.length,
    available: 0,
    locked: 0,
    delivered: 0,
    byGrade: { A: 0, B: 0, C: 0 },
    byTier: { basic: 0, verified: 0, gold: 0 },
    byConsent: { consented: 0, private: 0 },
    totalEffectiveHours: 0,
  }

  for (const u of units) {
    if (u.lockStatus === 'available') stats.available++
    else if (u.lockStatus === 'locked_for_job') stats.locked++
    else if (u.lockStatus === 'delivered') stats.delivered++

    stats.byGrade[u.qualityGrade]++
    stats.byTier[u.qualityTier]++

    if (u.consentStatus === 'PUBLIC_CONSENTED') stats.byConsent.consented++
    else stats.byConsent.private++

    stats.totalEffectiveHours += u.effectiveSeconds / 3600
  }

  stats.totalEffectiveHours = Math.round(stats.totalEffectiveHours * 100) / 100
  return stats
}
