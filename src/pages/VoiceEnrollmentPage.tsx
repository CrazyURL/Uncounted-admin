import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import {
  useEmbeddingEngine,
  enrollFromBuffer,
  resetProfile,
  isEnrolled,
  enrollmentProgress,
  ensureProfileLoaded,
  getEnrollmentQuality,
  getState as getEngineState,
} from '../lib/embeddingEngine'
import { VOICE_PROFILE_KEY, VERIFICATION_CACHE_KEY } from '../types/voiceBiometrics'
import { trackFunnel } from '../lib/funnelLogger'
import { startBackgroundVerification, useVerificationProgress } from '../lib/verificationEngine'
import { resampleTo16kMono } from '../lib/wavEncoder'
import ProgressBar from '../components/common/ProgressBar'

// ── 상수 ────────────────────────────────────────────────────────────────────

const MIN_RECORD_SEC = 5
const MAX_RECORD_SEC = 30
const MIN_ENROLLMENTS = 3

/** 각 등록 단계별 읽을 문장 (음소 다양성 극대화) */
const ENROLL_SENTENCES: string[] = [
  '가을 하늘 아래 공원 벤치에 앉아 따뜻한 커피를 마시며 좋아하는 책을 읽는 것은 참 행복한 시간입니다.',
  '지난 주말에 친구들과 함께 바닷가에 가서 파도 소리를 들으며 맛있는 해산물을 먹었습니다.',
  '우리 동네 작은 빵집에서 만든 초콜릿 크루아상은 바삭하고 달콤해서 매일 사고 싶을 정도입니다.',
]

/** RMS 기준: 이 값 이하이면 무음으로 판정 */
const SPEECH_RMS_THRESHOLD = 0.01

type EnrollStep = 'intro' | 'recording' | 'processing' | 'done'

/** 에러 메시지를 한국어 사용자 안내로 변환 */
function classifyEnrollError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  // 오디오 디코딩/버퍼 문제
  if (lower.includes('detached') || lower.includes('arraybuffer') || lower.includes('decode'))
    return '녹음 데이터를 처리할 수 없습니다. 다시 녹음해주세요.'

  // 마이크/미디어 접근
  if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('not allowed'))
    return '마이크 접근 권한이 필요합니다. 설정에서 마이크를 허용해주세요.'

  // ONNX / 모델 로딩
  if (lower.includes('onnx') || lower.includes('model') || lower.includes('inference'))
    return '음성 분석 모델을 불러오지 못했습니다. 앱을 재시작해주세요.'

  // 이미 처리 중
  if (lower.includes('이미 처리'))
    return '이전 녹음을 처리 중입니다. 잠시 후 다시 시도해주세요.'

  // 음성 품질/길이 부족
  if (lower.includes('duration') || lower.includes('too short') || lower.includes('길이'))
    return '녹음이 너무 짧습니다. 문장을 끝까지 읽어주세요.'

  // 네트워크
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('load'))
    return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인 후 다시 시도해주세요.'

  // 기타
  return `오류가 발생했습니다. 다시 녹음해주세요. (${msg.slice(0, 60)})`
}

// ── 녹음 상태 아이콘 ────────────────────────────────────────────────────────

function StepBadge({ index, done }: { index: number; done: boolean }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-xs font-bold"
      style={{
        width: 28,
        height: 28,
        backgroundColor: done ? 'var(--color-success)' : 'var(--color-muted)',
        color: done ? '#fff' : 'var(--color-text-sub)',
      }}
    >
      {done ? (
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
      ) : (
        index + 1
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function VoiceEnrollmentPage() {
  const navigate = useNavigate()
  const { profile, currentJob, isProcessing } = useEmbeddingEngine()

  const [step, setStep] = useState<EnrollStep>(
    isEnrolled() ? 'done' : 'intro',
  )
  const [recordSec, setRecordSec] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordSecRef = useRef(0)

  // localStorage 유실 시 Preferences에서 프로필 복원
  useEffect(() => {
    ensureProfileLoaded().then(() => {
      if (isEnrolled() && step === 'intro') setStep('done')
    })
  }, [])

  // ── 저장소 진단 (디버그용 — 문제 해결 후 제거) ──
  const [diag, setDiag] = useState<Record<string, string>>({})
  useEffect(() => {
    async function checkStorage() {
      const d: Record<string, string> = {}
      // localStorage
      try {
        const ls = localStorage.getItem(VOICE_PROFILE_KEY)
        d.ls = ls ? `OK (${ls.length}B)` : 'empty'
      } catch (e: any) { d.ls = `err: ${e.message?.slice(0, 30)}` }

      // localStorage 검증캐시
      try {
        const lc = localStorage.getItem(VERIFICATION_CACHE_KEY)
        d.lsCache = lc ? `OK (${lc.length}B)` : 'empty'
      } catch (e: any) { d.lsCache = `err: ${e.message?.slice(0, 30)}` }

      if (Capacitor.isNativePlatform()) {
        // Preferences
        try {
          const { value } = await Preferences.get({ key: VOICE_PROFILE_KEY })
          d.pref = value ? `OK (${value.length}B)` : 'empty'
        } catch (e: any) { d.pref = `err: ${e.message?.slice(0, 30)}` }

        // Preferences 검증캐시
        try {
          const { value } = await Preferences.get({ key: VERIFICATION_CACHE_KEY })
          d.prefCache = value ? `OK (${value.length}B)` : 'empty'
        } catch (e: any) { d.prefCache = `err: ${e.message?.slice(0, 30)}` }

        // Filesystem 프로필
        try {
          const f = await Filesystem.readFile({ path: 'voice_profile.json', directory: Directory.Data, encoding: Encoding.UTF8 })
          d.file = typeof f.data === 'string' ? `OK (${f.data.length}B)` : 'empty'
        } catch (e: any) { d.file = `err: ${e.message?.slice(0, 30)}` }

        // Filesystem 캐시
        try {
          const f = await Filesystem.readFile({ path: 'verification_cache.json', directory: Directory.Data, encoding: Encoding.UTF8 })
          d.fileCache = typeof f.data === 'string' ? `OK (${f.data.length}B)` : 'empty'
        } catch (e: any) { d.fileCache = `err: ${e.message?.slice(0, 30)}` }
      }
      d.enrolled = isEnrolled() ? 'YES' : 'NO'
      d.profileStatus = profile.enrollmentStatus
      d.embedCount = String(profile.enrollmentCount)
      setDiag(d)
    }
    checkStorage()
  }, [step, profile.enrollmentCount])

  // 녹음 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  // ── 녹음 시작 ──────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      })

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }

        if (recordSecRef.current < MIN_RECORD_SEC) {
          setError(`최소 ${MIN_RECORD_SEC}초 이상 녹음해주세요`)
          setStep('intro')
          return
        }

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const arrayBuffer = await blob.arrayBuffer()

        // ── 음성 존재 여부 검증 (RMS) ──
        // decodeAudioData가 ArrayBuffer를 detach하므로 복사본으로 검증
        // 디코딩 실패 시에는 통과 (WebView WebM 디코딩 미지원 가능)
        try {
          const pcm = await resampleTo16kMono(arrayBuffer.slice(0))
          let sumSq = 0
          for (let i = 0; i < pcm.length; i++) sumSq += pcm[i] * pcm[i]
          const rms = Math.sqrt(sumSq / pcm.length)
          if (rms < SPEECH_RMS_THRESHOLD) {
            setError('음성이 감지되지 않았습니다. 마이크를 확인하고 문장을 소리 내어 읽어주세요.')
            setStep('intro')
            return
          }
        } catch {
          // 디코딩 실패 — RMS 검증 스킵, 등록 진행
        }

        setStep('processing')

        try {
          await enrollFromBuffer(`enroll-${Date.now()}`, arrayBuffer)
          if (isEnrolled()) {
            trackFunnel('voice_enroll_complete')
            setStep('done')
            // 등록 완료 → 전체 세션 자동 검증 (글로벌 백그라운드 엔진)
            startBackgroundVerification()
          } else {
            // 품질 미달 시 currentJob.message에 안내가 있음
            // 주의: hook의 currentJob은 클로저 캡처 시점 값이라 stale할 수 있음
            // → getEngineState()로 모듈 최신 상태를 직접 조회
            const latest = getEngineState()
            if (latest.currentJob?.status === 'error' && latest.currentJob.message) {
              setError(latest.currentJob.message)
            }
            setStep('intro')
          }
        } catch (err) {
          setError(classifyEnrollError(err))
          setStep('intro')
        }
      }

      recorder.start(500)
      trackFunnel('voice_enroll_start')
      setRecordSec(0)
      recordSecRef.current = 0
      setStep('recording')

      timerRef.current = setInterval(() => {
        setRecordSec((prev) => {
          const next = prev + 1
          recordSecRef.current = next
          if (next >= MAX_RECORD_SEC) {
            recorder.stop()
          }
          return next
        })
      }, 1000)
    } catch {
      if (Capacitor.isNativePlatform()) {
        setError('마이크 접근 권한이 필요합니다. 앱 설정 > 권한에서 마이크를 허용해주세요.')
      } else {
        setError('마이크 접근 권한이 필요합니다. 브라우저 주소창 옆 자물쇠 아이콘에서 마이크를 허용해주세요.')
      }
    }
  }, [])

  // ── 녹음 중지 ──────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ── 초기화 ────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    resetProfile()
    setStep('intro')
    setError(null)
  }, [])

  // ── 렌더 ──────────────────────────────────────────────────────────────

  const enrollCount = profile.enrollmentCount
  const progress = enrollmentProgress()
  const verifyProgress = useVerificationProgress()

  // 등록 완료 상태에서 진입 시 백그라운드 검증 시작 (이미 실행 중이면 무시)
  useEffect(() => {
    if (step !== 'done' || !isEnrolled()) return
    startBackgroundVerification()
  }, [step])

  return (
    <div className="flex flex-col min-h-full px-4 py-6 gap-6">
      {/* 헤더 */}
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
          목소리 등록
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-sub)' }}>
          본인 음성을 등록하면 음성 데이터 판매가 가능해집니다
        </p>
      </div>

      {/* 등록 진행 상태 */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-muted)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: 'var(--color-accent)' }}
          >
            record_voice_over
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            등록 진행률
          </span>
          <span className="text-sm ml-auto" style={{ color: 'var(--color-text-sub)' }}>
            {enrollCount}/{MIN_ENROLLMENTS}
          </span>
        </div>
        <ProgressBar ratio={progress} />
        <div className="flex gap-3 mt-3">
          {Array.from({ length: MIN_ENROLLMENTS }).map((_, i) => (
            <StepBadge key={i} index={i} done={i < enrollCount} />
          ))}
        </div>
      </div>

      {/* Intro 단계 */}
      {step === 'intro' && (
        <div className="flex flex-col gap-4">
          {/* 안내 */}
          <div
            className="rounded-xl p-4"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-start gap-3">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 24, color: 'var(--color-accent)' }}
              >
                info
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  등록 방법
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
                  아래 문장을 자연스러운 톤으로 소리 내어 읽어주세요.
                  총 {MIN_ENROLLMENTS}번, 매번 다른 문장을 읽습니다.
                </p>
              </div>
            </div>
          </div>

          {/* 읽을 문장 카드 */}
          <div
            className="rounded-xl p-5"
            style={{
              backgroundColor: 'var(--color-accent-dim)',
              border: '1px solid var(--color-accent)',
            }}
          >
            <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--color-accent)' }}>
              {enrollCount + 1}번째 문장
            </p>
            <p
              className="text-base leading-relaxed font-medium"
              style={{ color: 'var(--color-text)' }}
            >
              "{ENROLL_SENTENCES[enrollCount] ?? ENROLL_SENTENCES[0]}"
            </p>
          </div>

          {/* 프라이버시 */}
          <div
            className="rounded-xl p-4"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-start gap-3">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 24, color: 'var(--color-success)' }}
              >
                shield
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  프라이버시 보호
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
                  음성 특징(임베딩)만 기기에 저장됩니다.
                  녹음 원본은 즉시 삭제되며, 서버로 전송되지 않습니다.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            <span className="material-symbols-outlined mr-1" style={{ fontSize: 18, verticalAlign: 'middle' }}>
              mic
            </span>
            {enrollCount === 0
              ? '녹음 시작'
              : `${enrollCount + 1}번째 녹음 시작`}
          </button>
        </div>
      )}

      {/* Recording 단계 */}
      {step === 'recording' && (
        <div className="flex flex-col items-center gap-5 py-6">
          {/* 읽을 문장 */}
          <div
            className="w-full rounded-xl p-4"
            style={{
              backgroundColor: 'var(--color-accent-dim)',
              border: '1px solid var(--color-accent)',
            }}
          >
            <p
              className="text-base leading-relaxed font-medium text-center"
              style={{ color: 'var(--color-text)' }}
            >
              "{ENROLL_SENTENCES[enrollCount] ?? ENROLL_SENTENCES[0]}"
            </p>
          </div>

          {/* 녹음 애니메이션 */}
          <div
            className="relative flex items-center justify-center"
            style={{ width: 100, height: 100 }}
          >
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{
                backgroundColor: 'var(--color-accent)',
                opacity: 0.15,
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 64,
                height: 64,
                backgroundColor: 'var(--color-accent)',
                opacity: 0.3,
              }}
            />
            <span
              className="material-symbols-outlined relative z-10"
              style={{ fontSize: 32, color: 'var(--color-accent)' }}
            >
              mic
            </span>
          </div>

          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
              {recordSec}초
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-sub)' }}>
              {recordSec < MIN_RECORD_SEC
                ? `최소 ${MIN_RECORD_SEC - recordSec}초 더 녹음하세요`
                : '위 문장을 다 읽으셨으면 완료를 눌러주세요'}
            </p>
          </div>

          <button
            onClick={stopRecording}
            disabled={recordSec < MIN_RECORD_SEC}
            className="px-8 py-3 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: recordSec < MIN_RECORD_SEC
                ? 'var(--color-muted)'
                : 'var(--color-accent)',
              color: recordSec < MIN_RECORD_SEC
                ? 'var(--color-text-tertiary)'
                : 'var(--color-text-on-accent)',
            }}
          >
            <span className="material-symbols-outlined mr-1" style={{ fontSize: 18, verticalAlign: 'middle' }}>
              stop
            </span>
            녹음 완료
          </button>
        </div>
      )}

      {/* Processing 단계 */}
      {step === 'processing' && currentJob && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="animate-spin">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 40, color: 'var(--color-accent)' }}
            >
              progress_activity
            </span>
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {currentJob.message}
          </p>
          {currentJob.progress > 0 && (
            <div className="w-48">
              <ProgressBar ratio={currentJob.progress} />
            </div>
          )}
        </div>
      )}

      {/* Done 단계 */}
      {step === 'done' && (() => {
        const quality = getEnrollmentQuality()
        return (
        <div className="flex flex-col items-center gap-4 py-6">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              backgroundColor: 'var(--color-success-dim)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 32, color: 'var(--color-success)' }}
            >
              verified_user
            </span>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              목소리 등록 완료
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-sub)' }}>
              등록된 목소리로 각 세션에서 본인 음성을 자동으로 확인합니다.
            </p>
            {verifyProgress.message && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-accent)' }}>
                {verifyProgress.message}
              </p>
            )}
          </div>

          {/* 등록 품질 카드 */}
          {quality && (
            <div
              className="w-full rounded-xl p-4"
              style={{
                backgroundColor: quality.grade === 'good'
                  ? 'var(--color-success-dim)'
                  : quality.grade === 'fair'
                    ? 'rgba(234, 179, 8, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${
                  quality.grade === 'good'
                    ? 'var(--color-success)'
                    : quality.grade === 'fair'
                      ? '#eab308'
                      : '#ef4444'
                }`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 20,
                    color: quality.grade === 'good'
                      ? 'var(--color-success)'
                      : quality.grade === 'fair'
                        ? '#eab308'
                        : '#ef4444',
                  }}
                >
                  {quality.grade === 'good' ? 'verified' : quality.grade === 'fair' ? 'info' : 'warning'}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  등록 품질: {quality.grade === 'good' ? '우수' : quality.grade === 'fair' ? '보통' : '낮음'}
                </span>
                <span className="text-xs ml-auto font-mono" style={{ color: 'var(--color-text-sub)' }}>
                  일관성 {(quality.avgPairwise * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
                {quality.message}
              </p>
              {quality.grade === 'poor' && (
                <button
                  onClick={handleReset}
                  className="mt-3 w-full py-2 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#fff',
                  }}
                >
                  재등록 권장 (조용한 환경에서 다시 녹음)
                </button>
              )}
            </div>
          )}

          {/* 검증 진행률 바 */}
          {verifyProgress.isRunning && verifyProgress.total > 0 && (
            <div className="w-full">
              <ProgressBar ratio={verifyProgress.done / verifyProgress.total} />
              <p className="text-[10px] text-center mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                {verifyProgress.done.toLocaleString()}/{verifyProgress.total.toLocaleString()} 완료
                {verifyProgress.verified > 0 && ` · 본인 음성 ${verifyProgress.verified.toLocaleString()}건`}
              </p>
            </div>
          )}

          {/* 완료 시 결과 요약 */}
          {!verifyProgress.isRunning && verifyProgress.verified > 0 && (
            <div
              className="w-full rounded-lg px-4 py-3 flex items-center gap-2"
              style={{ backgroundColor: 'var(--color-accent-dim)' }}
            >
              <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>check_circle</span>
              <span className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
                본인 음성 {verifyProgress.verified.toLocaleString()}건 확인됨
              </span>
            </div>
          )}

          <button
            onClick={() => navigate('/profile')}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
            }}
          >
            내 정보로 이동
          </button>

          <button
            onClick={handleReset}
            className="text-sm"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            등록 초기화 (재등록)
          </button>
        </div>
        )
      })()}

      {/* 에러 */}
      {error && (
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <div className="flex items-start gap-2 mb-2">
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>
              error
            </span>
            <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>
              {error}
            </p>
          </div>
          {error.includes('일관성') && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                일관성을 높이는 방법
              </p>
              {[
                { icon: 'volume_off', tip: '조용한 환경에서 녹음하세요 (TV, 음악 끄기)' },
                { icon: 'straighten', tip: '마이크와 입 사이 거리를 일정하게 유지하세요 (20~30cm)' },
                { icon: 'pace', tip: '3번 모두 같은 톤과 속도로 읽어주세요' },
                { icon: 'hearing', tip: '속삭이지 말고, 평소 대화할 때처럼 자연스럽게 말하세요' },
              ].map(({ icon, tip }) => (
                <div key={icon} className="flex items-start gap-2">
                  <span
                    className="material-symbols-outlined flex-shrink-0"
                    style={{ fontSize: 16, color: 'var(--color-text-sub)', marginTop: 1 }}
                  >
                    {icon}
                  </span>
                  <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
                    {tip}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 하단 안내 */}
      <div className="mt-auto pt-4">
        <p className="text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          등록된 목소리 특징은 기기에만 저장됩니다.
          <br />
          통신비밀보호법에 따라 본인 음성만 판매에 사용됩니다.
        </p>
      </div>

      {/* 저장소 진단 (디버그용 — 문제 해결 후 제거) */}
      {Object.keys(diag).length > 0 && (
        <div
          className="mt-4 rounded-lg p-3 text-[10px] font-mono leading-relaxed"
          style={{ backgroundColor: '#1a1a2e', color: '#8888cc' }}
        >
          <p className="font-bold mb-1" style={{ color: '#aaaaff' }}>Storage Diagnostic</p>
          <p>enrolled: {diag.enrolled} | status: {diag.profileStatus} | count: {diag.embedCount}</p>
          <p>localStorage profile: {diag.ls}</p>
          <p>localStorage cache: {diag.lsCache}</p>
          <p>Preferences profile: {diag.pref ?? 'N/A'}</p>
          <p>Preferences cache: {diag.prefCache ?? 'N/A'}</p>
          <p>File profile: {diag.file ?? 'N/A'}</p>
          <p>File cache: {diag.fileCache ?? 'N/A'}</p>
        </div>
      )}
    </div>
  )
}
