// ── 가치화 엔진 v2 ────────────────────────────────────────────────────────────
// 핵심 원칙: "단일 확정값 표시 금지. 항상 범위 + 조건 표시."
// spec: docs/data-spec-v2.md § 가치화 엔진

import { type Session } from '../types/session'
import { type QualityGrade } from '../types/sku'
import { type ContributorLevel } from './contributorLevel'

export type ValueRange = {
  low: number
  high: number
}

export type ValueEngineOpts = {
  profileComplete?: boolean
  contributorLevel?: ContributorLevel
  userConfirmedRatio?: number    // user_confirmed / total labeled (0~1)
  /** BU 기반 유효시간 (제공 시 세션 기반 대신 사용) */
  buEffectiveHours?: number
  /** BU 총 개수 */
  buCount?: number
  /** 누적 대기 잔여초 */
  pendingSeconds?: number
}

export type ValueBreakdown = {
  totalHours: number               // 총 음성 시간
  usableHours: number              // 유효발화 추정 시간
  buCount: number                  // Billable Unit 수 (0이면 BU 미사용)
  pendingSeconds: number           // 누적 대기 잔여초
  qualityGrade: QualityGrade
  qualityMultiplier: number
  labeledRatio: number             // 0~1 (라벨 완성 비율)
  labelMultiplierRange: { min: number; max: number }
  complianceMultiplier: number
  profileMultiplier: number
  labelSourceMultiplier: number
  contributorMultiplier: number
  range: ValueRange                // 최종 가치 범위 (₩)
  conditions: string[]             // 조건부 설명 (조건 미충족 이유)
  ctas: string[]                   // "이렇게 하면 가치가 올라갑니다" 힌트
}

// ₩/usable_hour
const BASE_RATE_LOW = 15000   // 보수적 시나리오
const BASE_RATE_HIGH = 45000  // 낙관적 시나리오

const QUALITY_MULTIPLIER: Record<QualityGrade, number> = {
  A: 1.2,
  B: 1.0,
  C: 0.6,
}

export function calcQualityGrade(avgQaScore: number): QualityGrade {
  if (avgQaScore >= 80) return 'A'
  if (avgQaScore >= 60) return 'B'
  return 'C'
}

function calcLabelMultiplierRange(
  labeledRatio: number,
  avgTrustScore: number,
): { min: number; max: number } {
  if (labeledRatio === 0) return { min: 1.0, max: 1.0 }
  const trustQualified = avgTrustScore >= 0.8
  const boost = labeledRatio * 0.3  // 최대 +30%
  return {
    min: 1.0 + (trustQualified ? boost * 0.7 : boost * 0.3),
    max: 1.0 + (trustQualified ? boost * 1.0 : boost * 0.5),
  }
}

export function calcValueBreakdown(
  sessions: Session[],
  avgTrustScore: number = 0.8,
  isComplianceComplete: boolean = false,
  opts?: ValueEngineOpts,
): ValueBreakdown {
  const empty: ValueBreakdown = {
    totalHours: 0,
    usableHours: 0,
    buCount: 0,
    pendingSeconds: 0,
    qualityGrade: 'C',
    qualityMultiplier: 0.6,
    labeledRatio: 0,
    labelMultiplierRange: { min: 1.0, max: 1.0 },
    complianceMultiplier: 0.5,
    profileMultiplier: 1.0,
    labelSourceMultiplier: 1.0,
    contributorMultiplier: 1.0,
    range: { low: 0, high: 0 },
    conditions: ['음성 데이터가 없습니다'],
    ctas: ['자산 스캔을 먼저 실행하세요'],
  }

  if (sessions.length === 0) return empty

  // ── 시간 계산 ────────────────────────────────────────────────────────────
  let totalHours = 0
  for (const s of sessions) {
    totalHours += s.duration / 3600
  }

  // BU 기반 유효시간이 있으면 우선 사용 (더 정확한 산정)
  let usableHours = 0
  if (opts?.buEffectiveHours != null) {
    usableHours = opts.buEffectiveHours
  } else {
    for (const s of sessions) {
      const h = s.duration / 3600
      if (s.audioMetrics) {
        usableHours += h * (1 - s.audioMetrics.silenceRatio)
      } else {
        usableHours += h * 0.75 // 실측 없을 때 25% 무음 가정
      }
    }
  }

  // ── 품질 ────────────────────────────────────────────────────────────────
  const avgQa = sessions.reduce((sum, s) => sum + (s.qaScore ?? 0), 0) / sessions.length
  const qualityGrade = calcQualityGrade(avgQa)
  const qualityMultiplier = QUALITY_MULTIPLIER[qualityGrade]

  // ── 라벨 ────────────────────────────────────────────────────────────────
  const labeledCount = sessions.filter((s) => s.labels !== null).length
  const labeledRatio = labeledCount / sessions.length
  const labelMultiplierRange = calcLabelMultiplierRange(labeledRatio, avgTrustScore)

  // ── 컴플라이언스 ─────────────────────────────────────────────────────────
  const complianceMultiplier = isComplianceComplete ? 1.0 : 0.7

  // ── 프로필 / 라벨출처 / 기여자 멀티플라이어 ──────────────────────────────
  const profileMultiplier = opts?.profileComplete ? 1.05 : 1.0
  const labelSourceMultiplier = (opts?.userConfirmedRatio ?? 0) >= 0.5 ? 1.07 : 1.0
  const contributorMultiplier = opts?.contributorLevel === 'certified' ? 1.15
    : opts?.contributorLevel === 'verified' ? 1.05 : 1.0

  // ── 가치 범위 ────────────────────────────────────────────────────────────
  const rangeLow = Math.round(
    usableHours * BASE_RATE_LOW * qualityMultiplier * labelMultiplierRange.min
    * complianceMultiplier * profileMultiplier * labelSourceMultiplier * contributorMultiplier,
  )
  const rangeHigh = Math.round(
    usableHours * BASE_RATE_HIGH * qualityMultiplier * labelMultiplierRange.max
    * complianceMultiplier * profileMultiplier * labelSourceMultiplier * contributorMultiplier,
  )

  // ── 조건 + CTA ───────────────────────────────────────────────────────────
  const conditions: string[] = []
  const ctas: string[] = []

  if (!isComplianceComplete) {
    conditions.push('개인정보 동의 미완료 — ×0.7 적용 중')
    ctas.push('개인정보 처리 동의 완료 시 가치 +43% 상승')
  }
  if (qualityGrade === 'C') {
    conditions.push('품질 등급 C — 잡음이 많거나 무음 비율이 높습니다')
    ctas.push('잡음 많은 파일 제외 시 품질 등급 B 이상 가능')
  } else if (qualityGrade === 'B') {
    conditions.push('품질 등급 B — 고품질 파일 추가 시 A 등급 가능')
    ctas.push('QA 80점 이상 세션을 늘리면 ×1.2 배수 적용')
  }
  if (labeledRatio < 0.5) {
    conditions.push(`라벨 완성률 ${Math.round(labeledRatio * 100)}% — 라벨 추가 시 단가 상승`)
    ctas.push('라벨링 완성 + 신뢰도 A 달성 시 최대 +30% 가치 상승')
  }
  if (avgTrustScore < 0.8) {
    conditions.push('라벨 신뢰도 낮음 — 가중치 감소 적용')
    ctas.push('충분한 시간을 두고 라벨링하면 신뢰도가 올라갑니다')
  }
  if (!opts?.profileComplete) {
    conditions.push('프로필 미완성 — x1.05 미적용')
    ctas.push('프로필 설정 완료 시 x1.05 가치 상승')
  }
  if ((opts?.userConfirmedRatio ?? 0) < 0.5) {
    conditions.push(`라벨 확인율 ${Math.round((opts?.userConfirmedRatio ?? 0) * 100)}% — x1.07 미적용`)
    ctas.push('자동 라벨 확인율 50% 이상 시 x1.07 가치 상승')
  }
  if (!opts?.contributorLevel || opts.contributorLevel === 'basic') {
    ctas.push('인증됨 등급 달성 시 x1.05 가치 상승')
  } else if (opts.contributorLevel === 'verified') {
    ctas.push('공인됨 등급 달성 시 x1.15 가치 상승')
  }

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    usableHours: Math.round(usableHours * 10) / 10,
    buCount: opts?.buCount ?? 0,
    pendingSeconds: opts?.pendingSeconds ?? 0,
    qualityGrade,
    qualityMultiplier,
    labeledRatio: Math.round(labeledRatio * 100) / 100,
    labelMultiplierRange: {
      min: Math.round(labelMultiplierRange.min * 100) / 100,
      max: Math.round(labelMultiplierRange.max * 100) / 100,
    },
    complianceMultiplier,
    profileMultiplier,
    labelSourceMultiplier,
    contributorMultiplier,
    range: { low: rangeLow, high: rangeHigh },
    conditions,
    ctas,
  }
}
