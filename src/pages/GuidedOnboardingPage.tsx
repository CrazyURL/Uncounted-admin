// ── GuidedOnboardingPage — 단계별 가이드 온보딩 ──────────────────────────────
// 스캔 → 설명 → 전체 활성화 → 동의 → 파이프라인 처리 까지 안내하는 풀스크린 위자드

import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION, EASE, fadeSlideVariants } from '../lib/motionTokens'
import { type Session } from '../types/session'
import { scanAudio, type ScanProgress } from '../lib/scanEngine'
import { saveAllSessions } from '../lib/sessionMapper'
import {
  loadUserSettings,
  saveUserSettings,
  buildConsentVersion,
  saveConsentFlag,
  saveConsentToIDB,
} from '../lib/globalConsent'
import { calcQualityGrade } from '../lib/valueEngine'
import { setSttMode } from '../lib/sttEngine'
import { runFullPipeline } from '../lib/pipelineOrchestrator'
import { usePipelineState, calcOverallProgress, type PipelineStage } from '../lib/pipelineState'
import { completeQuest, advanceStage } from '../lib/tutorialStore'
import CountUpNumber from '../components/motion/CountUpNumber'
import StepperProgress from '../components/motion/StepperProgress'
import Illust3D from '../components/domain/Illust3D'

// ── 타입 ──────────────────────────────────────────────────────────────────────

type GuidedStep =
  | 'scan_intro'
  | 'scanning'
  | 'scan_results'
  | 'explain'
  | 'all_activate'
  | 'consent'
  | 'processing'
  | 'complete'

const STEP_PHASE: Record<GuidedStep, number> = {
  scan_intro: 0, scanning: 0, scan_results: 0,
  explain: 1, all_activate: 1, consent: 1,
  processing: 2, complete: 2,
}

const PHASES = [
  { label: '스캔' },
  { label: '설정' },
  { label: '완료' },
]

// ── 활성화 항목 ──────────────────────────────────────────────────────────────

type ActivationKey = 'autoScan' | 'stt' | 'piiAutoProtect' | 'dataSharing'

const ACTIVATION_ITEMS: { key: ActivationKey; icon: string; label: string; desc: string }[] = [
  { key: 'autoScan', icon: 'sync', label: '자동 스캔', desc: '앱 접속 시 새 녹음 자동 감지' },
  { key: 'stt', icon: 'mic', label: '텍스트 추출', desc: '음성을 텍스트로 변환 (기기 내 처리)' },
  { key: 'piiAutoProtect', icon: 'shield', label: '민감정보 자동 보호', desc: '개인정보 자동 마스킹 및 beep 처리' },
  { key: 'dataSharing', icon: 'monetization_on', label: '수익 받기', desc: '데이터 공개하여 수익 산정 시작' },
]

// ── 파이프라인 단계 표시 ─────────────────────────────────────────────────────

const STAGE_LABELS: Record<PipelineStage, { idle: string; running: string; done: string }> = {
  scan: { idle: '파일 스캔', running: '파일 스캔 중...', done: '파일 스캔 완료' },
  stt: { idle: '텍스트 추출', running: '텍스트 추출 중...', done: '텍스트 추출 완료' },
  pii: { idle: '민감정보 보호', running: '민감정보 보호 중...', done: '민감정보 보호 완료' },
  label: { idle: '자동 라벨링', running: '자동 라벨링 중...', done: '자동 라벨링 완료' },
}

// ── 공개 대상 / 비공개 항목 ──────────────────────────────────────────────────

const PUBLIC_SCOPE = [
  '음성 파일 메타데이터 (길이, 날짜, 품질 점수)',
  '사용자가 입력한 라벨 (관계·목적·도메인·톤·소음)',
  '휴대폰 통화 이벤트 버킷 (건수, 시간대 — 내용 없음)',
  '기기 환경 버킷 (연결성, 배터리 수준 — 위치 없음)',
]

const NOT_PUBLIC = [
  '음성 통화 내용 (대화·녹취록)',
  '이름·주소·전화번호 등 PII',
  'GPU AI 추론 결과물',
  '정밀 위치·정밀 타임스탬프',
]

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function GuidedOnboardingPage() {
  const navigate = useNavigate()
  const pipeline = usePipelineState()

  const [step, setStep] = useState<GuidedStep>('scan_intro')
  const [sessions, setSessions] = useState<Session[]>([])
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [activations, setActivations] = useState<Record<ActivationKey, boolean>>({
    autoScan: true,
    stt: true,
    piiAutoProtect: true,
    dataSharing: true,
  })

  const phase = STEP_PHASE[step]
  const completedPhase = step === 'complete' ? 2 : phase - 1

  // ── 파이프라인 완료 → complete 단계로 전환 ────────────────────────────────

  useEffect(() => {
    if (step === 'processing' && pipeline.overallComplete) {
      setStep('complete')
    }
  }, [step, pipeline.overallComplete])

  // ── 스캔 실행 ──────────────────────────────────────────────────────────────

  const handleStartScan = useCallback(async () => {
    setStep('scanning')
    try {
      const result = await scanAudio((p) => setScanProgress(p))
      setSessions(result.sessions)
      completeQuest('asset_scan')
      setStep('scan_results')
    } catch {
      setStep('scan_results')
    }
  }, [])

  // ── 전체 활성화 처리 ──────────────────────────────────────────────────────

  const handleActivateAll = useCallback(() => {
    // 자동 스캔
    localStorage.setItem('uncounted_auto_scan', activations.autoScan ? 'on' : 'off')

    // STT
    setSttMode(activations.stt ? 'on' : 'off')

    // PII 자동 보호
    localStorage.setItem('uncounted_pii_auto_protect', activations.piiAutoProtect ? 'on' : 'off')

    // 데이터 공유가 체크되어 있으면 동의 단계로
    if (activations.dataSharing) {
      setStep('consent')
    } else {
      // 공유 안 하면 바로 파이프라인 시작
      void runFullPipeline(sessions)
      setStep('processing')
    }
  }, [activations, sessions])

  // ── 공개 동의 처리 ─────────────────────────────────────────────────────────

  const handleConsent = useCallback(async (consent: boolean) => {
    if (consent) {
      const settings = loadUserSettings()
      const newSettings = {
        ...settings,
        globalShareConsentEnabled: true,
        globalShareConsentUpdatedAt: new Date().toISOString().slice(0, 10),
        consentVersion: buildConsentVersion(),
      }
      saveUserSettings(newSettings)
      void saveConsentFlag(true, newSettings)
      void saveConsentToIDB(true, newSettings)

      // 세션에 공개 상태 일괄 적용 (LOCKED 제외)
      const updated = sessions.map((s) => {
        if (s.piiStatus === 'LOCKED') return s
        return {
          ...s,
          isPublic: true,
          visibilityStatus: 'PUBLIC_CONSENTED' as const,
          visibilitySource: 'GLOBAL_DEFAULT' as const,
          visibilityConsentVersion: newSettings.consentVersion,
          visibilityChangedAt: new Date().toISOString().slice(0, 10),
        }
      })
      setSessions(updated)
      await saveAllSessions(updated)
      completeQuest('share_prep')
    }

    // 동의/비동의 모두 파이프라인 시작
    void runFullPipeline(sessions)
    setStep('processing')
  }, [sessions])

  // ── 완료 처리 ─────────────────────────────────────────────────────────────

  const handleComplete = useCallback(() => {
    advanceStage('done')
    navigate('/home', { replace: true })
  }, [navigate])

  // ── 통계 헬퍼 ─────────────────────────────────────────────────────────────

  const totalHours = sessions.reduce((sum, s) => sum + s.duration, 0) / 3600
  const totalMinutes = Math.round((totalHours % 1) * 60)
  const gradeDistribution = sessions.reduce(
    (acc, s) => {
      const g = calcQualityGrade(s.qaScore ?? 70)
      acc[g]++
      return acc
    },
    { A: 0, B: 0, C: 0 } as Record<string, number>,
  )

  const overallPct = calcOverallProgress(pipeline)

  // ── 활성화 토글 ───────────────────────────────────────────────────────────

  const toggleActivation = (key: ActivationKey) => {
    setActivations((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* 배경 그라디언트 */}
      <div
        className="fixed top-0 left-0 w-full h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 0%, var(--color-accent-dim) 0%, transparent 70%)' }}
      />

      {/* 상단 스텝 표시 */}
      <div
        className="relative z-10 px-6"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        <StepperProgress
          steps={PHASES}
          activeIndex={phase}
          completedUpTo={completedPhase}
          className="pt-4 pb-2"
        />
      </div>

      {/* 콘텐츠 영역 */}
      <div className="relative z-10 flex-1 flex flex-col px-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={fadeSlideVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex-1 flex flex-col"
          >
            {/* ── scan_intro ─────────────────────────────────────── */}
            {step === 'scan_intro' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Illust3D fallback="folder_open" src="/assets/3d/C-1.jpg" size={120} className="mb-4" />
                <h1 className="text-xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
                  기기에서 음성 파일을 찾아볼게요
                </h1>
                <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                  녹음/통화/음악 폴더를 탐색합니다.{'\n'}
                  원본 파일을 수정하거나 삭제하지 않습니다.
                </p>
                <div
                  className="w-full rounded-xl p-4 mb-4"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {['Recordings', 'Call', 'Music'].map((dir) => (
                    <div key={dir} className="flex items-center gap-2 py-1.5">
                      <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>folder</span>
                      <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>{dir}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── scanning ───────────────────────────────────────── */}
            {step === 'scanning' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: 'var(--color-accent-dim)' }}
                >
                  <span className="material-symbols-outlined text-4xl animate-spin" style={{ color: 'var(--color-accent)' }}>
                    radar
                  </span>
                </div>
                <h1 className="text-xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>
                  스캔 중...
                </h1>
                <div className="w-full h-2 rounded-full mb-4 overflow-hidden" style={{ backgroundColor: 'var(--color-muted)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                    animate={{ width: scanProgress?.phase === 'done' ? '100%' : '60%' }}
                    transition={{ duration: DURATION.medium, ease: EASE.standard }}
                  />
                </div>
                <p className="text-2xl font-extrabold mb-2" style={{ color: 'var(--color-accent)' }}>
                  <CountUpNumber value={scanProgress?.found ?? 0} duration={0.3} />
                  <span className="text-base font-normal ml-1" style={{ color: 'var(--color-text-sub)' }}>개 발견</span>
                </p>
                {scanProgress?.currentDir && (
                  <p className="text-xs truncate max-w-[280px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {scanProgress.currentDir}
                  </p>
                )}
              </div>
            )}

            {/* ── scan_results ───────────────────────────────────── */}
            {step === 'scan_results' && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <h1 className="text-xl font-extrabold mb-1 text-center" style={{ color: 'var(--color-text)' }}>
                  스캔 완료
                </h1>
                <p className="text-sm mb-6 text-center" style={{ color: 'var(--color-text-sub)' }}>
                  이 파일들이 당신의 데이터 자산입니다
                </p>

                <div
                  className="w-full rounded-2xl p-5 mb-4"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-center flex-1">
                      <p className="text-2xl font-extrabold" style={{ color: 'var(--color-accent)' }}>
                        {sessions.length.toLocaleString()}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>음성 파일</p>
                    </div>
                    <div className="w-px h-10" style={{ backgroundColor: 'var(--color-border)' }} />
                    <div className="text-center flex-1">
                      <p className="text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>
                        {Math.floor(totalHours).toLocaleString()}
                        <span className="text-sm font-normal">시간 </span>
                        {totalMinutes.toLocaleString()}
                        <span className="text-sm font-normal">분</span>
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>총 시간</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {([
                      { grade: 'A', desc: '고품질' },
                      { grade: 'B', desc: '보통' },
                      { grade: 'C', desc: '개선필요' },
                    ] as const).map(({ grade, desc }) => (
                      <div
                        key={grade}
                        className="flex-1 rounded-xl py-2 text-center"
                        style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
                      >
                        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{gradeDistribution[grade].toLocaleString()}</p>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{grade} {desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {sessions.length === 0 && (
                  <p className="text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    발견된 파일이 없습니다. 나중에 자산 탭에서 스캔할 수 있습니다.
                  </p>
                )}
              </div>
            )}

            {/* ── explain ─────────────────────────────────────────── */}
            {step === 'explain' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Illust3D fallback="auto_awesome" src="/assets/3d/C-2.jpg" size={100} className="mb-4" />
                <h1 className="text-xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
                  데이터를 자동으로 준비해드려요
                </h1>
                <p className="text-sm mb-6" style={{ color: 'var(--color-text-sub)' }}>
                  아래 3가지를 자동으로 처리합니다
                </p>

                <div className="w-full flex flex-col gap-3">
                  {[
                    {
                      icon: 'shield',
                      title: '민감정보 자동 보호',
                      desc: '이름, 전화번호 등 개인정보를 자동 감지하고 마스킹합니다',
                    },
                    {
                      icon: 'mic',
                      title: '텍스트 추출',
                      desc: '음성을 텍스트로 변환하여 데이터 활용도를 높입니다',
                    },
                    {
                      icon: 'label',
                      title: '자동 라벨링',
                      desc: '통화 패턴을 분석하여 관계, 목적, 도메인을 자동 추정합니다',
                    },
                  ].map((item) => (
                    <div
                      key={item.icon}
                      className="w-full rounded-xl px-4 py-3.5 flex items-start gap-3 text-left"
                      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: 'var(--color-accent-dim)' }}
                      >
                        <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-accent)' }}>
                          {item.icon}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--color-text)' }}>{item.title}</p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── all_activate ─────────────────────────────────────── */}
            {step === 'all_activate' && (
              <div className="flex-1 flex flex-col pt-4">
                <h1 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
                  전체 활성화
                </h1>
                <p className="text-sm mb-5" style={{ color: 'var(--color-text-sub)' }}>
                  모든 기능을 켜면 데이터 가치가 극대화됩니다
                </p>

                <div className="flex flex-col gap-2.5">
                  {ACTIVATION_ITEMS.map((item) => {
                    const checked = activations[item.key]
                    return (
                      <button
                        key={item.key}
                        onClick={() => toggleActivation(item.key)}
                        className="w-full rounded-xl px-4 py-3.5 flex items-center gap-3 text-left transition-colors"
                        style={{
                          backgroundColor: checked ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                          border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        }}
                      >
                        <span
                          className="material-symbols-outlined text-xl flex-shrink-0"
                          style={{ color: checked ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                        >
                          {checked ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: checked ? 'rgba(255,255,255,0.1)' : 'var(--color-muted)' }}
                        >
                          <span className="material-symbols-outlined text-lg" style={{ color: checked ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                            {item.icon}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: checked ? 'var(--color-text)' : 'var(--color-text-sub)' }}>
                            {item.label}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {item.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <p className="text-xs text-center mt-5" style={{ color: 'var(--color-text-tertiary)' }}>
                  내정보에서 언제든 변경할 수 있어요
                </p>
              </div>
            )}

            {/* ── consent ────────────────────────────────────────── */}
            {step === 'consent' && (
              <div className="flex-1 flex flex-col pt-2">
                <h1 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
                  데이터 공개 동의
                </h1>
                <p className="text-xs mb-3" style={{ color: 'var(--color-text-sub)' }}>
                  개인정보 없는 데이터를 공개하면 수익이 산정됩니다
                </p>

                {/* 공개 대상 */}
                <div
                  className="rounded-xl px-3 py-2.5 mb-2"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    공개 대상 항목
                  </p>
                  {PUBLIC_SCOPE.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5">
                      <span className="material-symbols-outlined text-xs flex-shrink-0 mt-px" style={{ color: 'var(--color-accent)' }}>check</span>
                      <span className="text-[11px] leading-snug" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
                    </div>
                  ))}
                </div>

                {/* 비공개 */}
                <div
                  className="rounded-xl px-3 py-2.5 mb-2"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    공개하지 않는 항목
                  </p>
                  {NOT_PUBLIC.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5">
                      <span className="material-symbols-outlined text-xs flex-shrink-0 mt-px" style={{ color: 'var(--color-danger)' }}>cancel</span>
                      <span className="text-[11px] leading-snug" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── processing ──────────────────────────────────────── */}
            {step === 'processing' && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <h1 className="text-xl font-extrabold mb-1 text-center" style={{ color: 'var(--color-text)' }}>
                  데이터 준비 중
                </h1>
                <p className="text-sm mb-5 text-center" style={{ color: 'var(--color-text-sub)' }}>
                  백그라운드에서 자동으로 처리됩니다
                </p>

                {/* 전체 프로그레스 */}
                <div className="w-full flex items-center gap-3 mb-6">
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-muted)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: 'var(--color-accent)' }}
                      animate={{ width: `${overallPct}%` }}
                      transition={{ duration: DURATION.short, ease: EASE.standard }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                    {overallPct}%
                  </span>
                </div>

                {/* 단계별 상태 */}
                <div
                  className="w-full rounded-2xl p-4"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {(['scan', 'stt', 'pii', 'label'] as PipelineStage[]).map((key) => {
                    const stage = pipeline[key]
                    const labels = STAGE_LABELS[key]
                    const isDone = stage.status === 'done'
                    const isRunning = stage.status === 'running'

                    return (
                      <div key={key} className="flex items-center gap-3 py-2.5">
                        <span
                          className={`material-symbols-outlined text-xl flex-shrink-0 ${isRunning ? 'animate-spin' : ''}`}
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
                        <div className="flex-1 min-w-0">
                          <span
                            className="text-sm"
                            style={{
                              color: isDone
                                ? 'var(--color-text)'
                                : isRunning
                                  ? 'var(--color-text)'
                                  : 'var(--color-text-tertiary)',
                            }}
                          >
                            {isDone ? labels.done : isRunning ? labels.running : labels.idle}
                          </span>
                        </div>
                        {(isDone || isRunning) && stage.total > 0 && (
                          <span className="text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                            {stage.done.toLocaleString()}/{stage.total.toLocaleString()}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                <p className="text-xs text-center mt-5" style={{ color: 'var(--color-text-tertiary)' }}>
                  홈으로 이동해도 백그라운드에서 계속 처리됩니다
                </p>
              </div>
            )}

            {/* ── complete ───────────────────────────────────────── */}
            {step === 'complete' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Illust3D fallback="celebration" src="/assets/3d/A-5.png" size={120} className="mb-6" />
                <h1 className="text-xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
                  준비 완료!
                </h1>
                <p className="text-sm mb-6" style={{ color: 'var(--color-text-sub)' }}>
                  데이터 준비가 완료되었습니다
                </p>

                <div
                  className="w-full rounded-2xl p-4"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex flex-col gap-2.5">
                    <div className="flex justify-between">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>스캔된 파일</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                        {sessions.length.toLocaleString()}개
                      </span>
                    </div>
                    {pipeline.stt.total > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>텍스트 추출</span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                          {pipeline.stt.done.toLocaleString()}건
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>민감정보 보호</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                        {pipeline.pii.done.toLocaleString()}건 처리
                      </span>
                    </div>
                    {pipeline.label.total > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>자동 라벨링</span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                          {pipeline.label.done.toLocaleString()}건
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 CTA */}
      <div
        className="relative z-10 px-6 pt-3"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {step === 'scan_intro' && (
          <button
            onClick={handleStartScan}
            className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            스캔 시작
          </button>
        )}

        {step === 'scan_results' && (
          <button
            onClick={() => setStep(sessions.length > 0 ? 'explain' : 'complete')}
            className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            다음
          </button>
        )}

        {step === 'explain' && (
          <button
            onClick={() => setStep('all_activate')}
            className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            다음
          </button>
        )}

        {step === 'all_activate' && (
          <button
            onClick={handleActivateAll}
            className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            전체 활성화
          </button>
        )}

        {step === 'consent' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleConsent(true)}
              className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
            >
              동의하고 계속
            </button>
            <button
              onClick={() => handleConsent(false)}
              className="w-full py-3 rounded-xl text-sm"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              동의하지 않음
            </button>
          </div>
        )}

        {step === 'processing' && (
          <button
            onClick={handleComplete}
            className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            홈으로 이동
          </button>
        )}

        {step === 'complete' && (
          <button
            onClick={handleComplete}
            className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            홈으로 가기
          </button>
        )}
      </div>
    </div>
  )
}
