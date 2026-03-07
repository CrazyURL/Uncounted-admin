// ── Refinery Engine ───────────────────────────────────────────────────────────
// Section B(정제소) & Section C(판매 준비)에 필요한 데이터 집계
// audioMetrics가 없는 Supabase 세션도 graceful fallback 처리

import { type Session } from '../types/session'
import { SKU_CATALOG, type SkuDefinition, type EligibilityStatus } from '../types/sku'
import { loadProfile } from '../types/userProfile'
import { type EventInventorySummary } from '../types/eventUnit'

// ── 정제소(Refinery) 타입 ─────────────────────────────────────────────────────

export type ImprovementHint = {
  field: string
  issue: string
  impact: 'high' | 'med' | 'low'
  cta: string
  affectedCount: number
}

export type RefineryMetrics = {
  validSpeechRatio: number    // 유효 발화 비율 (0~1)
  avgSnrDb: number            // 평균 SNR (dB)
  clippingCount: number       // 클리핑 감지 세션 수
  silentHeavyCount: number    // 무음 40% 초과 세션 수
  lowQualityCount: number     // qaScore < 60 세션 수
  duplicateSuspected: number  // 중복 의심 수
  hasRealMetrics: boolean     // audioMetrics 실측 여부
  improvements: ImprovementHint[]
}

export function calcRefineryMetrics(sessions: Session[]): RefineryMetrics {
  const empty: RefineryMetrics = {
    validSpeechRatio: 0, avgSnrDb: 0, clippingCount: 0,
    silentHeavyCount: 0, lowQualityCount: 0, duplicateSuspected: 0,
    hasRealMetrics: false, improvements: [],
  }
  if (sessions.length === 0) return empty

  const withMetrics = sessions.filter((s) => s.audioMetrics !== null)
  const hasRealMetrics = withMetrics.length > 0

  let validSpeechRatio = 0.75
  let avgSnrDb = 22
  let clippingCount = 0
  let silentHeavyCount = 0

  if (hasRealMetrics) {
    const avgSilence =
      withMetrics.reduce((s, ss) => s + ss.audioMetrics!.silenceRatio, 0) / withMetrics.length
    validSpeechRatio = 1 - avgSilence
    avgSnrDb =
      withMetrics.reduce((s, ss) => s + ss.audioMetrics!.snrDb, 0) / withMetrics.length
    clippingCount = withMetrics.filter((ss) => ss.audioMetrics!.clippingRatio > 0.01).length
    silentHeavyCount = withMetrics.filter((ss) => ss.audioMetrics!.silenceRatio > 0.4).length
  }

  const lowQualityCount = sessions.filter((s) => (s.qaScore ?? 0) < 60).length

  // 중복 의심: 같은 날짜 + 유사 길이(±10초 버킷)
  const seen = new Set<string>()
  let duplicateSuspected = 0
  for (const s of sessions) {
    const key = `${s.date}_${Math.round(s.duration / 10)}`
    if (seen.has(key)) duplicateSuspected++
    else seen.add(key)
  }

  const improvements: ImprovementHint[] = []

  if (hasRealMetrics && silentHeavyCount > 0) {
    improvements.push({
      field: '무음 과다',
      issue: `${silentHeavyCount.toLocaleString()}개 파일 무음 40% 초과`,
      impact: 'high',
      cta: '해당 파일 제외 시 usable hours +15%',
      affectedCount: silentHeavyCount,
    })
  }
  if (hasRealMetrics && avgSnrDb < 20) {
    const noisy = withMetrics.filter((s) => s.audioMetrics!.snrDb < 20).length
    improvements.push({
      field: '배경 소음',
      issue: `평균 SNR ${avgSnrDb.toFixed(1)}dB — 잡음 높음`,
      impact: 'high',
      cta: '조용한 환경 녹음 권장',
      affectedCount: noisy,
    })
  }
  if (hasRealMetrics && clippingCount > 0) {
    improvements.push({
      field: '클리핑',
      issue: `${clippingCount.toLocaleString()}개 파일 음량 클리핑`,
      impact: 'med',
      cta: '마이크 볼륨 낮추거나 거리 조정',
      affectedCount: clippingCount,
    })
  }
  if (lowQualityCount > 0) {
    improvements.push({
      field: '낮은 품질',
      issue: `${lowQualityCount.toLocaleString()}개 파일 QA < 60점`,
      impact: 'med',
      cta: '라벨 추가 시 가치 상승 가능',
      affectedCount: lowQualityCount,
    })
  }
  if (duplicateSuspected > 0) {
    improvements.push({
      field: '중복 의심',
      issue: `${duplicateSuspected.toLocaleString()}개 파일 중복 가능성`,
      impact: 'low',
      cta: '중복 제거 시 데이터셋 품질 향상',
      affectedCount: duplicateSuspected,
    })
  }

  return {
    validSpeechRatio: Math.round(validSpeechRatio * 100) / 100,
    avgSnrDb: Math.round(avgSnrDb * 10) / 10,
    clippingCount,
    silentHeavyCount,
    lowQualityCount,
    duplicateSuspected,
    hasRealMetrics,
    improvements,
  }
}

// ── SKU 판매 준비도(Readiness) ────────────────────────────────────────────────

export type SkuReadiness = {
  sku: SkuDefinition
  status: EligibilityStatus
  fitPct: number        // 0~100
  eligibleCount: number
  totalCount: number
  nextAction: string | null
}

export function calcSkuReadiness(
  sessions: Session[],
  eventInventory?: EventInventorySummary,
): SkuReadiness[] {
  const labeled = sessions.filter((s) => s.labels !== null)
  const withDomain = sessions.filter((s) => s.labels?.domain || s.labels?.purpose)

  return SKU_CATALOG.map((sku): SkuReadiness => {
    if (!sku.isAvailableMvp) {
      return {
        sku, status: 'not_eligible', fitPct: 0,
        eligibleCount: 0, totalCount: sessions.length,
        nextAction: sku.unavailableReason ?? null,
      }
    }

    let eligibleCount = 0
    let fitPct = 0
    let nextAction: string | null = null

    if (sessions.length === 0) {
      return { sku, status: 'not_eligible', fitPct: 0, eligibleCount: 0, totalCount: 0, nextAction: '자산 스캔 필요' }
    }

    switch (sku.id) {
      case 'U-A01': {
        eligibleCount = sessions.filter((s) => (s.qaScore ?? 0) >= 50 && s.duration >= 30).length
        fitPct = Math.round((eligibleCount / sessions.length) * 100)
        if (fitPct < 80) nextAction = `품질 개선 필요 (${(sessions.length - eligibleCount).toLocaleString()}개)`
        break
      }
      case 'U-A02': {
        eligibleCount = labeled.length
        fitPct = Math.round((labeled.length / sessions.length) * 100)
        const needed = Math.max(0, Math.ceil(sessions.length * 0.3) - labeled.length)
        if (needed > 0) nextAction = `라벨 ${needed.toLocaleString()}건 추가 필요`
        break
      }
      case 'U-A03': {
        eligibleCount = withDomain.length
        fitPct = Math.round((withDomain.length / sessions.length) * 100)
        if (fitPct < 20) nextAction = '라벨 도메인/목적 항목 입력 필요'
        break
      }
      // ── 세션 파생 메타 (sessions.length 유지) ──
      case 'U-M01': {
        // 통화 메타: 세션에서 파생
        eligibleCount = sessions.length
        fitPct = sessions.length > 0 ? 100 : 0
        break
      }
      // ── 이벤트 기반 메타 SKU (실제 이벤트 수 사용) ──
      case 'U-M05': {
        const evtCount = eventInventory?.bySkuId['U-M05'] ?? 0
        const profile5 = loadProfile()
        const contextFields = [
          profile5?.region_group,
          profile5?.common_env,
          profile5?.common_device_mode,
        ]
        const filledCount = contextFields.filter((f) => f !== null && f !== undefined).length
        eligibleCount = evtCount
        // 이벤트 존재 40% + 프로필 컨텍스트 필드당 20% (최대 60%)
        fitPct = evtCount > 0 ? Math.min(100, 40 + filledCount * 20) : filledCount > 0 ? filledCount * 15 : 0
        const missing = 3 - filledCount
        if (evtCount === 0 && filledCount === 0) nextAction = '자동 수집 대기 중'
        else if (missing > 0) nextAction = `프로필 컨텍스트 ${missing}개 항목 입력 필요`
        break
      }
      case 'U-M06': {
        const evtCount = eventInventory?.bySkuId['U-M06'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '음성 분석 후 자동 생성'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      case 'U-M07': {
        const evtCount = eventInventory?.bySkuId['U-M07'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '통화 기록 분석 후 자동 생성'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      case 'U-M08': {
        const evtCount = eventInventory?.bySkuId['U-M08'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 50 ? 90 : evtCount > 0 ? Math.round((evtCount / 50) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 50) nextAction = `현재 ${evtCount.toLocaleString()}건 (50건 이상 권장)`
        break
      }
      case 'U-M09': {
        const evtCount = eventInventory?.bySkuId['U-M09'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 50 ? 90 : evtCount > 0 ? Math.round((evtCount / 50) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 50) nextAction = `현재 ${evtCount.toLocaleString()}건 (50건 이상 권장)`
        break
      }
      case 'U-M10': {
        const evtCount = eventInventory?.bySkuId['U-M10'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      case 'U-M11': {
        const evtCount = eventInventory?.bySkuId['U-M11'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      case 'U-M13': {
        const evtCount = eventInventory?.bySkuId['U-M13'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      case 'U-M14': {
        const evtCount = eventInventory?.bySkuId['U-M14'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      case 'U-M16': {
        const evtCount = eventInventory?.bySkuId['U-M16'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 10 ? 90 : evtCount > 0 ? Math.round((evtCount / 10) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 10) nextAction = `현재 ${evtCount.toLocaleString()}건 (10건 이상 권장)`
        break
      }
      case 'U-M18': {
        const evtCount = eventInventory?.bySkuId['U-M18'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 20 ? 90 : evtCount > 0 ? Math.round((evtCount / 20) * 90) : 0
        if (evtCount === 0) nextAction = '자동 수집 대기 중'
        else if (evtCount < 20) nextAction = `현재 ${evtCount.toLocaleString()}건 (20건 이상 권장)`
        break
      }
      case 'U-P01': {
        const evtCount = eventInventory?.bySkuId['U-P01'] ?? 0
        eligibleCount = evtCount
        fitPct = evtCount >= 30 ? 90 : evtCount > 0 ? Math.round((evtCount / 30) * 90) : 0
        if (evtCount === 0) nextAction = '사진 스캔 대기 중'
        else if (evtCount < 30) nextAction = `현재 ${evtCount.toLocaleString()}건 (30건 이상 권장)`
        break
      }
      default: {
        // isAvailableMvp=true이지만 아직 매핑 안 된 케이스 → 세션 있으면 기본 가능
        eligibleCount = sessions.length
        fitPct = sessions.length > 0 ? 60 : 0
        if (sessions.length === 0) nextAction = '자산 스캔 필요'
      }
    }

    // MVP 메타 SKU는 자동 수집 중이므로 이벤트 0건이어도 needs_work (not_eligible 아님)
    let status: EligibilityStatus =
      fitPct >= 70 ? 'eligible' : fitPct >= 25 ? 'needs_work' : 'not_eligible'
    if (status === 'not_eligible' && sku.isAvailableMvp && sku.unitType === 'META_EVENT') {
      status = 'needs_work'
    }

    // 메타 SKU: totalCount = 실제 이벤트 수, 음성 SKU: totalCount = sessions.length
    const totalCount = sku.unitType === 'META_EVENT'
      ? (eventInventory?.bySkuId[sku.id] ?? 0)
      : sessions.length

    return { sku, status, fitPct, eligibleCount, totalCount, nextAction }
  })
}
