// ── 라벨 신뢰도 스코어링 ─────────────────────────────────────────────────────
// 클릭 농사(click farming) 방지
// spec: docs/data-spec-v2.md § 품질/신뢰 리포트 스키마

export type ValidationFlag = 'ok' | 'fast_click' | 'same_label_spam' | 'over_quota'

export type UserReliabilityTier = 'A' | 'B' | 'C'

export type LabelTrustResult = {
  rawScore: number           // 0~1
  adjustedScore: number      // tier 적용 후 0~1
  validationFlag: ValidationFlag
  latencyPenalty: number
  repeatDecay: number
  editCount: number          // 저장 전 수정 횟수 (0 = 첫 선택 그대로)
  editPenalty: number        // editCount 기반 패널티 (0 = 없음)
}

const DAILY_QUOTA = 200

const TIER_MULTIPLIER: Record<UserReliabilityTier, number> = {
  A: 1.1,
  B: 1.0,
  C: 0.3,
}

function calcLatencyPenalty(ms: number): number {
  if (ms < 600) return -0.35
  if (ms < 1000) return -0.20
  if (ms < 1500) return -0.10
  return 0
}

function calcRepeatDecay(consecutiveCount: number): number {
  if (consecutiveCount <= 3) return 1.0
  if (consecutiveCount <= 6) return 0.8
  if (consecutiveCount <= 10) return 0.5
  if (consecutiveCount <= 20) return 0.3
  return 0.15
}

// editCount 패널티: 0회 편집=없음, 1-2회=경미, 3-5회=-0.05, 6+회=-0.10
function calcEditPenalty(editCount: number): number {
  if (editCount <= 0) return 0
  if (editCount <= 2) return -0.02
  if (editCount <= 5) return -0.05
  return -0.10
}

export function calcLabelTrust(
  params: {
    inputLatencyMs: number
    consecutiveSameLabel: number
    todayLabelCount: number
    editCount?: number    // 저장 전 수정 횟수 (미제공 시 0)
  },
  userTier: UserReliabilityTier = 'B',
): LabelTrustResult {
  const latencyPenalty = calcLatencyPenalty(params.inputLatencyMs)
  const repeatDecay = calcRepeatDecay(params.consecutiveSameLabel)
  const editCount = params.editCount ?? 0
  const editPenalty = calcEditPenalty(editCount)

  let validationFlag: ValidationFlag = 'ok'
  if (params.todayLabelCount >= DAILY_QUOTA) validationFlag = 'over_quota'
  else if (params.consecutiveSameLabel > 6) validationFlag = 'same_label_spam'
  else if (params.inputLatencyMs < 600) validationFlag = 'fast_click'

  const rawScore = Math.max(0, Math.min(1, 1.0 + latencyPenalty + editPenalty)) * repeatDecay
  const adjustedScore = Math.min(1, rawScore * TIER_MULTIPLIER[userTier])

  return {
    rawScore: Math.round(rawScore * 100) / 100,
    adjustedScore: Math.round(adjustedScore * 100) / 100,
    validationFlag,
    latencyPenalty,
    repeatDecay,
    editCount,
    editPenalty,
  }
}

export function calcUserReliabilityTier(avgTrustScore: number): UserReliabilityTier {
  if (avgTrustScore >= 0.8) return 'A'
  if (avgTrustScore >= 0.5) return 'B'
  return 'C'
}

// ── localStorage 라벨 통계 ────────────────────────────────────────────────────

export type LabelStats = {
  todayDate: string
  todayCount: number
  allTimeCount: number
  avgTrustScore: number
  consecutiveSameLabel: number
  lastLabel: string | null
}

const LABEL_STATS_KEY = 'uncounted_label_stats'

export function loadLabelStats(): LabelStats {
  try {
    const stored = localStorage.getItem(LABEL_STATS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as LabelStats
      const today = new Date().toISOString().slice(0, 10)
      if (parsed.todayDate !== today) {
        return { ...parsed, todayDate: today, todayCount: 0, consecutiveSameLabel: 0 }
      }
      return parsed
    }
  } catch {
    // ignore
  }
  return {
    todayDate: new Date().toISOString().slice(0, 10),
    todayCount: 0,
    allTimeCount: 0,
    avgTrustScore: 0.8,
    consecutiveSameLabel: 0,
    lastLabel: null,
  }
}

export function recordLabelEvent(label: string, trustResult: LabelTrustResult): void {
  const stats = loadLabelStats()
  const consecutive =
    label === stats.lastLabel ? stats.consecutiveSameLabel + 1 : 1
  const newAllTime = stats.allTimeCount + 1
  const newAvg =
    (stats.avgTrustScore * stats.allTimeCount + trustResult.adjustedScore) / newAllTime

  localStorage.setItem(
    LABEL_STATS_KEY,
    JSON.stringify({
      todayDate: stats.todayDate,
      todayCount: stats.todayCount + 1,
      allTimeCount: newAllTime,
      avgTrustScore: Math.round(newAvg * 1000) / 1000,
      consecutiveSameLabel: consecutive,
      lastLabel: label,
    } satisfies LabelStats),
  )
}

export function getValidationMessage(flag: ValidationFlag): string | null {
  switch (flag) {
    case 'fast_click':
      return '빠른 클릭 감지 — 충분히 생각하고 라벨을 선택해주세요'
    case 'same_label_spam':
      return '같은 라벨이 반복됩니다 — 신뢰도가 낮아집니다'
    case 'over_quota':
      return '오늘 라벨링 한도(200개)에 도달했습니다'
    default:
      return null
  }
}
