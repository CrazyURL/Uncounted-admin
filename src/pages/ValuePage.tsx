import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainerVariants, fadeSlideVariants } from '../lib/motionTokens'
import { type Session } from '../types/session'
import { type EligibilityStatus } from '../types/sku'
import { loadAllSessions, getCachedSessions } from '../lib/sessionMapper'
import { useVerificationProgress } from '../lib/verificationEngine'
import { calcValueBreakdown, type ValueBreakdown } from '../lib/valueEngine'
import { loadLabelStats } from '../lib/labelTrust'
import { calcSkuReadiness, type SkuReadiness } from '../lib/refineryEngine'
import { type QualityGrade } from '../types/sku'
import { formatWonShort, formatWonCompact } from '../lib/earnings'
import { summarizeConsent } from '../lib/consentEngine'
import { backdropVariants } from '../lib/motionTokens'
import { loadProfile, isProfileGateCompleted, getConsistencyScore } from '../types/userProfile'
import { calcContributorLevel, calcUserConfirmedRatio } from '../lib/contributorLevel'
import { calcSkuTier } from '../lib/skuTier'
import { deriveUnitsWithAccumulation, summarizeUnits } from '../lib/billableUnitEngine'
import {
  generateLedgerEntries,
  generateMetaEventLedgerEntries,
  generateCampaignRewardEntries,
  calcAssetSummary,
  aggregateDaily,
  aggregateMonthly,
  calcTierBenefit,
  calcSettlementSummary,
} from '../lib/ledgerEngine'
import { harvestEventUnits, summarizeEventInventory } from '../lib/eventUnitEngine'
import { type LedgerEntry, type AssetSummary, type MonthlyAssetStats, type DailyAssetStats, type SettlementSummary } from '../types/ledger'
import { loadLedgerEntries } from '../lib/adminStore'
import Illust3D from '../components/domain/Illust3D'

// ── 등급 배지 스타일 ─────────────────────────────────────────────────────────

const STATUS_STYLE: Record<EligibilityStatus, { icon: string; label: string; color: string; bg: string }> = {
  eligible: {
    icon: 'check_circle',
    label: '가능',
    color: 'var(--color-accent)',
    bg: 'var(--color-accent-dim)',
  },
  needs_work: {
    icon: 'info',
    label: '개선 필요',
    color: 'var(--color-text-sub)',
    bg: 'var(--color-muted)',
  },
  not_eligible: {
    icon: 'block',
    label: '현재 불가',
    color: 'var(--color-text-tertiary)',
    bg: 'var(--color-muted)',
  },
}

export default function ValuePage() {
  const navigate = useNavigate()
  const cached = getCachedSessions()
  const [sessions, setSessions] = useState<Session[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached || cached.length === 0)
  const [selectedSku, setSelectedSku] = useState<SkuReadiness | null>(null)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [showBuInfo, setShowBuInfo] = useState(false)
  const [showMetaInfo, setShowMetaInfo] = useState(false)
  const [dbLedgerEntries, setDbLedgerEntries] = useState<LedgerEntry[]>([])
  const verifyProgress = useVerificationProgress()

  useEffect(() => {
    if (cached && cached.length > 0) return
    loadAllSessions().then((all) => {
      setSessions(all)
      setLoading(false)
    })
  }, [])

  // 백그라운드 검증 진행 시 세션 갱신 → 가치 재계산
  useEffect(() => {
    if (!verifyProgress.lastVerifiedId && verifyProgress.verified === 0) return
    const cached = getCachedSessions()
    if (cached && cached.length > 0) {
      setSessions(cached)
    }
  }, [verifyProgress.lastVerifiedId, verifyProgress.verified])

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-24 gap-4 min-h-full"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <Illust3D fallback="autorenew" src="/assets/3d/A-4.png" size={72} />
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>데이터 분석 중...</p>
      </div>
    )
  }

  const stats = loadLabelStats()
  const profile = loadProfile()
  const profileComplete = profile ? isProfileGateCompleted(profile) : false
  const userConfirmedRatio = calcUserConfirmedRatio(sessions)
  const consistencyScore = profile ? getConsistencyScore(profile) : 0
  const contributor = calcContributorLevel({ profileCompleted: profileComplete, labelConfirmRate: userConfirmedRatio, consistencyScore })

  // BU 산정 (누적 정산)
  const buResult = useMemo(() => deriveUnitsWithAccumulation(sessions), [sessions])
  const buSummary = useMemo(() => summarizeUnits(buResult.units), [buResult.units])

  const breakdown = calcValueBreakdown(sessions, stats.avgTrustScore, false, {
    profileComplete,
    contributorLevel: contributor.level,
    userConfirmedRatio,
    buEffectiveHours: buSummary.totalEffectiveHours,
    buCount: buSummary.total,
    pendingSeconds: buResult.pendingBalance.pendingSeconds,
  })
  // 메타 이벤트 수확 + 인벤토리
  const eventUnits = useMemo(() => harvestEventUnits(), [sessions])
  const eventInventory = useMemo(() => summarizeEventInventory(eventUnits), [eventUnits])

  const skuList = calcSkuReadiness(sessions, eventInventory)

  const labeledCount = sessions.filter((s) => s.labels !== null).length
  const publicCount = sessions.filter((s) => s.isPublic).length

  // Ledger 산정 (BU → 원장 → 집계)
  const userId = sessions[0]?.userId ?? 'local'

  // DB에서 확정/출금가능/지급완료 원장 로드
  useEffect(() => {
    if (userId === 'local') return
    loadLedgerEntries({ userId }).then(entries => {
      if (entries.length > 0) setDbLedgerEntries(entries)
    }).catch(() => { /* Supabase 미설정 시 무시 */ })
  }, [userId])

  const ledgerEntries = useMemo(() => generateLedgerEntries(
    buResult.units,
    {
      labeledRatio: breakdown.labeledRatio,
      avgTrustScore: stats.avgTrustScore,
      isComplianceComplete: false,
      profileComplete,
      contributorLevel: contributor.level,
      userConfirmedRatio,
    },
    userId,
  ), [buResult.units, breakdown.labeledRatio, stats.avgTrustScore, profileComplete, contributor.level, userConfirmedRatio, userId])

  // 메타 이벤트 원장 병합
  const metaLedger = useMemo(() => generateMetaEventLedgerEntries(eventUnits, userId), [eventUnits, userId])

  // 캠페인 보상 원장
  const campaignLedger = useMemo(() => generateCampaignRewardEntries(buResult.units, sessions, userId), [buResult.units, sessions, userId])

  // DB 원장과 로컬 원장 병합: DB entries 우선 (confirmed/withdrawable/paid 반영)
  const allLedgerEntries = useMemo(() => {
    const localEntries = [...ledgerEntries, ...metaLedger, ...campaignLedger]
    if (dbLedgerEntries.length === 0) return localEntries

    // DB에 있는 buId set (DB 데이터가 우선)
    const dbBuIds = new Set(dbLedgerEntries.filter(e => e.buId).map(e => e.buId))
    // 로컬에만 있는 entries (DB에 없는 것)
    const localOnly = localEntries.filter(e => !e.buId || !dbBuIds.has(e.buId))
    return [...dbLedgerEntries, ...localOnly]
  }, [ledgerEntries, metaLedger, campaignLedger, dbLedgerEntries])

  const assetSummary = useMemo(() => calcAssetSummary(allLedgerEntries, userId), [allLedgerEntries, userId])
  const dailyStats = useMemo(() => aggregateDaily(allLedgerEntries, userId), [allLedgerEntries, userId])
  const monthlyStats = useMemo(() => aggregateMonthly(dailyStats, userId), [dailyStats, userId])
  const tierBenefit = useMemo(() => {
    const baseItems = ledgerEntries.filter(e => e.ledgerType === 'VOICE_BASE')
    const baseLow = baseItems.reduce((s, e) => s + e.amountLow, 0)
    const baseHigh = baseItems.reduce((s, e) => s + e.amountHigh, 0)
    return calcTierBenefit(baseLow, baseHigh, contributor.level)
  }, [ledgerEntries, contributor.level])
  const settlement = useMemo(() => calcSettlementSummary(allLedgerEntries), [allLedgerEntries])

  // 판매 가능(동의된) 자산
  const sellableInfo = useMemo(() => {
    const consentedHours = buResult.units
      .filter(u => u.consentStatus === 'PUBLIC_CONSENTED')
      .reduce((s, u) => s + u.effectiveSeconds / 3600, 0)
    const totalHours = buSummary.totalEffectiveHours || 1
    const voiceRatio = consentedHours / totalHours

    // 음성: 동의 비율만큼 / 메타: 전부 판매 가능 (동의 불필요)
    const voiceLow = ledgerEntries.reduce((s, e) => s + e.amountLow, 0)
    const voiceHigh = ledgerEntries.reduce((s, e) => s + e.amountHigh, 0)
    const mLow = metaLedger.reduce((s, e) => s + e.amountLow, 0)
    const mHigh = metaLedger.reduce((s, e) => s + e.amountHigh, 0)

    return {
      ratio: voiceRatio,
      low: Math.round(voiceLow * voiceRatio) + mLow,
      high: Math.round(voiceHigh * voiceRatio) + mHigh,
      consentedBu: buSummary.byConsent.consented,
      totalBu: buSummary.total,
    }
  }, [buResult.units, buSummary, ledgerEntries, metaLedger])

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-full px-5 py-5 flex flex-col gap-5 pb-24"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* 1. 자산 요약 */}
      <AssetSummarySection summary={assetSummary} breakdown={breakdown} sellableInfo={sellableInfo} />

      {/* 2. 자산 구성 Breakdown */}
      <AssetBreakdownSection summary={assetSummary} />

      {/* 3. 확정 vs 잠재 */}
      <ConfirmedVsPotentialSection summary={assetSummary} />

      {/* 3.5 정산 현황 (4-tier) */}
      <SettlementSection settlement={settlement} onWithdraw={() => setShowWithdrawModal(true)} />

      {/* 4. 월별 통계 */}
      {monthlyStats.length > 0 && <MonthlyChartSection data={monthlyStats} />}

      {/* 5. 일별 통계 */}
      {dailyStats.length > 0 && <DailyChartSection data={dailyStats} />}

      {/* 6. 기여자 등급 & 등급 추가이익 */}
      <motion.div
        variants={fadeSlideVariants}
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>person</span>
            <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>기여자 등급</p>
          </div>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: contributor.level === 'certified'
                ? 'var(--color-accent)' : 'var(--color-accent-dim)',
              color: contributor.level === 'certified'
                ? 'var(--color-text-on-accent)' : 'var(--color-accent)',
            }}
          >
            {contributor.labelKo}
          </span>
        </div>

        <div className="flex gap-3 mb-3">
          <div className="flex-1 rounded-lg p-3" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>프로필</p>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {breakdown.profileMultiplier > 1 ? `x${breakdown.profileMultiplier}` : '미적용'}
            </p>
          </div>
          <div className="flex-1 rounded-lg p-3" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>라벨 확인</p>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {breakdown.labelSourceMultiplier > 1 ? `x${breakdown.labelSourceMultiplier}` : '미적용'}
            </p>
          </div>
          <div className="flex-1 rounded-lg p-3" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>등급 보너스</p>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {breakdown.contributorMultiplier > 1 ? `x${breakdown.contributorMultiplier}` : '미적용'}
            </p>
          </div>
        </div>

        {tierBenefit.additionalAmountHigh > 0 && (
          <div className="rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: 'var(--color-accent-dim)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-accent)' }}>
              현재 등급으로 기본 대비 +₩{formatWonCompact(tierBenefit.additionalAmountLow)}~₩{formatWonCompact(tierBenefit.additionalAmountHigh)} 추가 이익
            </p>
          </div>
        )}

        {tierBenefit.nextLevel && tierBenefit.nextAdditionalHigh > 0 && (
          <div className="rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {tierBenefit.nextLevel === 'verified' ? '인증됨' : '공인됨'} 달성 시 추가 +₩{formatWonCompact(tierBenefit.nextAdditionalLow)}~₩{formatWonCompact(tierBenefit.nextAdditionalHigh)}
            </p>
          </div>
        )}

        {contributor.nextRequirements.length > 0 && (
          <div className="flex flex-col gap-1">
            {contributor.nextRequirements.map((req) => (
              <p key={req} className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                &rarr; {req}
              </p>
            ))}
          </div>
        )}
      </motion.div>

      {/* 7. 품질 KPI */}
      <motion.div
        variants={fadeSlideVariants}
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>analytics</span>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>품질 KPI</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <KpiCell label="총 시간" value={`${breakdown.totalHours.toLocaleString()}시간`} />
          <KpiCell label="유효 시간" value={`${breakdown.usableHours.toLocaleString()}시간`} sub={breakdown.buCount > 0 ? 'BU 기반' : '추정'} />
          <KpiCell label="빌링 유닛" value={`${breakdown.buCount.toLocaleString()}개`} sub={breakdown.pendingSeconds > 0 ? `대기 ${Math.round(breakdown.pendingSeconds).toLocaleString()}초` : undefined} onInfo={() => setShowBuInfo(true)} />
          <KpiCell label="라벨 완성" value={`${Math.round(breakdown.labeledRatio * 100)}%`} sub={`${labeledCount.toLocaleString()}/${sessions.length.toLocaleString()}건`} />
          <KpiCell label="공개 ON" value={`${publicCount.toLocaleString()}건`} sub={sessions.length > 0 ? `${Math.round((publicCount / sessions.length) * 100)}%` : '0%'} />
          <KpiCell label="음성 품질등급" value={breakdown.qualityGrade} sub={`x${breakdown.qualityMultiplier}`} />
          <KpiCell label="메타 이벤트" value={`${eventInventory.totalEvents.toLocaleString()}건`} sub={`${Object.keys(eventInventory.bySkuId).length}개 SKU`} onInfo={() => setShowMetaInfo(true)} />
        </div>
      </motion.div>

      {/* 8. SKU 준비도 */}
      <motion.div
        variants={fadeSlideVariants}
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>inventory_2</span>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>SKU 판매 준비도</p>
        </div>
        {(() => {
          const cs = summarizeConsent(sessions)
          return (
            <div className="rounded-lg px-3 py-2.5 mb-3 flex items-center gap-3" style={{ backgroundColor: 'var(--color-muted)' }}>
              <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>gavel</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>음성 판매 동의 현황</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  메타만 {cs.locked.toLocaleString()} · 본인음성 {cs.userOnly.toLocaleString()} · 전체 {cs.bothAgreed.toLocaleString()}
                </p>
              </div>
            </div>
          )
        })()}
        <SkuReadinessSection skuList={skuList} userConfirmedRatio={userConfirmedRatio} qualityGrade={breakdown.qualityGrade} onInfoClick={setSelectedSku} />
      </motion.div>

      {/* 9. 다음 액션 */}
      {breakdown.ctas.length > 0 && (
        <motion.div
          variants={fadeSlideVariants}
          className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>tips_and_updates</span>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>가치 올리기</p>
          </div>
          <div className="flex flex-col gap-2">
            {breakdown.ctas.map((cta, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
                <span className="material-symbols-outlined text-sm mt-0.5" style={{ color: 'var(--color-accent)' }}>arrow_forward</span>
                <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{cta}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 10. 캠페인 / 미션 */}
      <motion.div variants={fadeSlideVariants} className="grid grid-cols-2 gap-2">
        <button onClick={() => navigate('/campaigns')} className="rounded-xl px-3 py-3 text-left flex items-center gap-2" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>campaign</span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-sub)' }}>데이터 캠페인</span>
        </button>
        <button onClick={() => navigate('/missions')} className="rounded-xl px-3 py-3 text-left flex items-center gap-2" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-sub)' }}>military_tech</span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-sub)' }}>미션</span>
        </button>
      </motion.div>

      <AnimatePresence>
        {selectedSku && <SkuInfoPopup item={selectedSku} onClose={() => setSelectedSku(null)} />}
        {showWithdrawModal && <WithdrawModal onClose={() => setShowWithdrawModal(false)} />}
        {showBuInfo && <InfoPopup title="빌링 유닛(BU)이란?" onClose={() => setShowBuInfo(false)} items={[
          '음성 파일의 유효 발화 시간을 1분 단위로 환산한 정산 기준입니다.',
          '무음·잡음 구간은 제외되고, 실제 발화가 있는 구간만 산정됩니다.',
          '60초 미만의 잔여 시간은 "대기" 상태로 누적되다가 60초가 되면 1 BU로 전환됩니다.',
          '품질 등급(A/B/C)에 따라 BU당 가치가 달라집니다.',
        ]} />}
        {showMetaInfo && <InfoPopup title="메타 이벤트란?" onClose={() => setShowMetaInfo(false)} items={[
          '기기에서 자동으로 수집되는 비식별 환경 데이터입니다.',
          '배터리 상태, 네트워크 전환, 화면 세션, 조도, 모션 등 11종의 센서 데이터를 2시간 버킷 단위로 요약합니다.',
          '음성 파일과 별도로 수집되며, 각 SKU별 이벤트 수가 판매 가능 재고가 됩니다.',
          '개인 식별 정보(위치, 앱명, 텍스트)는 포함되지 않습니다.',
        ]} />}
      </AnimatePresence>
    </motion.div>
  )
}

// ── 자산 요약 섹션 (총/이번달/오늘/연속일) ───────────────────────────────────────

type SellableInfo = {
  ratio: number
  low: number
  high: number
  consentedBu: number
  totalBu: number
}

function AssetSummarySection({ summary, breakdown, sellableInfo }: { summary: AssetSummary; breakdown: ValueBreakdown; sellableInfo?: SellableInfo }) {
  const hasData = breakdown.totalHours > 0

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>payments</span>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>내 데이터 자산</p>
      </div>

      {hasData ? (
        <>
          <p className="font-bold text-xl mt-1 whitespace-nowrap" style={{ color: 'var(--color-text)' }}>
            ₩{formatWonCompact(summary.totalLow)} ~ ₩{formatWonCompact(summary.totalHigh)}
          </p>
          <span
            className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5"
            style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
          >
            조건부 범위
          </span>

          {/* 이번달 / 오늘 / 연속일 */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>이번 달</p>
              <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {summary.thisMonthHigh > 0 ? `+₩${formatWonCompact(summary.thisMonthHigh)}` : '-'}
              </p>
            </div>
            <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>오늘</p>
              <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {summary.todayHigh > 0 ? `+₩${formatWonCompact(summary.todayHigh)}` : '-'}
              </p>
            </div>
            <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>연속 활동</p>
              <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {summary.streakDays > 0 ? `${summary.streakDays}일` : '-'}
              </p>
            </div>
          </div>

          {/* 판매 가능 자산 */}
          {sellableInfo && sellableInfo.totalBu > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-accent)' }}>storefront</span>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>판매 가능 자산</p>
                </div>
                <p className="text-[10px] font-bold" style={{ color: 'var(--color-accent)' }}>
                  {Math.round(sellableInfo.ratio * 100)}%
                </p>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-muted)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, Math.round(sellableInfo.ratio * 100))}%`,
                    backgroundColor: 'var(--color-accent)',
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>
                  ₩{formatWonCompact(sellableInfo.low)} ~ ₩{formatWonCompact(sellableInfo.high)}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {sellableInfo.consentedBu}/{sellableInfo.totalBu} BU
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
          자산 스캔 후 가치 범위가 표시됩니다
        </p>
      )}

      {/* 조건 목록 */}
      {breakdown.conditions.length > 0 && (
        <div className="mt-3 pt-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>적용 조건</p>
          {breakdown.conditions.map((cond, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>info</span>
              <p className="text-[11px]" style={{ color: 'var(--color-text-sub)' }}>{cond}</p>
            </div>
          ))}
        </div>
      )}

      {/* 산식 */}
      {hasData && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {breakdown.buCount > 0 ? `${breakdown.buCount.toLocaleString()} BU` : `유효 ${breakdown.usableHours}h`} x 품질 x{breakdown.qualityMultiplier} x 라벨 x{breakdown.labelMultiplierRange.min}~{breakdown.labelMultiplierRange.max} x 동의 x{breakdown.complianceMultiplier}
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ── 자산 구성 Breakdown ──────────────────────────────────────────────────────────

function AssetBreakdownSection({ summary }: { summary: AssetSummary }) {
  const { items } = summary.breakdown
  if (items.length === 0) return null

  const totalHigh = items.reduce((s, it) => s + it.high, 0)

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>donut_small</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>자산 구성</p>
      </div>

      {/* 스택 바 */}
      <div className="flex h-3 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'var(--color-muted)' }}>
        {items.map((it, i) => {
          const pct = totalHigh > 0 ? (it.high / totalHigh) * 100 : 0
          if (pct < 1) return null
          const opacities = [1, 0.7, 0.5, 0.35, 0.25, 0.2, 0.15]
          return (
            <div
              key={it.type}
              style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)', opacity: opacities[i] ?? 0.15 }}
            />
          )
        })}
      </div>

      {/* 항목별 */}
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.type} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)', opacity: it.type === 'VOICE_BASE' ? 1 : 0.5 }} />
              <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{it.labelKo}</p>
            </div>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
              ₩{formatWonCompact(it.low)}~{formatWonCompact(it.high)}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── 확정 vs 잠재 ────────────────────────────────────────────────────────────────

function ConfirmedVsPotentialSection({ summary }: { summary: AssetSummary }) {
  const { breakdown } = summary
  const total = breakdown.confirmedTotal + breakdown.potentialHigh
  if (total <= 0) return null

  const confirmedPct = total > 0 ? Math.round((breakdown.confirmedTotal / total) * 100) : 0

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>verified</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>확정 vs 잠재</p>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'var(--color-muted)' }}>
        {confirmedPct > 0 && (
          <div style={{ width: `${confirmedPct}%`, backgroundColor: 'var(--color-accent)' }} />
        )}
        <div style={{ width: `${100 - confirmedPct}%`, backgroundColor: 'var(--color-accent)', opacity: 0.25 }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>확정</p>
          <p className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>
            {breakdown.confirmedTotal > 0 ? `₩${breakdown.confirmedTotal.toLocaleString()}` : '-'}
          </p>
          <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>판매 완료</p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>잠재</p>
          <p className="text-sm font-bold" style={{ color: 'var(--color-text-sub)' }}>
            ~₩{formatWonCompact(breakdown.potentialHigh)}
          </p>
          <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>최대 추정</p>
        </div>
      </div>
    </motion.div>
  )
}

// ── 정산 현황 (4-tier) ──────────────────────────────────────────────────────────

function SettlementSection({ settlement, onWithdraw }: { settlement: SettlementSummary; onWithdraw: () => void }) {
  const hasAny = settlement.estimatedCount + settlement.confirmedCount + settlement.withdrawableCount + settlement.paidCount > 0
  if (!hasAny) return null

  const tiers = [
    {
      icon: 'schedule',
      label: '정산 예정',
      sub: `${settlement.estimatedCount.toLocaleString()}건`,
      value: settlement.estimatedHigh > 0 ? `~₩${formatWonShort(settlement.estimatedHigh)}` : '-',
      opacity: 0.4,
    },
    {
      icon: 'task_alt',
      label: '확정',
      sub: `${settlement.confirmedCount.toLocaleString()}건`,
      value: settlement.confirmedTotal > 0 ? `₩${settlement.confirmedTotal.toLocaleString()}` : '-',
      opacity: 0.7,
    },
    {
      icon: 'account_balance_wallet',
      label: '출금 가능',
      sub: `${settlement.withdrawableCount.toLocaleString()}건`,
      value: settlement.withdrawableTotal > 0 ? `₩${settlement.withdrawableTotal.toLocaleString()}` : '-',
      opacity: 1,
    },
    {
      icon: 'payments',
      label: '출금 완료',
      sub: `${settlement.paidCount.toLocaleString()}건`,
      value: settlement.paidTotal > 0 ? `₩${settlement.paidTotal.toLocaleString()}` : '-',
      opacity: 0.5,
    },
  ]

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>receipt_long</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>정산 현황</p>
      </div>

      {/* 4단계 파이프라인 */}
      <div className="flex items-center gap-1 mb-3">
        {tiers.map((t, i) => (
          <div key={t.label} className="flex items-center flex-1">
            <div
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: 'var(--color-accent)', opacity: t.opacity }}
            />
            {i < tiers.length - 1 && (
              <span className="material-symbols-outlined text-[10px] mx-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                chevron_right
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 항목 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        {tiers.map((t) => (
          <div key={t.label} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.icon}</span>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.label}</p>
            </div>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{t.value}</p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.sub}</p>
          </div>
        ))}
      </div>

      {/* 출금 요청 버튼 */}
      <button
        onClick={onWithdraw}
        className="w-full mt-3 rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
        style={{
          backgroundColor: settlement.withdrawableTotal > 0 ? 'var(--color-accent)' : 'var(--color-muted)',
          color: settlement.withdrawableTotal > 0 ? 'var(--color-text-on-accent)' : 'var(--color-text-tertiary)',
        }}
      >
        <span className="material-symbols-outlined text-sm">account_balance</span>
        출금 요청
      </button>
    </motion.div>
  )
}

// ── 출금 요청 모달 (서비스 준비 중) ──────────────────────────────────────────────

function WithdrawModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { duration: 0.2, ease: [0.2, 0, 0, 1] } }}
        exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.15 } }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl px-6 py-6 text-center"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <span
          className="material-symbols-outlined text-3xl mb-3 inline-block"
          style={{ color: 'var(--color-accent)' }}
        >
          construction
        </span>
        <p className="text-base font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          출금 서비스 준비 중
        </p>
        <p className="text-xs mb-1" style={{ color: 'var(--color-text-sub)' }}>
          현재 출금 기능은 서비스 준비 중입니다.
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
          정산 확정된 금액은 안전하게 보관되며, 출금 서비스 오픈 시 알려드리겠습니다.
        </p>
        <div className="flex flex-col gap-2 text-left mb-4">
          <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>info</span>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              출금 시 본인 인증(KYC) 및 계좌 등록이 필요합니다
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>info</span>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              소득세(기타소득 8.8%) 원천징수 후 지급됩니다
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-lg py-2.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          확인
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── 월별 통계 차트 ──────────────────────────────────────────────────────────────

function MonthlyChartSection({ data }: { data: MonthlyAssetStats[] }) {
  const recent = data.slice(-12)
  const maxVal = Math.max(...recent.map(m => m.totalEstimatedHigh), 1)

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>bar_chart</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>월별 자산 증가</p>
      </div>

      <div className="flex items-end gap-1 h-24">
        {recent.map((m) => {
          const pct = (m.totalEstimatedHigh / maxVal) * 100
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: 'var(--color-accent)', opacity: 0.7 }} />
              <p className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>{m.month.slice(5)}</p>
            </div>
          )
        })}
      </div>

      {recent.length > 0 && (
        <div className="mt-2 pt-2 flex justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>최근 {recent.length}개월</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
            총 {recent.reduce((s, m) => s + m.buCount, 0).toLocaleString()} BU
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ── 일별 통계 차트 ──────────────────────────────────────────────────────────────

function DailyChartSection({ data }: { data: DailyAssetStats[] }) {
  const recent = data.slice(-14)
  const maxVal = Math.max(...recent.map(d => d.totalEstimatedHigh), 1)

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>timeline</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>최근 활동</p>
      </div>

      <div className="flex items-end gap-0.5 h-20">
        {recent.map((d) => {
          const pct = (d.totalEstimatedHigh / maxVal) * 100
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 3)}%`, backgroundColor: 'var(--color-accent)', opacity: 0.6 }} />
              <p className="text-[7px]" style={{ color: 'var(--color-text-tertiary)' }}>{d.date.slice(8)}</p>
            </div>
          )
        })}
      </div>

      {recent.length > 0 && (
        <div className="mt-2 pt-2 flex justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>최근 {recent.length}일</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
            오늘 +₩{formatWonShort(recent[recent.length - 1]?.totalEstimatedHigh ?? 0)}
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ── KPI 셀 ──────────────────────────────────────────────────────────────────────

function KpiCell({ label, value, sub, onInfo }: { label: string; value: string; sub?: string; onInfo?: () => void }) {
  return (
    <div className="rounded-lg px-3 py-2 relative" style={{ backgroundColor: 'var(--color-muted)' }}>
      <div className="flex items-center gap-1">
        <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
        {onInfo && (
          <button onClick={onInfo} className="flex-shrink-0">
            <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-tertiary)' }}>help_outline</span>
          </button>
        )}
      </div>
      <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

// ── SKU 준비도 섹션 (개선필요만 기본 노출, 가능/추후검토는 접이식) ──────────

function SkuReadinessSection({
  skuList, userConfirmedRatio, qualityGrade, onInfoClick,
}: {
  skuList: SkuReadiness[]
  userConfirmedRatio: number
  qualityGrade: QualityGrade
  onInfoClick: (item: SkuReadiness) => void
}) {
  const [showEligible, setShowEligible] = useState(false)
  const [showNotEligible, setShowNotEligible] = useState(false)

  const needsWork = skuList.filter((s) => s.status === 'needs_work')
  const eligible = skuList.filter((s) => s.status === 'eligible')
  // drop 결정된 SKU는 이 화면에서 숨김 (hold/v2/hold_self_report만 표시)
  const notEligible = skuList.filter(
    (s) => s.status === 'not_eligible' && s.sku.dropDecision !== 'drop',
  )

  return (
    <div className="flex flex-col gap-2">
      {needsWork.map((item) => {
        const tier = calcSkuTier({ skuId: item.sku.id, userConfirmedRatio, qualityGrade })
        return (
          <SkuReadinessRow key={item.sku.id} item={item} tierLabel={tier.labelKo} onInfoClick={() => onInfoClick(item)} />
        )
      })}

      {eligible.length > 0 && (
        <>
          <button
            onClick={() => setShowEligible((v) => !v)}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 w-full"
            style={{ backgroundColor: 'var(--color-muted)' }}
          >
            <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {showEligible ? 'expand_less' : 'expand_more'}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              가능 ({eligible.length})
            </span>
          </button>

          {showEligible && eligible.map((item) => {
            const tier = calcSkuTier({ skuId: item.sku.id, userConfirmedRatio, qualityGrade })
            return (
              <SkuReadinessRow key={item.sku.id} item={item} tierLabel={tier.labelKo} onInfoClick={() => onInfoClick(item)} />
            )
          })}
        </>
      )}

      {notEligible.length > 0 && (
        <>
          <button
            onClick={() => setShowNotEligible((v) => !v)}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 w-full"
            style={{ backgroundColor: 'var(--color-muted)' }}
          >
            <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {showNotEligible ? 'expand_less' : 'expand_more'}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              추후 가능 검토 ({notEligible.length})
            </span>
          </button>

          {showNotEligible && notEligible.map((item) => {
            const tier = calcSkuTier({ skuId: item.sku.id, userConfirmedRatio, qualityGrade })
            return (
              <SkuReadinessRow key={item.sku.id} item={item} tierLabel={tier.labelKo} onInfoClick={() => onInfoClick(item)} />
            )
          })}
        </>
      )}
    </div>
  )
}

// ── SKU 준비도 행 ────────────────────────────────────────────────────────────────

function SkuReadinessRow({ item, tierLabel, onInfoClick }: { item: SkuReadiness; tierLabel?: string; onInfoClick: () => void }) {
  const style = STATUS_STYLE[item.status]

  return (
    <button
      onClick={onInfoClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-left"
      style={{ backgroundColor: 'var(--color-muted)' }}
    >
      <span className="material-symbols-outlined text-base" style={{ color: style.color }}>
        {style.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>
            {item.sku.nameKo}
          </p>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ backgroundColor: style.bg, color: style.color }}
          >
            {style.label}
          </span>
          {tierLabel && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              {tierLabel}
            </span>
          )}
        </div>
        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
          {item.sku.id}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-sub)' }}>
          {item.fitPct}%
        </p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {item.eligibleCount.toLocaleString()}/{item.totalCount.toLocaleString()}
        </p>
      </div>
      <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        info
      </span>
    </button>
  )
}

// ── 정보 팝업 (BU / 메타 이벤트 설명) ──────────────────────────────────────────

function InfoPopup({ title, items, onClose }: { title: string; items: string[]; onClose: () => void }) {
  return (
    <motion.div
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { duration: 0.2, ease: [0.2, 0, 0, 1] } }}
        exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.15 } }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl px-6 py-5"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-accent)' }}>info</span>
          <p className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{title}</p>
        </div>
        <div className="flex flex-col gap-2.5 mb-5">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--color-accent)' }}>check</span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{item}</p>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-lg py-2.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          확인
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── SKU 상세 팝업 ────────────────────────────────────────────────────────────────

function SkuInfoPopup({ item, onClose }: { item: SkuReadiness; onClose: () => void }) {
  const style = STATUS_STYLE[item.status]
  const sku = item.sku
  const note = sku.differentiatorKo ?? sku.policyNote ?? null

  return (
    <motion.div
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: { duration: 0.25, ease: [0.2, 0, 0, 1] } }}
        exit={{ y: '100%', transition: { duration: 0.2 } }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl px-5 pt-5 pb-8"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        {/* 핸들 */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--color-border)' }} />

        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-base" style={{ color: style.color }}>
            {style.icon}
          </span>
          <p className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{sku.nameKo}</p>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: style.bg, color: style.color }}
          >
            {style.label}
          </span>
        </div>
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
          {sku.id} · {sku.category === 'voice' ? '음성' : '메타데이터'} · 리스크 {sku.policyRisk}
        </p>
        <div className="flex items-center gap-1.5 mb-4 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {sku.requiredConsentStatus === 'locked' ? 'lock' : sku.requiredConsentStatus === 'user_only' ? 'person' : 'group'}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
            판매 조건: {sku.requiredConsentStatus === 'locked' ? '메타데이터 — 동의 불필요' : sku.requiredConsentStatus === 'user_only' ? '본인 목소리 인증 필요' : '상대방 동의 필요'}
          </span>
        </div>

        {/* 설명 */}
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-sub)' }}>
          {sku.descriptionKo}
        </p>

        {/* 활용처 */}
        {sku.useCasesKo && sku.useCasesKo.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              활용처
            </p>
            <div className="flex flex-col gap-1 mb-4">
              {sku.useCasesKo.map((uc, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-accent)' }}>check</span>
                  <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{uc}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 포함 정보 */}
        {sku.contentsKo && sku.contentsKo.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              포함 정보
            </p>
            <div className="flex flex-col gap-1 mb-4">
              {sku.contentsKo.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-text-sub)' }}>data_object</span>
                  <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{c}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {note && (
          <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 mb-4" style={{ backgroundColor: 'var(--color-muted)' }}>
            <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>info</span>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{note}</p>
          </div>
        )}

        {/* 준비도 바 */}
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-sub)' }}>준비도</p>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt, var(--color-muted))' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${item.fitPct}%`, backgroundColor: style.color }}
            />
          </div>
          <p className="text-xs font-bold" style={{ color: style.color }}>{item.fitPct}%</p>
        </div>

        {item.nextAction && (
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
            다음 단계: {item.nextAction}
          </p>
        )}
      </motion.div>
    </motion.div>
  )
}
