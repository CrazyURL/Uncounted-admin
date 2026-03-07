// ── 정산 엔진 (Ledger Engine) ─────────────────────────────────────────────────
// BU + multiplier 상태 → LedgerEntry[] 변환
// 핵심: 모든 금액은 범위(low/high). 확정은 판매 후에만.
//
// 적립 구조:
//   VOICE_BASE     = BU유효시간 × BASE_RATE × qualityMultiplier   (측정 기반 — 기본)
//   LABEL_BONUS    = VOICE_BASE × (labelMultiplier - 1.0)          (라벨 완성 차분)
//   COMPLIANCE_BONUS = VOICE_BASE × (1/complianceMultiplier - 1)   (동의 완료 차분)
//   PROFILE_BONUS  = VOICE_BASE × (profileMultiplier - 1.0)        (프로필 차분)
//   TIER_BONUS     = VOICE_BASE × (contributorMultiplier - 1.0)    (등급 차분)
//   CAMPAIGN_REWARD = 캠페인 bonusRate × 해당 BU 수
//   SALE_BONUS     = 판매 시 실제 분배금

import { type BillableUnit } from '../types/admin'
import { type QualityGrade, type SkuId, SKU_CATALOG } from '../types/sku'
import { type ContributorLevel } from './contributorLevel'
import { type EventUnit, type MetaEventTier, META_PAYOUT_RATIO, META_TIER_MULTIPLIER } from '../types/eventUnit'
import {
  type LedgerEntry,
  type LedgerType,
  type LedgerStatus,
  type AssetSummary,
  type AssetBreakdown,
  type AssetBreakdownItem,
  type DailyAssetStats,
  type MonthlyAssetStats,
  type SettlementSummary,
  LEDGER_TYPE_LABEL_KO,
} from '../types/ledger'

// ── 상수 (valueEngine과 동일) ────────────────────────────────────────────────

const BASE_RATE_LOW = 15000    // ₩/usable_hour (보수적)
const BASE_RATE_HIGH = 45000   // ₩/usable_hour (낙관적)

const QUALITY_MULTIPLIER: Record<QualityGrade, number> = {
  A: 1.2,
  B: 1.0,
  C: 0.6,
}

// ── Multiplier 상태 (현재 사용자 조건) ──────────────────────────────────────

export type MultiplierState = {
  labeledRatio: number            // 0~1 (라벨 완성 비율)
  avgTrustScore: number           // 0~1
  isComplianceComplete: boolean
  profileComplete: boolean
  contributorLevel: ContributorLevel
  userConfirmedRatio: number      // 0~1
}

// ── 개별 multiplier 계산 ────────────────────────────────────────────────────

function calcLabelMultiplierRange(
  labeledRatio: number,
  avgTrustScore: number,
): { min: number; max: number } {
  if (labeledRatio === 0) return { min: 1.0, max: 1.0 }
  const trustQualified = avgTrustScore >= 0.8
  const boost = labeledRatio * 0.3
  return {
    min: 1.0 + (trustQualified ? boost * 0.7 : boost * 0.3),
    max: 1.0 + (trustQualified ? boost * 1.0 : boost * 0.5),
  }
}

function calcComplianceMultiplier(complete: boolean): number {
  return complete ? 1.0 : 0.7
}

function calcProfileMultiplier(complete: boolean): number {
  return complete ? 1.05 : 1.0
}

function calcLabelSourceMultiplier(ratio: number): number {
  return ratio >= 0.5 ? 1.07 : 1.0
}

function calcContributorMultiplier(level: ContributorLevel): number {
  if (level === 'certified') return 1.15
  if (level === 'verified') return 1.05
  return 1.0
}

// ── BU → Ledger Entry 변환 ──────────────────────────────────────────────────

let entryCounter = 0
function genId(): string {
  return `led_${Date.now()}_${entryCounter++}`
}

/** 단일 BU에 대한 VOICE_BASE 원장 항목 생성 */
function createBaseEntry(
  bu: BillableUnit,
  userId: string,
): LedgerEntry {
  const hours = bu.effectiveSeconds / 3600
  const qm = QUALITY_MULTIPLIER[bu.qualityGrade]
  const low = Math.round(hours * BASE_RATE_LOW * qm)
  const high = Math.round(hours * BASE_RATE_HIGH * qm)

  return {
    id: genId(),
    userId,
    buId: bu.id,
    sessionId: bu.sessionId,
    ledgerType: 'VOICE_BASE',
    amountLow: low,
    amountHigh: high,
    amountConfirmed: null,
    status: 'estimated',
    exportJobId: null,
    campaignId: null,
    metadata: { qualityGrade: bu.qualityGrade, qualityMultiplier: qm, effectiveSeconds: bu.effectiveSeconds },
    createdAt: `${bu.sessionDate}T12:00:00.000Z`,
    confirmedAt: null,
    withdrawableAt: null,
    paidAt: null,
  }
}

/** multiplier 차분으로 보너스 원장 항목 생성 */
function createBonusEntry(
  type: LedgerType,
  baseEntry: LedgerEntry,
  multiplierLow: number,
  multiplierHigh: number,
  userId: string,
): LedgerEntry | null {
  // multiplier가 1.0이면 차분 없음 → 항목 불필요
  if (multiplierLow <= 1.0 && multiplierHigh <= 1.0) return null

  const bonusLow = Math.round(baseEntry.amountLow * (multiplierLow - 1.0))
  const bonusHigh = Math.round(baseEntry.amountHigh * (multiplierHigh - 1.0))

  if (bonusLow <= 0 && bonusHigh <= 0) return null

  return {
    id: genId(),
    userId,
    buId: baseEntry.buId,
    sessionId: baseEntry.sessionId,
    ledgerType: type,
    amountLow: Math.max(0, bonusLow),
    amountHigh: Math.max(0, bonusHigh),
    amountConfirmed: null,
    status: 'estimated',
    exportJobId: null,
    campaignId: null,
    metadata: { multiplierLow, multiplierHigh },
    createdAt: baseEntry.createdAt,
    confirmedAt: null,
    withdrawableAt: null,
    paidAt: null,
  }
}

/**
 * BU 배열 + 현재 multiplier 상태 → 전체 LedgerEntry[] 생성
 *
 * 각 BU에 대해:
 * 1. VOICE_BASE (기본)
 * 2. LABEL_BONUS (라벨 완성 보너스, 있을 때만)
 * 3. COMPLIANCE_BONUS (동의 완료 보너스)
 * 4. PROFILE_BONUS (프로필 완성 보너스)
 * 5. TIER_BONUS (등급 보너스)
 */
export function generateLedgerEntries(
  units: BillableUnit[],
  state: MultiplierState,
  userId: string,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []

  const labelRange = calcLabelMultiplierRange(state.labeledRatio, state.avgTrustScore)
  const complianceM = calcComplianceMultiplier(state.isComplianceComplete)
  const profileM = calcProfileMultiplier(state.profileComplete)
  const labelSourceM = calcLabelSourceMultiplier(state.userConfirmedRatio)
  const contributorM = calcContributorMultiplier(state.contributorLevel)

  for (const bu of units) {
    // 1. VOICE_BASE
    const base = createBaseEntry(bu, userId)
    entries.push(base)

    // 2. LABEL_BONUS (labelMultiplier 차분)
    if (bu.hasLabels) {
      const labelBonus = createBonusEntry('LABEL_BONUS', base, labelRange.min, labelRange.max, userId)
      if (labelBonus) entries.push(labelBonus)
    }

    // 3. COMPLIANCE_BONUS (동의 완료 시 uplift)
    // compliance는 base 계산에 이미 포함되어야 하지만, 원장에서는 분리 표시
    // "미완료 시 0.7 적용 → 완료 시 1.0" 이므로, 완료 시 차분 = base × (1/0.7 - 1) ≈ +43%
    if (state.isComplianceComplete) {
      const compBonus = createBonusEntry('COMPLIANCE_BONUS', base, complianceM, complianceM, userId)
      if (compBonus) entries.push(compBonus)
    }

    // 4. PROFILE_BONUS
    const profileBonus = createBonusEntry('PROFILE_BONUS', base, profileM, profileM, userId)
    if (profileBonus) entries.push(profileBonus)

    // 5. TIER_BONUS (등급 × 라벨출처 결합)
    const tierCombined = contributorM * labelSourceM
    const tierBonus = createBonusEntry('TIER_BONUS', base, tierCombined, tierCombined, userId)
    if (tierBonus) entries.push(tierBonus)
  }

  return entries
}

// ── Ledger 집계 함수 ────────────────────────────────────────────────────────

/** LedgerEntry 배열을 타입별로 합산 → AssetBreakdown */
export function aggregateBreakdown(entries: LedgerEntry[]): AssetBreakdown {
  const byType: Record<LedgerType, { low: number; high: number; confirmed: number }> = {
    VOICE_BASE: { low: 0, high: 0, confirmed: 0 },
    LABEL_BONUS: { low: 0, high: 0, confirmed: 0 },
    COMPLIANCE_BONUS: { low: 0, high: 0, confirmed: 0 },
    PROFILE_BONUS: { low: 0, high: 0, confirmed: 0 },
    TIER_BONUS: { low: 0, high: 0, confirmed: 0 },
    CAMPAIGN_REWARD: { low: 0, high: 0, confirmed: 0 },
    SALE_BONUS: { low: 0, high: 0, confirmed: 0 },
    META_EVENT_BASE: { low: 0, high: 0, confirmed: 0 },
  }

  for (const e of entries) {
    const bucket = byType[e.ledgerType]
    bucket.low += e.amountLow
    bucket.high += e.amountHigh
    bucket.confirmed += e.amountConfirmed ?? 0
  }

  // 전체 high 합계 (비율 계산용)
  let totalHigh = 0
  for (const v of Object.values(byType)) totalHigh += v.high

  const items: AssetBreakdownItem[] = []
  const typeOrder: LedgerType[] = [
    'VOICE_BASE', 'LABEL_BONUS', 'COMPLIANCE_BONUS',
    'PROFILE_BONUS', 'TIER_BONUS', 'CAMPAIGN_REWARD', 'SALE_BONUS', 'META_EVENT_BASE',
  ]

  for (const type of typeOrder) {
    const v = byType[type]
    // 값이 0인 타입은 건너뜀 (SALE_BONUS는 확정 있을 때만)
    if (v.low === 0 && v.high === 0 && v.confirmed === 0) continue
    items.push({
      type,
      labelKo: LEDGER_TYPE_LABEL_KO[type],
      low: v.low,
      high: v.high,
      confirmed: v.confirmed,
      ratio: totalHigh > 0 ? v.high / totalHigh : 0,
    })
  }

  let confirmedTotal = 0
  let potentialLow = 0
  let potentialHigh = 0
  for (const e of entries) {
    if (e.status === 'confirmed' && e.amountConfirmed != null) {
      confirmedTotal += e.amountConfirmed
    } else {
      potentialLow += e.amountLow
      potentialHigh += e.amountHigh
    }
  }

  return { items, confirmedTotal, potentialLow, potentialHigh }
}

/** 날짜별로 그룹핑 → DailyAssetStats[] */
export function aggregateDaily(
  entries: LedgerEntry[],
  userId: string,
): DailyAssetStats[] {
  const byDate = new Map<string, LedgerEntry[]>()

  for (const e of entries) {
    const date = e.createdAt.slice(0, 10)  // YYYY-MM-DD
    const list = byDate.get(date) ?? []
    list.push(e)
    byDate.set(date, list)
  }

  const result: DailyAssetStats[] = []

  for (const [date, dayEntries] of byDate) {
    const stats: DailyAssetStats = {
      userId,
      date,
      voiceBaseLow: 0, voiceBaseHigh: 0,
      labelBonusLow: 0, labelBonusHigh: 0,
      complianceBonusLow: 0, complianceBonusHigh: 0,
      profileBonusLow: 0, profileBonusHigh: 0,
      tierBonusLow: 0, tierBonusHigh: 0,
      campaignSumLow: 0, campaignSumHigh: 0,
      saleBonusConfirmed: 0,
      metaEventBaseLow: 0, metaEventBaseHigh: 0,
      totalEstimatedLow: 0, totalEstimatedHigh: 0,
      totalConfirmed: 0,
      buCount: 0, sessionCount: 0,
      eventCount: 0,
    }

    const seenBuIds = new Set<string>()
    const seenSessionIds = new Set<string>()

    for (const e of dayEntries) {
      switch (e.ledgerType) {
        case 'VOICE_BASE':
          stats.voiceBaseLow += e.amountLow
          stats.voiceBaseHigh += e.amountHigh
          break
        case 'LABEL_BONUS':
          stats.labelBonusLow += e.amountLow
          stats.labelBonusHigh += e.amountHigh
          break
        case 'COMPLIANCE_BONUS':
          stats.complianceBonusLow += e.amountLow
          stats.complianceBonusHigh += e.amountHigh
          break
        case 'PROFILE_BONUS':
          stats.profileBonusLow += e.amountLow
          stats.profileBonusHigh += e.amountHigh
          break
        case 'TIER_BONUS':
          stats.tierBonusLow += e.amountLow
          stats.tierBonusHigh += e.amountHigh
          break
        case 'CAMPAIGN_REWARD':
          stats.campaignSumLow += e.amountLow
          stats.campaignSumHigh += e.amountHigh
          break
        case 'SALE_BONUS':
          stats.saleBonusConfirmed += e.amountConfirmed ?? 0
          break
        case 'META_EVENT_BASE':
          stats.metaEventBaseLow += e.amountLow
          stats.metaEventBaseHigh += e.amountHigh
          stats.eventCount += (e.metadata as Record<string, unknown>)?.eventCount as number ?? 0
          break
      }

      stats.totalEstimatedLow += e.amountLow
      stats.totalEstimatedHigh += e.amountHigh
      stats.totalConfirmed += e.amountConfirmed ?? 0

      if (e.buId && !seenBuIds.has(e.buId)) {
        seenBuIds.add(e.buId)
        // VOICE_BASE 항목만 BU 카운트 (보너스 항목은 같은 BU 중복)
        if (e.ledgerType === 'VOICE_BASE') stats.buCount++
      }
      if (e.sessionId && !seenSessionIds.has(e.sessionId)) {
        seenSessionIds.add(e.sessionId)
        if (e.ledgerType === 'VOICE_BASE') stats.sessionCount++
      }
    }

    result.push(stats)
  }

  return result.sort((a, b) => a.date.localeCompare(b.date))
}

/** DailyAssetStats[] → MonthlyAssetStats[] 집계 */
export function aggregateMonthly(
  dailyStats: DailyAssetStats[],
  userId: string,
): MonthlyAssetStats[] {
  const byMonth = new Map<string, DailyAssetStats[]>()

  for (const d of dailyStats) {
    const month = d.date.slice(0, 7)  // YYYY-MM
    const list = byMonth.get(month) ?? []
    list.push(d)
    byMonth.set(month, list)
  }

  const result: MonthlyAssetStats[] = []

  for (const [month, days] of byMonth) {
    const m: MonthlyAssetStats = {
      userId,
      month,
      totalEstimatedLow: 0, totalEstimatedHigh: 0, totalConfirmed: 0,
      buCount: 0, sessionCount: 0,
      voiceBaseLow: 0, voiceBaseHigh: 0,
      labelBonusLow: 0, labelBonusHigh: 0,
      otherBonusLow: 0, otherBonusHigh: 0,
      campaignSumLow: 0, campaignSumHigh: 0,
      saleBonusConfirmed: 0,
      metaEventBaseLow: 0, metaEventBaseHigh: 0,
      eventCount: 0,
    }

    for (const d of days) {
      m.totalEstimatedLow += d.totalEstimatedLow
      m.totalEstimatedHigh += d.totalEstimatedHigh
      m.totalConfirmed += d.totalConfirmed
      m.buCount += d.buCount
      m.sessionCount += d.sessionCount
      m.voiceBaseLow += d.voiceBaseLow
      m.voiceBaseHigh += d.voiceBaseHigh
      m.labelBonusLow += d.labelBonusLow
      m.labelBonusHigh += d.labelBonusHigh
      m.otherBonusLow += d.complianceBonusLow + d.profileBonusLow + d.tierBonusLow
      m.otherBonusHigh += d.complianceBonusHigh + d.profileBonusHigh + d.tierBonusHigh
      m.campaignSumLow += d.campaignSumLow
      m.campaignSumHigh += d.campaignSumHigh
      m.saleBonusConfirmed += d.saleBonusConfirmed
      m.metaEventBaseLow += d.metaEventBaseLow
      m.metaEventBaseHigh += d.metaEventBaseHigh
      m.eventCount += d.eventCount
    }

    result.push(m)
  }

  return result.sort((a, b) => a.month.localeCompare(b.month))
}

// ── Asset Summary (UI 표시용 전체 집계) ──────────────────────────────────────

/** 연속 활동일 계산 (오늘부터 역순으로 연속된 날 수) */
export function calcStreakDays(dailyStats: DailyAssetStats[]): number {
  if (dailyStats.length === 0) return 0

  const today = new Date().toISOString().slice(0, 10)
  const dates = new Set(dailyStats.map(d => d.date))

  let streak = 0
  const d = new Date(today)

  while (true) {
    const dateStr = d.toISOString().slice(0, 10)
    if (!dates.has(dateStr)) break
    streak++
    d.setDate(d.getDate() - 1)
  }

  return streak
}

/** LedgerEntry[] → AssetSummary (전체 UI 표시용) */
export function calcAssetSummary(
  entries: LedgerEntry[],
  userId: string,
): AssetSummary {
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  const breakdown = aggregateBreakdown(entries)
  const dailyStats = aggregateDaily(entries, userId)

  // 총 누적
  let totalLow = 0
  let totalHigh = 0
  let totalConfirmed = 0
  for (const e of entries) {
    totalLow += e.amountLow
    totalHigh += e.amountHigh
    totalConfirmed += e.amountConfirmed ?? 0
  }

  // 이번 달
  let thisMonthLow = 0
  let thisMonthHigh = 0
  let thisMonthConfirmed = 0
  for (const e of entries) {
    if (e.createdAt.startsWith(thisMonth)) {
      thisMonthLow += e.amountLow
      thisMonthHigh += e.amountHigh
      thisMonthConfirmed += e.amountConfirmed ?? 0
    }
  }

  // 오늘
  let todayLow = 0
  let todayHigh = 0
  let todayConfirmed = 0
  for (const e of entries) {
    if (e.createdAt.startsWith(today)) {
      todayLow += e.amountLow
      todayHigh += e.amountHigh
      todayConfirmed += e.amountConfirmed ?? 0
    }
  }

  const streakDays = calcStreakDays(dailyStats)

  return {
    totalLow, totalHigh, totalConfirmed,
    thisMonthLow, thisMonthHigh, thisMonthConfirmed,
    todayLow, todayHigh, todayConfirmed,
    streakDays,
    breakdown,
  }
}

// ── BU 기반 등급 추가이익 계산 ──────────────────────────────────────────────

export type TierBenefitInfo = {
  currentLevel: ContributorLevel
  currentMultiplier: number
  baselineMultiplier: number      // basic 기준 (1.0)
  additionalRatioLow: number     // 추가 이익 비율 (low 기준, 0~)
  additionalRatioHigh: number
  additionalAmountLow: number    // 추가 이익 금액 (low)
  additionalAmountHigh: number   // 추가 이익 금액 (high)
  nextLevel: ContributorLevel | null
  nextMultiplier: number | null
  nextAdditionalLow: number      // 다음 등급 달성 시 추가 이익
  nextAdditionalHigh: number
}

/** 현재 등급 대비 기본 등급의 추가이익 계산 */
export function calcTierBenefit(
  totalBaseLow: number,
  totalBaseHigh: number,
  currentLevel: ContributorLevel,
): TierBenefitInfo {
  const current = calcContributorMultiplier(currentLevel)
  const baseline = 1.0

  const additionalRatioLow = current - baseline
  const additionalRatioHigh = current - baseline

  const nextLevelMap: Record<ContributorLevel, ContributorLevel | null> = {
    basic: 'verified',
    verified: 'certified',
    certified: null,
  }
  const nextLevel = nextLevelMap[currentLevel]
  const nextMult = nextLevel ? calcContributorMultiplier(nextLevel) : null

  return {
    currentLevel,
    currentMultiplier: current,
    baselineMultiplier: baseline,
    additionalRatioLow,
    additionalRatioHigh,
    additionalAmountLow: Math.round(totalBaseLow * additionalRatioLow),
    additionalAmountHigh: Math.round(totalBaseHigh * additionalRatioHigh),
    nextLevel,
    nextMultiplier: nextMult,
    nextAdditionalLow: nextMult ? Math.round(totalBaseLow * (nextMult - current)) : 0,
    nextAdditionalHigh: nextMult ? Math.round(totalBaseHigh * (nextMult - current)) : 0,
  }
}

// ── 정산 상태 전환 (4-tier) ─────────────────────────────────────────────────

/** 허용되는 상태 전환 규칙 */
const VALID_TRANSITIONS: Record<LedgerStatus, LedgerStatus[]> = {
  estimated: ['confirmed', 'voided'],
  confirmed: ['withdrawable'],
  withdrawable: ['paid'],
  paid: [],
  voided: [],
}

/**
 * 단일 원장 항목의 상태를 다음 단계로 전환.
 * 원본을 변경하지 않고 새 객체를 반환.
 */
export function transitionEntry(
  entry: LedgerEntry,
  targetStatus: LedgerStatus,
  confirmedAmount?: number,
): LedgerEntry | null {
  const allowed = VALID_TRANSITIONS[entry.status]
  if (!allowed.includes(targetStatus)) return null

  const now = new Date().toISOString()
  const updated: LedgerEntry = { ...entry, status: targetStatus }

  switch (targetStatus) {
    case 'confirmed':
      updated.confirmedAt = now
      if (confirmedAmount != null) {
        updated.amountConfirmed = confirmedAmount
      }
      break
    case 'withdrawable':
      updated.withdrawableAt = now
      break
    case 'paid':
      updated.paidAt = now
      break
  }

  return updated
}

/**
 * 배치 정산: 주어진 조건의 항목들을 다음 단계로 일괄 전환.
 */
export function batchTransition(
  entries: LedgerEntry[],
  fromStatus: LedgerStatus,
  toStatus: LedgerStatus,
  confirmedAmount?: number,
): { updated: LedgerEntry[]; skipped: LedgerEntry[] } {
  const updated: LedgerEntry[] = []
  const skipped: LedgerEntry[] = []

  for (const entry of entries) {
    if (entry.status !== fromStatus) {
      skipped.push(entry)
      continue
    }
    const result = transitionEntry(entry, toStatus, confirmedAmount)
    if (result) {
      updated.push(result)
    } else {
      skipped.push(entry)
    }
  }

  return { updated, skipped }
}

/**
 * 정산 배치 시뮬레이션: confirmed → withdrawable 전환 대상 집계.
 */
export function simulateSettlementBatch(
  entries: LedgerEntry[],
): { eligibleCount: number; eligibleAmount: number; entries: LedgerEntry[] } {
  const eligible = entries.filter(e => e.status === 'confirmed')
  const amount = eligible.reduce((s, e) => s + (e.amountConfirmed ?? e.amountHigh), 0)
  return { eligibleCount: eligible.length, eligibleAmount: amount, entries: eligible }
}

// ── 정산 현황 집계 (4-tier Summary) ──────────────────────────────────────────

/** LedgerEntry[] → 상태별 정산 현황 */
export function calcSettlementSummary(entries: LedgerEntry[]): SettlementSummary {
  const summary: SettlementSummary = {
    estimatedLow: 0, estimatedHigh: 0,
    confirmedTotal: 0, withdrawableTotal: 0, paidTotal: 0,
    estimatedCount: 0, confirmedCount: 0, withdrawableCount: 0, paidCount: 0,
  }

  for (const e of entries) {
    switch (e.status) {
      case 'estimated':
        summary.estimatedLow += e.amountLow
        summary.estimatedHigh += e.amountHigh
        summary.estimatedCount++
        break
      case 'confirmed':
        summary.confirmedTotal += e.amountConfirmed ?? e.amountHigh
        summary.confirmedCount++
        break
      case 'withdrawable':
        summary.withdrawableTotal += e.amountConfirmed ?? e.amountHigh
        summary.withdrawableCount++
        break
      case 'paid':
        summary.paidTotal += e.amountConfirmed ?? e.amountHigh
        summary.paidCount++
        break
    }
  }

  return summary
}

// ── 메타 이벤트 → 원장 항목 생성 ──────────────────────────────────────────

/** SKU rate 캐시 (baseRateLow/High) */
const skuRateCache = new Map<SkuId, { low: number; high: number }>()
function getSkuRate(skuId: SkuId): { low: number; high: number } {
  let cached = skuRateCache.get(skuId)
  if (!cached) {
    const def = SKU_CATALOG.find(s => s.id === skuId)
    cached = def ? { low: def.baseRateLow, high: def.baseRateHigh } : { low: 0, high: 0 }
    skuRateCache.set(skuId, cached)
  }
  return cached
}

/**
 * EventUnit[] → META_EVENT_BASE LedgerEntry[] 생성.
 * SKU별 + 일별로 그룹핑하여 1건의 LedgerEntry per (skuId, date) 조합.
 *
 * amountLow  = count × rateLow  × tierMult × META_PAYOUT_RATIO
 * amountHigh = count × rateHigh × tierMult × META_PAYOUT_RATIO
 */
export function generateMetaEventLedgerEntries(
  units: EventUnit[],
  userId: string,
  tier: MetaEventTier = 'Bronze',
): LedgerEntry[] {
  if (units.length === 0) return []

  // SKU + date로 그룹핑
  const grouped = new Map<string, { skuId: SkuId; date: string; count: number }>()
  for (const u of units) {
    const key = `${u.skuId}_${u.dateBucket}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count++
    } else {
      grouped.set(key, { skuId: u.skuId, date: u.dateBucket, count: 1 })
    }
  }

  const tierMult = META_TIER_MULTIPLIER[tier]
  const entries: LedgerEntry[] = []

  for (const g of grouped.values()) {
    const rate = getSkuRate(g.skuId)
    const low = Math.round(g.count * rate.low * tierMult * META_PAYOUT_RATIO)
    const high = Math.round(g.count * rate.high * tierMult * META_PAYOUT_RATIO)

    if (low === 0 && high === 0) continue

    entries.push({
      id: `led_meta_${g.skuId}_${g.date}`,
      userId,
      buId: null,
      sessionId: null,
      ledgerType: 'META_EVENT_BASE',
      amountLow: low,
      amountHigh: high,
      amountConfirmed: null,
      status: 'estimated',
      exportJobId: null,
      campaignId: null,
      metadata: { skuId: g.skuId, eventCount: g.count, tierMultiplier: tierMult, payoutRatio: META_PAYOUT_RATIO },
      createdAt: `${g.date}T00:00:00.000Z`,
      confirmedAt: null,
      withdrawableAt: null,
      paidAt: null,
    })
  }

  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// ── 캠페인 보상 → 원장 항목 생성 ──────────────────────────────────────────

import { type Session } from '../types/session'
import { CAMPAIGNS, matchSessions, getActiveConsent } from './campaigns'

/**
 * 캠페인 매칭 세션의 BU에 대해 CAMPAIGN_REWARD LedgerEntry 생성.
 * unitPrice(₩/분) 기반으로 low=high=unitPrice×유효분 (캠페인은 확정 단가).
 */
export function generateCampaignRewardEntries(
  units: BillableUnit[],
  sessions: Session[],
  userId: string,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []

  for (const campaign of CAMPAIGNS) {
    if (!getActiveConsent(campaign.id)) continue

    const matched = matchSessions(campaign, sessions)
    if (matched.length === 0) continue

    const matchedSessionIds = new Set(matched.map(s => s.id))

    for (const bu of units) {
      if (!matchedSessionIds.has(bu.sessionId)) continue

      const minutes = bu.effectiveSeconds / 60
      const amount = Math.round(campaign.unitPrice * minutes)
      if (amount <= 0) continue

      entries.push({
        id: `led_camp_${campaign.id}_${bu.id}`,
        userId,
        buId: bu.id,
        sessionId: bu.sessionId,
        ledgerType: 'CAMPAIGN_REWARD',
        amountLow: amount,
        amountHigh: amount,
        amountConfirmed: null,
        status: 'estimated',
        exportJobId: null,
        campaignId: campaign.id,
        metadata: { campaignId: campaign.id, unitPrice: campaign.unitPrice, effectiveMinutes: minutes },
        createdAt: `${bu.sessionDate}T12:00:00.000Z`,
        confirmedAt: null,
        withdrawableAt: null,
        paidAt: null,
      })
    }
  }

  return entries
}
