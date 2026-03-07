// ── HomePage V2.0 — Glassmorphism + 3D 아이콘 대시보드 ──────────────────────
// 핀트 스타일 클린 UI + 글래스모피즘 + 3D 일러스트 플레이스홀더
// S0: Hero Greeting  S1: Value Glass Card  S2: Quick Stats
// S3: Growth + Quality Grid  S4: Action Cards

import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { type Session } from '../types/session'
import { loadAllSessions, getCachedSessions } from '../lib/sessionMapper'
import { calcValueBreakdown } from '../lib/valueEngine'
import { loadLabelStats } from '../lib/labelTrust'
import { loadProfile, isProfileGateCompleted, getConsistencyScore } from '../types/userProfile'
import { calcContributorLevel, calcUserConfirmedRatio } from '../lib/contributorLevel'
import { formatWonCompact } from '../lib/earnings'
import { staggerContainerVariants, fadeSlideVariants, DURATION, EASE, stampVariants } from '../lib/motionTokens'
import { loadTutorial, advanceStage, completeQuest, type TutorialState } from '../lib/tutorialStore'
import { calcMissionProgress } from '../lib/campaigns'
import { MISSIONS } from '../types/campaign'
import { usePipelineState, calcOverallProgress, type PipelineStage } from '../lib/pipelineState'
import { useSttGlobal } from '../lib/sttEngine'
import { deriveUnitsWithAccumulation, summarizeUnits } from '../lib/billableUnitEngine'
import { harvestEventUnits } from '../lib/eventUnitEngine'
import { generateLedgerEntries, generateMetaEventLedgerEntries, calcAssetSummary } from '../lib/ledgerEngine'
import SoftPulse from '../components/motion/SoftPulse'
import Illust3D from '../components/domain/Illust3D'

// ── 파이프라인 단계 라벨 ─────────────────────────────────────────────────────
const PIPELINE_LABELS: Record<PipelineStage, { idle: string; running: string; done: string }> = {
  scan: { idle: '파일 스캔', running: '파일 스캔 중...', done: '파일 스캔 완료' },
  stt: { idle: '텍스트 추출', running: '텍스트 추출 중...', done: '텍스트 추출 완료' },
  pii: { idle: '민감정보 보호', running: '민감정보 보호 중...', done: '민감정보 보호 완료' },
  label: { idle: '자동 라벨링', running: '자동 라벨링 중...', done: '자동 라벨링 완료' },
}

// ── getHomeStats — 홈 화면 통계 집계 ──────────────────────────────────────────
type HomeStats = {
  totalSessions: number
  totalHours: number
  usableHours: number
  buCount: number
  pendingSeconds: number
  grossRange: { low: number; high: number }
  netRange: { low: number; high: number }
  lockedRange: { low: number; high: number }
  publicCount: number
  lockedCount: number
  unlabeledCount: number
  qualityGrade: 'A' | 'B' | 'C'
  labeledRatio: number
  todayLabelCount: number
  dailyLabelGoal: number
  consentedPct: number
  hasIncompleteMission: boolean
  missionSummary: string
}

function calcSubsetUsableHours(subset: Session[]): number {
  let h = 0
  for (const s of subset) {
    const hours = s.duration / 3600
    h += s.audioMetrics ? hours * (1 - s.audioMetrics.silenceRatio) : hours * 0.75
  }
  return Math.round(h * 10) / 10
}

function getHomeStats(sessions: Session[]): HomeStats {
  const labelStats = loadLabelStats()
  const profile = loadProfile()
  const profileComplete = profile ? isProfileGateCompleted(profile) : false
  const userConfirmedRatio = calcUserConfirmedRatio(sessions)
  const consistencyScore = profile ? getConsistencyScore(profile) : 0
  const contributor = calcContributorLevel({ profileCompleted: profileComplete, labelConfirmRate: userConfirmedRatio, consistencyScore })
  // BU 산정
  const buResult = deriveUnitsWithAccumulation(sessions)
  const buSummary = summarizeUnits(buResult.units)

  const breakdown = calcValueBreakdown(sessions, labelStats.avgTrustScore, false, {
    profileComplete,
    contributorLevel: contributor.level,
    userConfirmedRatio,
    buEffectiveHours: buSummary.totalEffectiveHours,
    buCount: buSummary.total,
    pendingSeconds: buResult.pendingBalance.pendingSeconds,
  })

  // Ledger 기반 가치 산출 (ValuePage와 동일 파이프라인)
  const voiceLedger = generateLedgerEntries(buResult.units, {
    labeledRatio: breakdown.labeledRatio,
    avgTrustScore: labelStats.avgTrustScore,
    isComplianceComplete: false,
    profileComplete,
    contributorLevel: contributor.level,
    userConfirmedRatio,
  }, 'local')
  const eventUnits = harvestEventUnits()
  const metaLedger = generateMetaEventLedgerEntries(eventUnits, 'local')
  const allEntries = [...voiceLedger, ...metaLedger]
  const assetSummary = calcAssetSummary(allEntries, 'local')

  const grossLow = assetSummary.totalLow
  const grossHigh = assetSummary.totalHigh

  const ratePerHourLow = breakdown.usableHours > 0
    ? assetSummary.totalLow / breakdown.usableHours : 0
  const ratePerHourHigh = breakdown.usableHours > 0
    ? assetSummary.totalHigh / breakdown.usableHours : 0

  const publicSessions = sessions.filter(s => s.isPublic && s.piiStatus !== 'LOCKED')
  const lockedSessions = sessions.filter(s => s.piiStatus === 'LOCKED')

  const publicHours = calcSubsetUsableHours(publicSessions)
  const lockedHours = calcSubsetUsableHours(lockedSessions)

  return {
    totalSessions: sessions.length,
    totalHours: breakdown.totalHours,
    usableHours: breakdown.usableHours,
    buCount: buSummary.total,
    pendingSeconds: buResult.pendingBalance.pendingSeconds,
    grossRange: { low: grossLow, high: grossHigh },
    netRange: {
      low: Math.round(publicHours * ratePerHourLow),
      high: Math.round(publicHours * ratePerHourHigh),
    },
    lockedRange: {
      low: Math.round(lockedHours * ratePerHourLow),
      high: Math.round(lockedHours * ratePerHourHigh),
    },
    publicCount: publicSessions.length,
    lockedCount: lockedSessions.length,
    unlabeledCount: sessions.filter(s => s.labels === null).length,
    qualityGrade: breakdown.qualityGrade,
    labeledRatio: breakdown.labeledRatio,
    todayLabelCount: calcMissionProgress('LABEL_10', sessions),
    dailyLabelGoal: 10,
    consentedPct: buSummary.total > 0 ? Math.round((buSummary.byConsent.consented / buSummary.total) * 100) : 0,
    hasIncompleteMission: MISSIONS.some((m) => calcMissionProgress(m.code, sessions) < m.targetValue),
    missionSummary: MISSIONS.map((m) => {
      const cur = calcMissionProgress(m.code, sessions)
      return cur < m.targetValue ? `${m.title} ${cur}/${m.targetValue}` : null
    }).filter(Boolean).join(' · ') || '모든 미션 완료',
  }
}

// ── 7일 성장 데이터 ───────────────────────────────────────────────────────────

function buildGrowthData(sessions: Session[]): { label: string; count: number }[] {
  const today = new Date()
  const buckets: { label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`
    const count = sessions.filter((s) => s.date === key).length
    buckets.push({ label: dayLabel, count })
  }
  return buckets
}

// ── AreaChart V2 (SVG — 부드러운 곡선) ──────────────────────────────────────

function AreaChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const w = 200
  const h = 80
  const padY = 8
  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - padY - ((d.count / max) * (h - padY * 2))
    return { x, y }
  })

  // Catmull-Rom → cubic bezier for smooth curve
  let pathD = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[Math.max(0, i - 2)]
    const p1 = points[i - 1]
    const p2 = points[i]
    const p3 = points[Math.min(points.length - 1, i + 1)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    pathD += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  const fillD = `${pathD} L${w},${h} L0,${h} Z`
  const lastPoint = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="homeAreaGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#homeAreaGrad2)" />
      <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* 끝점 도트 */}
      <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill="var(--color-accent)" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="7" fill="var(--color-accent)" fillOpacity="0.2" />
    </svg>
  )
}

// ── DonutChart V2 (SVG — 얇은 스트로크 + 갭) ──────────────────────────────

function DonutChart({ a, b, c }: { a: number; b: number; c: number }) {
  const total = a + b + c || 1
  const pA = a / total
  const pB = b / total
  const r = 34
  const circumference = 2 * Math.PI * r
  const gap = 4 // 세그먼트 간 갭

  const segments = [
    { pct: pA, color: 'var(--color-accent)' },
    { pct: pB, color: '#86EFAC' },
    { pct: 1 - pA - pB, color: 'var(--color-muted)' },
  ].filter((s) => s.pct > 0.005)

  let offset = 0
  return (
    <svg viewBox="0 0 88 88" className="w-full h-full">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="8" strokeOpacity="0.3" />
      {segments.map((seg, i) => {
        const dash = Math.max(0, seg.pct * circumference - gap)
        const gapDash = circumference - dash
        const rot = offset * 360 - 90
        offset += seg.pct
        return (
          <circle
            key={i}
            cx="44" cy="44" r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="8"
            strokeDasharray={`${dash} ${gapDash}`}
            strokeLinecap="round"
            transform={`rotate(${rot} 44 44)`}
          />
        )
      })}
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const cached = getCachedSessions()
  const [sessions, setSessions] = useState<Session[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached || cached.length === 0)
  const [growthPeriod, setGrowthPeriod] = useState<'today' | '7d'>('7d')
  const [tutorialState, setTutorialState] = useState<TutorialState>(() => loadTutorial())
  const [coachStep, setCoachStep] = useState(-1)
  const pipeline = usePipelineState()
  const sttGlobal = useSttGlobal()
  const valueSummaryRef = useRef<HTMLDivElement>(null)
  const lockedCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cached && cached.length > 0) return
    loadAllSessions().then((data) => {
      setSessions(data)
      setLoading(false)
    })
  }, [])

  // 코치마크 자동 시작
  useEffect(() => {
    const tut = loadTutorial()
    if (tut.stage === 'coachmarks' && sessions.length > 0) {
      const t = setTimeout(() => setCoachStep(0), 400)
      return () => clearTimeout(t)
    }
  }, [sessions.length])

  // 퀘스트 자동 완료
  useEffect(() => {
    if (sessions.length > 0 && tutorialState.stage === 'quests' && !tutorialState.questsDone.includes('asset_scan')) {
      completeQuest('asset_scan')
      setTutorialState(loadTutorial())
    }
  }, [sessions.length, tutorialState.stage, tutorialState.questsDone])

  useEffect(() => {
    function handleFocus() { setTutorialState(loadTutorial()) }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // ── 코치마크 핸들러 ────────────────────────────────────────────────────────
  const handleCoachNext = useCallback(() => {
    if (coachStep === 0) {
      const stats = getHomeStats(sessions)
      if (stats.lockedCount > 0) {
        setCoachStep(1)
        return
      }
    }
    setCoachStep(-1)
    advanceStage('quests')
    setTutorialState(loadTutorial())
    document.body.style.overflow = ''
  }, [coachStep, sessions])

  const handleCoachSkip = useCallback(() => {
    setCoachStep(-1)
    advanceStage('quests')
    setTutorialState(loadTutorial())
    document.body.style.overflow = ''
  }, [])

  useEffect(() => {
    if (coachStep >= 0) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [coachStep])

  const handleQuestDismiss = useCallback(() => {
    advanceStage('done')
    setTutorialState(loadTutorial())
  }, [])

  // ── 로딩 ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <Illust3D fallback="analytics" src="/assets/3d/A-4.png" size={72} />
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>자산 불러오는 중...</p>
        </div>
      </div>
    )
  }

  // ── 비어있음 ──────────────────────────────────────────────────────────────

  if (sessions.length === 0) {
    return (
      <div className="min-h-full relative" style={{ backgroundColor: 'var(--color-bg)' }}>
        {/* BG orb */}
        <div className="absolute top-0 left-0 right-0 h-[400px] pointer-events-none overflow-hidden">
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(107,78,232,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-6 gap-6">
          <Illust3D fallback="shield" src="/assets/3d/D-1.png" size={96} />
          <div className="text-center">
            <p className="font-extrabold text-xl" style={{ color: 'var(--color-text)' }}>아직 자산이 없어요</p>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
              자산 탭에서 기기 스캔을 시작해볼까요?
            </p>
          </div>
          <button
            onClick={() => navigate('/assets')}
            className="flex items-center gap-2 px-7 py-3.5 font-bold text-sm active:scale-[0.97] transition-transform"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              borderRadius: 'var(--radius-pill)',
              boxShadow: '0 4px 20px rgba(107, 78, 232, 0.3)',
            }}
          >
            <span className="material-symbols-outlined text-base">qr_code_scanner</span>
            자산 스캔하러 가기
          </button>
        </div>
      </div>
    )
  }

  const stats = getHomeStats(sessions)

  return (
    <div className="min-h-full relative" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* ── 배경 글래스 오브 ── */}
      <div className="absolute top-0 left-0 right-0 h-[600px] pointer-events-none overflow-hidden">
        <div
          className="absolute -top-24 -left-16 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(107,78,232,0.14) 0%, transparent 70%)', filter: 'blur(50px)' }}
        />
        <div
          className="absolute top-32 -right-10 w-56 h-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(107,78,232,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="absolute top-64 left-1/3 w-40 h-40 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(168,140,255,0.06) 0%, transparent 70%)', filter: 'blur(30px)' }}
        />
      </div>

      <motion.div
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 px-5 pt-4 pb-10 flex flex-col gap-5"
      >
        {/* ── S0: Hero Greeting ── */}
        <motion.div
          variants={fadeSlideVariants}
          className="flex items-center gap-4 px-1 py-3"
        >
          <Illust3D fallback="shield" src="/assets/3d/A-2.png" size={64} />
          <div className="flex-1">
            <p className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
              안녕하세요!
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
              자산을 안전하게 지키고 있어요
            </p>
          </div>
          {/* 보안 뱃지 */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent-dim), var(--color-surface-dim))',
              boxShadow: '0 2px 8px rgba(107,78,232,0.1)',
            }}
          >
            <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-accent)' }}>
              verified_user
            </span>
          </div>
        </motion.div>

        {/* ── Pipeline Progress (활성 시에만 표시) ── */}
        {pipeline.startedAt !== null && (() => {
          const pct = calcOverallProgress(pipeline)
          const stages: PipelineStage[] = ['scan', 'stt', 'pii', 'label']

          if (pipeline.overallComplete) {
            // 완료 뱃지
            return (
              <motion.div
                variants={fadeSlideVariants}
                className="glass-card flex items-center gap-3 px-4 py-3"
                style={{ border: '1px solid var(--color-success)' }}
              >
                <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-success)' }}>
                  check_circle
                </span>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  데이터 준비 완료
                </p>
              </motion.div>
            )
          }

          // 진행 중
          return (
            <motion.div variants={fadeSlideVariants} className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  데이터 준비 중
                </p>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                  {pct}%
                </span>
              </div>

              <div className="w-full h-2 rounded-full mb-4 overflow-hidden" style={{ backgroundColor: 'var(--color-muted)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: DURATION.short, ease: EASE.standard }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                {stages.map((key) => {
                  const stage = pipeline[key]
                  const labels = PIPELINE_LABELS[key]
                  const isDone = stage.status === 'done'
                  const isRunning = stage.status === 'running'

                  return (
                    <div key={key} className="flex items-center gap-2.5 py-1">
                      <span
                        className={`material-symbols-outlined text-base flex-shrink-0 ${isRunning ? 'animate-spin' : ''}`}
                        style={{
                          color: isDone
                            ? 'var(--color-success)'
                            : isRunning
                              ? 'var(--color-accent)'
                              : 'var(--color-text-tertiary)',
                        }}
                      >
                        {isDone ? 'check_circle' : isRunning ? 'autorenew' : 'radio_button_unchecked'}
                      </span>
                      <span
                        className="text-xs flex-1"
                        style={{
                          color: isDone || isRunning ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {isDone ? labels.done : isRunning ? labels.running : labels.idle}
                      </span>
                      {(isDone || isRunning) && stage.total > 0 && (
                        <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
                          {stage.done.toLocaleString()}/{stage.total.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-[10px] text-center mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                완료되면 알려드릴게요
              </p>
            </motion.div>
          )
        })()}

        {/* ── 자동 처리 현황 모니터 ── */}
        {(() => {
          const sttRunning = sttGlobal.isProcessing || sttGlobal.queueLength > 0
          const labelRunning = pipeline.label.status === 'running'
          const piiRunning = pipeline.pii.status === 'running'
          const isProcessing = sttRunning || labelRunning || piiRunning
          const hasPipelineResult = pipeline.startedAt !== null

          // 파이프라인 시작 안 했고 STT도 안 돌고 있으면 표시 안 함
          if (!hasPipelineResult && !sttRunning) return null
          // 위의 Pipeline Progress 카드가 이미 상세 표시 중이면 중복 방지
          if (hasPipelineResult && !pipeline.overallComplete) return null

          // 완료 후에도 STT가 새로 돌고 있거나, 완료 상태 요약 표시
          const sttDoneLabel = sttGlobal.totalEnqueued > 0
            ? `${sttGlobal.completedCount.toLocaleString()}/${sttGlobal.totalEnqueued.toLocaleString()}`
            : '대기'
          const labelDoneLabel = pipeline.label.total > 0
            ? `${pipeline.label.done.toLocaleString()}/${pipeline.label.total.toLocaleString()}`
            : '대기'

          return (
            <motion.div variants={fadeSlideVariants} className="glass-card px-4 py-3">
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className={`material-symbols-outlined text-base ${isProcessing ? 'animate-spin' : ''}`}
                  style={{ color: isProcessing ? 'var(--color-accent)' : 'var(--color-success)' }}
                >
                  {isProcessing ? 'autorenew' : 'check_circle'}
                </span>
                <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                  {isProcessing ? '자동 처리 진행 중' : '자동 처리 완료'}
                </p>
              </div>

              <div className="flex flex-col gap-1">
                {/* STT 상태 */}
                <div className="flex items-center gap-2 py-0.5">
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ color: sttRunning ? 'var(--color-accent)' : 'var(--color-success)' }}
                  >
                    {sttRunning ? 'autorenew' : 'check_circle'}
                  </span>
                  <span className="text-xs flex-1" style={{ color: 'var(--color-text-sub)' }}>텍스트 추출</span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
                    {sttRunning ? sttDoneLabel : '완료'}
                  </span>
                </div>

                {/* 라벨링 상태 */}
                <div className="flex items-center gap-2 py-0.5">
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ color: labelRunning ? 'var(--color-accent)' : pipeline.label.status === 'done' ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
                  >
                    {labelRunning ? 'autorenew' : pipeline.label.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span className="text-xs flex-1" style={{ color: 'var(--color-text-sub)' }}>자동 라벨링</span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
                    {labelRunning ? labelDoneLabel : pipeline.label.status === 'done' ? '완료' : '대기'}
                  </span>
                </div>

                {/* 민감정보 보호 상태 */}
                <div className="flex items-center gap-2 py-0.5">
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ color: piiRunning ? 'var(--color-accent)' : pipeline.pii.status === 'done' ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
                  >
                    {piiRunning ? 'autorenew' : pipeline.pii.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span className="text-xs flex-1" style={{ color: 'var(--color-text-sub)' }}>민감정보 보호</span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
                    {piiRunning ? `${pipeline.pii.done.toLocaleString()}/${pipeline.pii.total.toLocaleString()}` : pipeline.pii.status === 'done' ? '완료' : '대기'}
                  </span>
                </div>
              </div>
            </motion.div>
          )
        })()}

        {/* ── S1: Value Summary ── */}
        <motion.div
          ref={valueSummaryRef}
          variants={fadeSlideVariants}
          className="glass-card p-4"
        >
          <div className={`grid gap-3 ${stats.lockedCount > 0 ? 'grid-cols-2' : 'grid-cols-1'} mb-3`}>
            <div
              className="rounded-2xl px-4 py-3"
              style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border-light)' }}
            >
              <p className="text-[10px] mb-1 font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>총 예상</p>
              <p className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
                ₩{formatWonCompact(stats.grossRange.low)} ~ ₩{formatWonCompact(stats.grossRange.high)}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                판매 가능 {stats.consentedPct}%
              </p>
            </div>
            {stats.lockedCount > 0 && (
              <div
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: 'var(--color-warning-dim)', border: '1px solid rgba(217, 119, 6, 0.2)' }}
              >
                <p className="text-[10px] mb-1 font-semibold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>잠금 보류</p>
                <p className="text-sm font-extrabold" style={{ color: 'var(--color-warning)' }}>
                  ₩{formatWonCompact(stats.lockedRange.low)} ~ ₩{formatWonCompact(stats.lockedRange.high)}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/value')}
            className="w-full flex items-center justify-center gap-2 py-3 font-bold text-sm active:scale-[0.98] transition-transform"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            가치 상세 보기
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </motion.div>

        {/* ── S2: Quick Stats ── */}
        <motion.div
          variants={fadeSlideVariants}
          className="grid grid-cols-2 gap-2.5"
        >
          {[
            { icon: 'graphic_eq', src: '/assets/3d/B-1.jpg', label: '총 파일', value: `${stats.totalSessions.toLocaleString()}건` },
            { icon: 'grid_view', src: '/assets/3d/B-7.jpg', label: '빌링 유닛', value: `${stats.buCount.toLocaleString()}개`, sub: stats.pendingSeconds > 0 ? `+${Math.round(stats.pendingSeconds).toLocaleString()}초 대기` : undefined},
            { icon: 'public', src: '/assets/3d/B-2.jpg', label: '공개 중', value: `${stats.publicCount.toLocaleString()}건` },
            { icon: 'verified', src: '/assets/3d/B-4.jpg', label: '품질', value: `${stats.qualityGrade}등급` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass-card flex items-center gap-2.5 px-3 py-2.5"
            >
              <Illust3D fallback={stat.icon} src={stat.src} size={28} />
              <div>
                <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{stat.label}</p>
                <p className="text-xs font-extrabold" style={{ color: 'var(--color-text)' }}>{stat.value}</p>
                {stat.sub && <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{stat.sub}</p>}
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── S3: 성장 그래프 + 품질 등급 (2열 그리드) ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* 성장 그래프 */}
          <motion.div variants={fadeSlideVariants} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold" style={{ color: 'var(--color-text-sub)' }}>자산 추이</p>
              <div className="flex gap-1">
                {(['today', '7d'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setGrowthPeriod(p)}
                    className="text-[9px] px-2 py-0.5 rounded-full font-semibold transition-colors"
                    style={{
                      backgroundColor: growthPeriod === p ? 'var(--color-accent-dim)' : 'transparent',
                      color: growthPeriod === p ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {p === 'today' ? '오늘' : '7일'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-20">
              <AreaChart
                data={growthPeriod === '7d' ? buildGrowthData(sessions) : buildGrowthData(sessions).slice(-1)}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {growthPeriod === '7d' ? (
                <>
                  {buildGrowthData(sessions).filter((_, i) => i % 2 === 0 || i === 6).map((d) => (
                    <span key={d.label}>{d.label}</span>
                  ))}
                </>
              ) : (
                <span>오늘 {(buildGrowthData(sessions).slice(-1)[0]?.count ?? 0).toLocaleString()}건</span>
              )}
            </div>
          </motion.div>

          {/* 품질 등급 도넛 */}
          <motion.button
            variants={fadeSlideVariants}
            onClick={() => navigate('/refinery')}
            className="glass-card p-5 text-left active:scale-[0.97] transition-transform"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold" style={{ color: 'var(--color-text-sub)' }}>품질 등급</p>
              <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-tertiary)' }}>chevron_right</span>
            </div>
            {(() => {
              const gradeA = sessions.filter((s) => (s.qaScore ?? 0) >= 80).length
              const gradeB = sessions.filter((s) => { const q = s.qaScore ?? 0; return q >= 60 && q < 80 }).length
              const gradeC = sessions.length - gradeA - gradeB
              const avgQa = sessions.length > 0
                ? Math.round(sessions.reduce((sum, s) => sum + (s.qaScore ?? 0), 0) / sessions.length)
                : 0
              const gradeLabel = avgQa >= 80 ? 'A' : avgQa >= 70 ? 'B+' : avgQa >= 60 ? 'B' : 'C'
              return (
                <>
                  <div className="w-20 h-20 mx-auto relative">
                    <DonutChart a={gradeA} b={gradeB} c={gradeC} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>{gradeLabel}</span>
                    </div>
                  </div>
                  <div className="flex justify-center gap-3 mt-3 text-[10px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                    <span><span style={{ color: 'var(--color-accent)' }}>A</span> {gradeA.toLocaleString()}</span>
                    <span><span style={{ color: '#86EFAC' }}>B</span> {gradeB.toLocaleString()}</span>
                    <span>C {gradeC.toLocaleString()}</span>
                  </div>
                </>
              )
            })()}
          </motion.button>
        </div>

        {/* ── S4: PII 리뷰 카드 (Priority 1) ── */}
        {stats.lockedCount > 0 && (
          <motion.div ref={lockedCardRef} variants={fadeSlideVariants}>
            <SoftPulse triggerKey={stats.lockedCount} maxPulses={1}>
              <button
                onClick={() => navigate('/pii-review')}
                className="w-full glass-card p-5 text-left active:scale-[0.98] transition-transform"
                style={{ border: '1.5px solid var(--color-warning)', background: 'var(--color-warning-dim)' }}
              >
                <div className="flex items-center gap-4">
                  <Illust3D fallback="lock_clock" src="/assets/3d/F-5.jpg" size={48} />
                  <div className="flex-1">
                    <p className="font-extrabold text-base" style={{ color: 'var(--color-text)' }}>
                      개인정보 검토 필요
                    </p>
                    <p className="text-sm mt-1 font-medium" style={{ color: 'var(--color-warning)' }}>
                      {stats.lockedCount.toLocaleString()}건 검토 시 잠금 해제
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-tertiary)' }}>
                    chevron_right
                  </span>
                </div>
              </button>
            </SoftPulse>
          </motion.div>
        )}

        {/* ── 퀘스트 카드 (Stage 2) ── */}
        {tutorialState.stage === 'quests' && (
          <motion.div
            variants={fadeSlideVariants}
            className="glass-card-elevated p-5"
            style={{ border: '2px solid var(--color-accent)' }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <Illust3D fallback="emoji_events" src="/assets/3d/A-3.png" size={28} />
              <p className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>시작 퀘스트</p>
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
                {tutorialState.questsDone.length}/3
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {([
                { id: 'asset_scan' as const, label: '자산 스캔 완료', icon: 'qr_code_scanner', route: '/assets', cta: '스캔하러 가기' },
                { id: 'share_prep' as const, label: '공개 준비 실행', icon: 'publish', route: '/profile', cta: '공개 준비하기' },
                { id: 'pii_review' as const, label: '잠금 세션 검토', icon: 'lock_open', route: '/pii-review', cta: '검토하러 가기' },
              ]).map((quest) => {
                const done = tutorialState.questsDone.includes(quest.id)
                return (
                  <div
                    key={quest.id}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{
                      backgroundColor: done ? 'var(--color-accent-dim)' : 'var(--color-surface-alt)',
                      border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {done ? (
                        <motion.span
                          key="done"
                          variants={stampVariants}
                          initial="hidden"
                          animate="visible"
                          className="material-symbols-outlined text-lg"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          check_circle
                        </motion.span>
                      ) : (
                        <motion.span
                          key="pending"
                          initial={{ opacity: 0.5 }}
                          animate={{ opacity: 1, transition: { duration: DURATION.short } }}
                          className="material-symbols-outlined text-lg"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          radio_button_unchecked
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className="material-symbols-outlined text-sm flex-shrink-0"
                        style={{ color: done ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                      >
                        {quest.icon}
                      </span>
                      <span
                        className={`text-xs truncate ${done ? 'line-through' : 'font-semibold'}`}
                        style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}
                      >
                        {quest.label}
                      </span>
                    </div>
                    {!done && (
                      <button
                        onClick={() => navigate(quest.route)}
                        className="flex-shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-xl active:scale-[0.95] transition-transform"
                        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
                      >
                        {quest.cta}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {tutorialState.questsDone.length >= 3 && (
              <button
                onClick={handleQuestDismiss}
                className="w-full mt-4 py-3 rounded-2xl text-sm font-bold active:scale-[0.98] transition-transform"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-text-on-accent)',
                  boxShadow: '0 4px 16px rgba(107, 78, 232, 0.2)',
                }}
              >
                완료!
              </button>
            )}
          </motion.div>
        )}

        {/* ── S5: 미션 카드 ── */}
        {stats.hasIncompleteMission && (
          <motion.button
            variants={fadeSlideVariants}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/missions')}
            className="w-full glass-card p-5 text-left"
          >
            <div className="flex items-center gap-4">
              <Illust3D fallback="rocket_launch" src="/assets/3d/B-6.jpg" size={48} />
              <div className="flex-1">
                <p className="font-extrabold text-base" style={{ color: 'var(--color-text)' }}>
                  오늘의 미션
                </p>
                <p className="text-sm mt-1 font-medium" style={{ color: 'var(--color-text-sub)' }}>
                  {stats.missionSummary}
                </p>
                {/* 진행 바 — 첫 번째 미완료 미션 기준 */}
                {(() => {
                  const m = MISSIONS.find((mi) => calcMissionProgress(mi.code, sessions) < mi.targetValue)
                  if (!m) return null
                  const cur = calcMissionProgress(m.code, sessions)
                  const pct = Math.min(100, Math.round((cur / m.targetValue) * 100))
                  return (
                    <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      />
                    </div>
                  )
                })()}
              </div>
              <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-tertiary)' }}>
                chevron_right
              </span>
            </div>
          </motion.button>
        )}

        {/* ── S6: 캠페인 카드 ── */}
        <motion.button
          variants={fadeSlideVariants}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/campaigns')}
          className="w-full glass-card p-5 text-left"
        >
          <div className="flex items-center gap-4">
            <Illust3D fallback="campaign" src="/assets/3d/B-8.jpg" size={48} />
            <div className="flex-1">
              <p className="font-extrabold text-base" style={{ color: 'var(--color-text)' }}>
                데이터 공개 캠페인
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-sub)' }}>
                공개 세션이 많을수록 가치가 높아집니다
              </p>
            </div>
            <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-tertiary)' }}>
              chevron_right
            </span>
          </div>
        </motion.button>

        {/* ── Scan CTA ── */}
        {sessions.length < 100 && (
          <motion.button
            variants={fadeSlideVariants}
            onClick={() => navigate('/assets')}
            className="glass-card py-3.5 text-center text-sm font-semibold active:scale-[0.98] transition-transform"
            style={{ color: 'var(--color-text-sub)' }}
          >
            <span className="material-symbols-outlined text-base mr-1.5 align-middle">qr_code_scanner</span>
            자산 더 스캔하기
          </motion.button>
        )}
      </motion.div>

      {/* ── 코치마크 오버레이 ── */}
      <AnimatePresence>
        {coachStep >= 0 && (() => {
          const targetRef = coachStep === 0 ? valueSummaryRef : lockedCardRef
          const el = targetRef.current
          if (!el) return null
          const rect = el.getBoundingClientRect()
          const messages = [
            '공개 세션이 많을수록 총 예상 가치가 올라갑니다.',
            '잠금 세션을 검토하면 추가 가치가 반영됩니다.',
          ]
          return (
            <motion.div
              key={`coach-${coachStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: DURATION.medium, ease: EASE.decelerate } }}
              exit={{ opacity: 0, transition: { duration: DURATION.short } }}
              className="fixed inset-0 z-50"
              onClick={handleCoachNext}
            >
              <div
                className="absolute"
                style={{
                  top: rect.top - 4,
                  left: rect.left - 4,
                  width: rect.width + 8,
                  height: rect.height + 8,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              />
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { duration: DURATION.medium, delay: 0.1, ease: EASE.decelerate } }}
                className="absolute glass-card-strong mx-5 px-5 py-4"
                style={{
                  top: rect.bottom + 14,
                  left: 0,
                  right: 0,
                  boxShadow: 'var(--glass-shadow-lg)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm leading-relaxed mb-4 font-medium" style={{ color: 'var(--color-text)' }}>
                  {messages[coachStep]}
                </p>
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleCoachSkip}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    건너뛰기
                  </button>
                  <button
                    onClick={handleCoachNext}
                    className="px-5 py-2 rounded-xl text-xs font-bold active:scale-[0.95] transition-transform"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--color-text-on-accent)',
                      boxShadow: '0 2px 12px rgba(107, 78, 232, 0.25)',
                    }}
                  >
                    {coachStep === 0 && stats.lockedCount > 0 ? '다음' : '확인'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
