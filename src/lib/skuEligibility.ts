// ── SKU 적합도 엔진 — 8 SKU + 번들 P1/P2/P3 ──────────────────────────────────
// calcSkuReadiness (refineryEngine.ts) 의 번들 확장 + 레코드 단위 상세 평가

import { type Session } from '../types/session'
import {
  type SkuId,
  type EligibilityStatus,
  BUNDLE_CATALOG,
  type BundleId,
  type BundleDefinition,
} from '../types/sku'
import { type AudioScanRecord, type AudioScanAggregate } from '../types/audioAsset'

// ── 번들 적합도 ────────────────────────────────────────────────────────────────

export type BundleEligibility = {
  bundle: BundleDefinition
  status: EligibilityStatus
  fitPct: number
  eligibleCount: number
  totalCount: number
  nextAction: string | null
  requiresLabelCount: number  // 추가 라벨 필요 수 (0이면 충분)
}

export function calcBundleEligibility(
  sessions: Session[],
  aggregate: AudioScanAggregate | null,
): BundleEligibility[] {
  const total = sessions.length

  return BUNDLE_CATALOG.map((bundle): BundleEligibility => {
    if (!bundle.isAvailableMvp) {
      return {
        bundle, status: 'not_eligible', fitPct: 0,
        eligibleCount: 0, totalCount: total,
        nextAction: bundle.unavailableReason ?? null,
        requiresLabelCount: 0,
      }
    }

    if (total === 0) {
      return {
        bundle, status: 'not_eligible', fitPct: 0,
        eligibleCount: 0, totalCount: 0,
        nextAction: '자산 스캔 필요',
        requiresLabelCount: 0,
      }
    }

    let eligibleCount = 0
    let nextAction: string | null = null
    let requiresLabelCount = 0

    switch (bundle.id) {
      case 'P1': {
        // U-M05 기반 + 사용자 환경 라벨 (현재 UserProfile로 대체)
        const baseEligible = aggregate?.skuEligibleCounts?.['U-M05'] ?? total
        const withLabel = sessions.filter(
          (s) => s.labels?.domain || s.labels?.purpose
        ).length
        eligibleCount = Math.min(baseEligible, withLabel || baseEligible)
        const needed = Math.max(0, Math.ceil(total * 0.3) - withLabel)
        requiresLabelCount = needed
        if (needed > 0) nextAction = `라벨 ${needed.toLocaleString()}건 추가 시 P1 적합도 향상`
        break
      }
      case 'P2': {
        // U-M02 미지원
        eligibleCount = 0
        nextAction = 'U-M02 특수 권한 필요 — v2 일정'
        break
      }
      case 'P3': {
        // U-M05 + 생활 루틴 라벨 (목적/도메인)
        const baseEligible = aggregate?.skuEligibleCounts?.['U-M05'] ?? total
        const withRoutineLabel = sessions.filter(
          (s) => s.labels?.purpose !== null && s.labels?.purpose !== undefined
        ).length
        eligibleCount = Math.min(baseEligible, withRoutineLabel || baseEligible)
        const needed = Math.max(0, Math.ceil(total * 0.3) - withRoutineLabel)
        requiresLabelCount = needed
        if (needed > 0) nextAction = `목적 라벨 ${needed.toLocaleString()}건 추가 시 P3 적합도 향상`
        break
      }
    }

    const fitPct = total > 0 ? Math.round((eligibleCount / total) * 100) : 0
    const status: EligibilityStatus =
      fitPct >= 70 ? 'eligible' : fitPct >= 25 ? 'needs_work' : 'not_eligible'

    return { bundle, status, fitPct, eligibleCount, totalCount: total, nextAction, requiresLabelCount }
  })
}

// ── 레코드 단위 SKU 적합 여부 ────────────────────────────────────────────────
// 개별 AudioScanRecord + Session에 대해 각 SKU의 적합 여부 판단

export type RecordSkuFlags = Partial<Record<SkuId, boolean>>

export function checkRecordSkuEligibility(
  record: AudioScanRecord,
  session: Session,
): RecordSkuFlags {
  const hasLabel = session.labels !== null
  const hasDomainOrPurpose = !!(session.labels?.domain || session.labels?.purpose)
  const hasTone = !!session.labels?.tone
  const meetsBaseQuality = record.qualityScore >= 50 && record.durationSec >= 30 && !record.duplicateFlag

  return {
    'U-A01': meetsBaseQuality,
    'U-A02': meetsBaseQuality && hasLabel,
    'U-A03': meetsBaseQuality && hasLabel && (hasDomainOrPurpose || hasTone || !!session.labels?.primarySpeechAct || (session.labels?.speechActEvents?.length ?? 0) > 0),
    'U-M01': true,   // 동의 기반 (항상 가능)
    'U-M02': false,  // MVP 불가
    'U-M03': false,  // 정책 High → 자기보고 대체
    'U-M04': false,  // 정책 High → 자기보고 대체
    'U-M05': true,   // 항상 가능
  }
}

// ── SKU별 개선 힌트 ───────────────────────────────────────────────────────────

export type SkuImprovementHint = {
  skuId: SkuId
  blockingReasons: string[]
  improvementCtas: string[]
}

export function getSkuImprovementHints(
  skuId: SkuId,
  sessions: Session[],
  aggregate: AudioScanAggregate | null,
): SkuImprovementHint {
  const total = sessions.length
  const baseHints: SkuImprovementHint = {
    skuId, blockingReasons: [], improvementCtas: [],
  }

  if (total === 0) {
    return {
      ...baseHints,
      blockingReasons: ['데이터 없음'],
      improvementCtas: ['자산 스캔을 먼저 실행하세요'],
    }
  }

  switch (skuId) {
    case 'U-A01': {
      const grade = aggregate?.qualityGradeDistribution
      if (!grade) break
      const cCount = grade.C
      if (cCount > 0) {
        baseHints.blockingReasons.push(`C등급 파일 ${cCount.toLocaleString()}개 — 잡음/무음 과다`)
        baseHints.improvementCtas.push('조용한 환경 녹음 권장 (SNR 20dB 이상 목표)')
      }
      const dupl = aggregate?.duplicateHoursEstimate ?? 0
      if (dupl > 0.1) {
        baseHints.blockingReasons.push(`중복 의심 ${dupl.toFixed(1)}시간`)
        baseHints.improvementCtas.push('중복 파일 제거 시 데이터셋 품질 향상')
      }
      break
    }
    case 'U-A02': {
      const unlabeled = sessions.filter((s) => s.labels === null).length
      if (unlabeled > 0) {
        baseHints.blockingReasons.push(`라벨 미완성 ${unlabeled.toLocaleString()}건`)
        baseHints.improvementCtas.push(`라벨링 완료 시 U-A02 적합 세션 +${unlabeled.toLocaleString()}건`)
      }
      break
    }
    case 'U-A03': {
      const noDomain = sessions.filter(
        (s) => !s.labels?.domain && !s.labels?.purpose
      ).length
      if (noDomain > 0) {
        baseHints.blockingReasons.push(`도메인/목적 라벨 없음 ${noDomain.toLocaleString()}건`)
        baseHints.improvementCtas.push('도메인·목적 라벨 입력 시 U-A03 적합도 상승')
      }
      break
    }
    case 'U-M01':
      baseHints.improvementCtas.push('통화 메타데이터 수집 동의 후 자동 적립')
      break
    case 'U-M02':
      baseHints.blockingReasons.push('PACKAGE_USAGE_STATS 특수 권한 필요')
      baseHints.improvementCtas.push('v2 출시 후 활성화 예정')
      break
    case 'U-M03':
      baseHints.blockingReasons.push('자동 수집 정책 제한 (키로깅 유사 위험)')
      baseHints.improvementCtas.push('일일 자기보고 대체 사용 (10초, 선택)')
      break
    case 'U-M04':
      baseHints.blockingReasons.push('접근성 서비스 정책 제한')
      baseHints.improvementCtas.push('일일 자기보고 대체 사용 (10초, 선택)')
      break
    case 'U-M05':
      baseHints.improvementCtas.push('기기 상태 자동 수집 — 별도 조치 불필요')
      break
  }

  return baseHints
}

// ── 번들 ID 타입 re-export ────────────────────────────────────────────────────
export type { BundleId }
