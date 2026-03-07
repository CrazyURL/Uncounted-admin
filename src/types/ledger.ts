// ── 자산 원장 (Asset Ledger) ──────────────────────────────────────────────────
// 핵심 원칙: 모든 보상을 원천별로 기록. 금액은 항상 범위(low/high).
// "단일 확정값 표시 금지" 원칙 유지 — 판매 확정 전까지 amount_confirmed = null.

// ── Ledger Entry Types ───────────────────────────────────────────────────────

export type LedgerType =
  | 'VOICE_BASE'        // BU 생성 시 기본 적립 (usableHour × BASE_RATE × qualityMultiplier)
  | 'LABEL_BONUS'       // 라벨 완성 보너스 (labelMultiplier 차분)
  | 'COMPLIANCE_BONUS'  // 동의 완료 시 complianceMultiplier 차분
  | 'PROFILE_BONUS'     // 프로필 완성 시 profileMultiplier 차분
  | 'TIER_BONUS'        // 등급 승격 시 contributorMultiplier 차분
  | 'CAMPAIGN_REWARD'   // 캠페인 보상
  | 'SALE_BONUS'        // 실제 판매 발생 시 분배
  | 'META_EVENT_BASE'   // 메타 이벤트 기본 적립 (eventCount × eventRate × tierMult × payoutRatio)

export const LEDGER_TYPE_LABEL_KO: Record<LedgerType, string> = {
  VOICE_BASE: '음성 기본',
  LABEL_BONUS: '라벨 보너스',
  COMPLIANCE_BONUS: '동의 보너스',
  PROFILE_BONUS: '프로필 보너스',
  TIER_BONUS: '등급 보너스',
  CAMPAIGN_REWARD: '캠페인 보상',
  SALE_BONUS: '판매 보너스',
  META_EVENT_BASE: '메타 이벤트',
}

// ── 4-tier 정산 상태 ───────────────────────────────────────────────────────
// estimated    → 데이터 수집 완료, 가치 추정 (판매 전)
// confirmed    → 데이터 판매 완료, 금액 확정 (관리자 확인)
// withdrawable → 정산 배치 처리 완료, 출금 가능
// paid         → 출금 완료 (PG 연동 후 — MVP에서는 UI only)
export type LedgerStatus = 'estimated' | 'confirmed' | 'withdrawable' | 'paid' | 'voided'

export const LEDGER_STATUS_LABEL_KO: Record<LedgerStatus, string> = {
  estimated: '추정',
  confirmed: '확정',
  withdrawable: '출금 가능',
  paid: '출금 완료',
  voided: '취소',
}

export type LedgerEntry = {
  id: string
  userId: string
  buId: string | null             // BU 단위 연결 (캠페인/판매는 null 가능)
  sessionId: string | null        // 세션 참조
  ledgerType: LedgerType
  amountLow: number               // 보수적 추정 (₩)
  amountHigh: number              // 낙관적 추정 (₩)
  amountConfirmed: number | null  // 판매 확정 시 실제 금액 (null = 미확정)
  status: LedgerStatus
  exportJobId: string | null      // 판매 연동 시 export job 참조
  campaignId: string | null       // 캠페인 보상 시 참조
  metadata: Record<string, unknown> | null  // 추가 정보 (multiplier 값 등)
  createdAt: string
  // 상태 전환 타임스탬프
  confirmedAt: string | null      // estimated → confirmed 시점
  withdrawableAt: string | null   // confirmed → withdrawable 시점
  paidAt: string | null           // withdrawable → paid 시점
}

// ── Daily / Monthly 집계 ─────────────────────────────────────────────────────

export type DailyAssetStats = {
  userId: string
  date: string                    // YYYY-MM-DD
  voiceBaseLow: number
  voiceBaseHigh: number
  labelBonusLow: number
  labelBonusHigh: number
  complianceBonusLow: number
  complianceBonusHigh: number
  profileBonusLow: number
  profileBonusHigh: number
  tierBonusLow: number
  tierBonusHigh: number
  campaignSumLow: number
  campaignSumHigh: number
  saleBonusConfirmed: number      // 판매 확정만 (단일값)
  metaEventBaseLow: number        // 메타 이벤트 low 합계
  metaEventBaseHigh: number       // 메타 이벤트 high 합계
  totalEstimatedLow: number       // 해당일 전체 low 합계
  totalEstimatedHigh: number      // 해당일 전체 high 합계
  totalConfirmed: number          // 해당일 확정 합계
  buCount: number                 // 해당일 생성된 BU 수
  sessionCount: number            // 해당일 처리된 세션 수
  eventCount: number              // 해당일 메타 이벤트 수
}

export type MonthlyAssetStats = {
  userId: string
  month: string                   // YYYY-MM
  totalEstimatedLow: number
  totalEstimatedHigh: number
  totalConfirmed: number
  buCount: number
  sessionCount: number
  // 타입별 합계
  voiceBaseLow: number
  voiceBaseHigh: number
  labelBonusLow: number
  labelBonusHigh: number
  otherBonusLow: number           // compliance + profile + tier
  otherBonusHigh: number
  campaignSumLow: number
  campaignSumHigh: number
  saleBonusConfirmed: number
  metaEventBaseLow: number        // 메타 이벤트 low 합계
  metaEventBaseHigh: number       // 메타 이벤트 high 합계
  eventCount: number              // 해당월 메타 이벤트 수
}

// ── Asset Summary (UI 표시용 집계) ───────────────────────────────────────────

export type AssetSummary = {
  // 총 자산 (누적)
  totalLow: number
  totalHigh: number
  totalConfirmed: number
  // 이번 달
  thisMonthLow: number
  thisMonthHigh: number
  thisMonthConfirmed: number
  // 오늘
  todayLow: number
  todayHigh: number
  todayConfirmed: number
  // 연속 활동일
  streakDays: number
  // 타입별 누적 breakdown
  breakdown: AssetBreakdown
}

export type AssetBreakdownItem = {
  type: LedgerType
  labelKo: string
  low: number
  high: number
  confirmed: number
  ratio: number                   // 전체 대비 비율 (0~1, high 기준)
}

export type AssetBreakdown = {
  items: AssetBreakdownItem[]
  // 확정 vs 잠재
  confirmedTotal: number          // 판매 확정 합계
  potentialLow: number            // 잠재(미확정) low
  potentialHigh: number           // 잠재(미확정) high
}

// ── Settlement Summary (정산 현황 UI) ───────────────────────────────────────

export type SettlementSummary = {
  // 상태별 합계 (amountConfirmed 기준, null이면 amountHigh fallback)
  estimatedLow: number           // 추정 중 low 합계
  estimatedHigh: number          // 추정 중 high 합계
  confirmedTotal: number         // 확정 금액 합계
  withdrawableTotal: number      // 출금 가능 합계
  paidTotal: number              // 출금 완료 합계
  // 건수
  estimatedCount: number
  confirmedCount: number
  withdrawableCount: number
  paidCount: number
}

// ── Campaign ─────────────────────────────────────────────────────────────────

export type CampaignStatus = 'active' | 'upcoming' | 'completed' | 'cancelled'

export type CampaignCondition = {
  domain?: string[]               // 특정 도메인만 (e.g. ['비즈니스', '기술'])
  minQualityGrade?: 'A' | 'B' | 'C'
  requireLabels?: boolean
  labelFields?: string[]          // 특정 라벨 필드 필요 (e.g. ['tone', 'domain'])
}

export type Campaign = {
  id: string
  titleKo: string
  descriptionKo: string
  condition: CampaignCondition
  targetBuCount: number           // 목표 BU 수
  currentBuCount: number          // 현재 달성 BU 수
  bonusRateLow: number            // 추가 ₩/BU (low)
  bonusRateHigh: number           // 추가 ₩/BU (high)
  maxParticipants: number | null  // null = 제한 없음
  currentParticipants: number
  startDate: string
  endDate: string
  status: CampaignStatus
  createdAt: string
}

export type CampaignProgress = {
  campaignId: string
  userId: string
  contributedBuCount: number      // 내가 기여한 BU 수
  earnedLow: number               // 캠페인으로 벌어들인 범위
  earnedHigh: number
  lastContributedAt: string | null
}
