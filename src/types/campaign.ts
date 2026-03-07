export type CampaignId = 'BIZ' | 'SALES' | 'MIX'

export type Campaign = {
  id: CampaignId
  name: string
  description: string
  matchCriteria: {
    assetTypes?: string[]
    minDurationMin?: number
    maxDurationMin?: number
    minQaScore?: number
  }
  unitPrice: number      // ₩/min
  bonusLabel: string     // 예: "+20% 감정 라벨 보너스"
  requiredTier?: TierName
  badgeColor: string
  icon: string
}

export type TierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
export type TierKind = 'lifetime' | 'monthly'

export type TierInfo = {
  name: TierName
  minCP: number
  maxCP: number | null
  bonusPct: number         // CP 가중치 보너스 (%)
  benefits: string[]
}

export type MissionCode = 'LABEL_10' | 'DIALOG_ACT_5'

export type Mission = {
  code: MissionCode
  title: string
  description: string
  cpReward: number
  targetValue: number
  repeatable: boolean
}

export type ConsentLog = {
  campaignId: CampaignId
  action: 'join' | 'withdraw'
  ts: string // ISO
}

// ── Lifetime 티어 (누적 CP, 영구) ──────────────────────────────────────────────
export const LIFETIME_TIERS: TierInfo[] = [
  {
    name: 'Bronze',
    minCP: 0,
    maxCP: 49_999,
    bonusPct: 0,
    benefits: ['기본 SKU 참여'],
  },
  {
    name: 'Silver',
    minCP: 50_000,
    maxCP: 199_999,
    bonusPct: 2,
    benefits: ['기본 SKU 참여', '우선 매칭'],
  },
  {
    name: 'Gold',
    minCP: 200_000,
    maxCP: 499_999,
    bonusPct: 4,
    benefits: ['기본 SKU 참여', '우선 매칭', '프리미엄 SKU 접근'],
  },
  {
    name: 'Platinum',
    minCP: 500_000,
    maxCP: null,
    bonusPct: 5,
    benefits: ['모든 혜택', '프리미엄 SKU', '전담 리포트', '뱃지'],
  },
]

// ── Monthly 티어 (월간 CP, 매월 리셋) ──────────────────────────────────────────
export const MONTHLY_TIERS: TierInfo[] = [
  {
    name: 'Bronze',
    minCP: 0,
    maxCP: 9_999,
    bonusPct: 1,
    benefits: ['기본 보너스'],
  },
  {
    name: 'Silver',
    minCP: 10_000,
    maxCP: 39_999,
    bonusPct: 2,
    benefits: ['기본 보너스', '월간 리포트'],
  },
  {
    name: 'Gold',
    minCP: 40_000,
    maxCP: 99_999,
    bonusPct: 4,
    benefits: ['기본 보너스', '월간 리포트', '우선 매칭'],
  },
  {
    name: 'Platinum',
    minCP: 100_000,
    maxCP: null,
    bonusPct: 5,
    benefits: ['최대 보너스', '월간 리포트', '우선 매칭', 'VIP 뱃지'],
  },
]

// 하위 호환용 — 기존 코드가 TIER_LIST 참조 시
export const TIER_LIST = LIFETIME_TIERS

export const MISSIONS: Mission[] = [
  {
    code: 'LABEL_10',
    title: '라벨링 완료',
    description: '세션 10개에 직접 라벨을 입력하세요',
    cpReward: 50,
    targetValue: 10,
    repeatable: true,
  },
  {
    code: 'DIALOG_ACT_5',
    title: '대화행위 분석',
    description: '5개 세션에 대화행위(발화 유형)를 추가 입력하세요',
    cpReward: 100,
    targetValue: 5,
    repeatable: true,
  },
]

// ── 티어 계산 함수 ─────────────────────────────────────────────────────────────

export function computeLifetimeTier(lifetimeCP: number): TierInfo {
  return [...LIFETIME_TIERS].reverse().find((t) => lifetimeCP >= t.minCP) ?? LIFETIME_TIERS[0]
}

export function computeMonthlyTier(monthlyCP: number): TierInfo {
  return [...MONTHLY_TIERS].reverse().find((t) => monthlyCP >= t.minCP) ?? MONTHLY_TIERS[0]
}

/** 합산 보너스 (CP 가중치, max +10%) */
export function computeBonus(lifetimeCP: number, monthlyCP: number): number {
  const lt = computeLifetimeTier(lifetimeCP).bonusPct
  const mt = computeMonthlyTier(monthlyCP).bonusPct
  return Math.min(lt + mt, 10)
}

/** 하위 호환 — 기존 getTier 호출용 */
export function getTier(cp: number): TierInfo {
  return computeLifetimeTier(cp)
}
