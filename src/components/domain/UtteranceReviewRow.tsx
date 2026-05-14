// 발화 단위 검수 + 자동라벨 확인 행 (STAGE 14)
// 오디오 재생 → 감정/대화행위 선택 → 저장 → 다음 needs_review 자동 이동

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminUtterance, LabelSource } from '../../lib/api/utterances'
import { fetchUtteranceAudio, patchUtterance } from '../../lib/api/utterances'

// ── 상수 ──────────────────────────────────────────────────────────────────
const EMOTION_OPTIONS = ['기쁨', '놀람', '슬픔', '분노', '불안', '당황', '중립'] as const
type Emotion = (typeof EMOTION_OPTIONS)[number]

const EMOTION_KEY_MAP: Record<string, Emotion> = {
  '1': '기쁨',
  '2': '놀람',
  '3': '슬픔',
  '4': '분노',
  '5': '불안',
  '6': '당황',
  '7': '중립',
}

const DIALOG_ACT_OPTIONS = [
  '진술', '질문', '요청', '감사', '동의', '부정', '인사', '기타',
] as const
type DialogAct = (typeof DIALOG_ACT_OPTIONS)[number]

function emotionColor(emotion: string | null): string {
  switch (emotion) {
    case '기쁨': return 'text-green-700 bg-green-50 border-green-300'
    case '놀람': return 'text-yellow-700 bg-yellow-50 border-yellow-300'
    case '슬픔': return 'text-blue-700 bg-blue-50 border-blue-300'
    case '분노': return 'text-red-700 bg-red-50 border-red-300'
    case '불안': return 'text-orange-700 bg-orange-50 border-orange-300'
    case '당황': return 'text-purple-700 bg-purple-50 border-purple-300'
    default: return 'text-gray-600 bg-gray-100 border-gray-300'
  }
}

function labelSourceBadge(source: LabelSource | null): {
  label: string
  cls: string
  icon: string
} {
  switch (source) {
    case 'auto_confirmed':
      return { label: '자동확인', cls: 'text-green-700 bg-green-50', icon: 'check_circle' }
    case 'auto_review':
      return { label: '검토권장', cls: 'text-yellow-700 bg-yellow-50', icon: 'help' }
    case 'needs_review':
      return { label: '확인필요', cls: 'text-red-700 bg-red-50', icon: 'error' }
    case 'admin_confirmed':
      return { label: '어드민확인', cls: 'text-blue-700 bg-blue-50', icon: 'verified' }
    case 'user_confirmed':
      return { label: '사용자확인', cls: 'text-purple-700 bg-purple-50', icon: 'person_check' }
    default:
      return { label: source ?? '없음', cls: 'text-gray-500 bg-gray-100', icon: 'label' }
  }
}

// ── Props ─────────────────────────────────────────────────────────────────
export interface UtteranceReviewRowProps {
  utterance: AdminUtterance
  checked: boolean
  included: boolean
  busy: boolean
  isDanger: boolean
  onToggleSelect: () => void
  onToggleReview: () => void
  /** 저장 성공 시 호출 — 부모가 낙관 업데이트 후 다음 needs_review 로 스크롤 */
  onLabelSaved?: (id: string, updatedFields: Partial<AdminUtterance>) => void
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────
export function UtteranceReviewRow({
  utterance,
  checked,
  included,
  busy,
  isDanger,
  onToggleSelect,
  onToggleReview,
  onLabelSaved,
}: UtteranceReviewRowProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)

  const [selectedEmotion, setSelectedEmotion] = useState<Emotion | null>(
    (utterance.emotion as Emotion | null) ?? null,
  )
  const [selectedDialogAct, setSelectedDialogAct] = useState<DialogAct | null>(
    (utterance.dialog_act as DialogAct | null) ?? null,
  )

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // 상위에서 utterance 가 바뀌면 선택값 동기화
  useEffect(() => {
    setSelectedEmotion((utterance.emotion as Emotion | null) ?? null)
    setSelectedDialogAct((utterance.dialog_act as DialogAct | null) ?? null)
  }, [utterance.emotion, utterance.dialog_act])

  // 오디오 로드 + 재생
  const handlePlay = useCallback(async () => {
    if (audioRef.current && audioUrl) {
      if (playing) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      return
    }

    setAudioLoading(true)
    setAudioError(null)
    const res = await fetchUtteranceAudio(utterance.id)
    setAudioLoading(false)

    if (res.error || !res.data?.url) {
      setAudioError(res.error ?? '오디오 URL 없음')
      return
    }

    setAudioUrl(res.data.url)
    setIsReviewing(true)

    // URL 세팅 후 다음 tick에 재생
    setTimeout(() => {
      audioRef.current?.play().catch(() => {})
    }, 50)
  }, [audioUrl, playing, utterance.id])

  // 저장
  const handleSave = useCallback(async () => {
    if (!selectedEmotion || saving) return
    setSaving(true)
    setSaveError(null)

    const body = {
      emotion: selectedEmotion,
      dialog_act: selectedDialogAct ?? undefined,
      label_source: 'admin_confirmed' as LabelSource,
    }

    // 낙관적 업데이트를 위해 미리 호출
    const updatedFields: Partial<AdminUtterance> = {
      emotion: selectedEmotion,
      dialog_act: selectedDialogAct,
      label_source: 'admin_confirmed',
    }
    onLabelSaved?.(utterance.id, updatedFields)

    const res = await patchUtterance(utterance.id, body)
    setSaving(false)

    if (res.error) {
      setSaveError(res.error)
      // 롤백 — 원래값으로 복원
      onLabelSaved?.(utterance.id, {
        emotion: utterance.emotion,
        dialog_act: utterance.dialog_act,
        label_source: utterance.label_source,
      })
      return
    }

    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 600)
    setIsReviewing(false)
  }, [selectedEmotion, selectedDialogAct, saving, utterance, onLabelSaved])

  // 키보드 단축키 (row 포커스 시)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isReviewing) return

      if (e.code === 'Space') {
        e.preventDefault()
        handlePlay()
        return
      }

      const emotion = EMOTION_KEY_MAP[e.key]
      if (emotion) {
        e.preventDefault()
        setSelectedEmotion(emotion)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    },
    [isReviewing, handlePlay, handleSave],
  )

  const sourceBadge = labelSourceBadge(utterance.label_source)

  return (
    <div
      ref={rowRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={[
        'px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent',
        isDanger ? 'bg-red-50' : savedFlash ? 'bg-green-50' : '',
        'transition-colors duration-300',
      ].join(' ')}
      title={isDanger ? 'PII 의심 발화 — 검수자 확인 필요' : undefined}
    >
      {/* 기본 행 */}
      <div className="flex items-center gap-3">
        {/* 체크박스 */}
        <input
          type="checkbox"
          checked={checked}
          disabled={!included}
          onChange={onToggleSelect}
          className="rounded border-border text-accent focus:ring-accent disabled:opacity-30"
        />

        {/* 재생 버튼 */}
        <button
          type="button"
          onClick={handlePlay}
          disabled={audioLoading}
          className="flex-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-bg-hover text-txt-sub hover:text-accent disabled:opacity-40 transition-colors"
          title={utterance.label_source ? '오디오 재생 + 라벨 검수' : '오디오 재생'}
        >
          {audioLoading ? (
            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          ) : playing ? (
            <WaveformIcon />
          ) : (
            <span className="material-symbols-outlined text-sm">play_circle</span>
          )}
        </button>

        {/* 시간 */}
        <span className="text-xs text-txt-sub font-mono w-14 tabular-nums">
          {formatMs(utterance.start_ms)}
        </span>
        <span className="text-xs text-txt-sub w-10 tabular-nums text-right">
          {utterance.duration_seconds.toFixed(1)}초
        </span>
        <span className="text-xs text-txt-sub w-10">
          {utterance.speaker_id ? `S${utterance.speaker_id.slice(-2)}` : '-'}
        </span>

        {/* 발화 텍스트 */}
        <span className="flex-1 truncate text-txt" title={utterance.text || '(공백)'}>
          {renderTextWithPiiHint(utterance.text)}
        </span>

        {/* 감정 배지 */}
        {utterance.emotion && (
          <span
            className={[
              'text-xs px-1.5 py-0.5 rounded border font-medium whitespace-nowrap',
              emotionColor(utterance.emotion),
            ].join(' ')}
          >
            {utterance.emotion}
            {utterance.emotion_confidence != null && (
              <span className="ml-1 opacity-60">
                {Math.round(utterance.emotion_confidence * 100)}%
              </span>
            )}
          </span>
        )}

        {/* label_source 배지 */}
        {utterance.label_source && (
          <span
            className={[
              'text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5 whitespace-nowrap',
              sourceBadge.cls,
            ].join(' ')}
          >
            <span className="material-symbols-outlined text-xs">{sourceBadge.icon}</span>
            {sourceBadge.label}
          </span>
        )}

        {/* 단가 */}
        <span
          className="tabular-nums text-xs text-txt whitespace-nowrap"
          title="₩30,000/h 기준 · 확정 금액 아님"
        >
          ₩{utterance.unit_price_krw.toLocaleString('ko-KR')}
        </span>

        {/* 포함/제외 배지 */}
        {included ? (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-300 whitespace-nowrap">
            포함
          </span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-300 whitespace-nowrap">
            제외
          </span>
        )}

        {/* 포함/제외 토글 */}
        <button
          type="button"
          disabled={busy}
          onClick={onToggleReview}
          className="text-xs px-2 py-0.5 rounded border border-border-soft hover:bg-bg-hover disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? '...' : included ? '제외' : '포함'}
        </button>
      </div>

      {/* 오디오 엘리먼트 (숨김) */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setIsReviewing(true)
            rowRef.current?.focus()
          }}
          className="hidden"
        />
      )}

      {/* 오디오 에러 */}
      {audioError && (
        <div className="mt-1 ml-10 text-xs text-red-600">{audioError}</div>
      )}

      {/* 라벨 선택 영역 (재생 후 또는 클릭) */}
      {isReviewing && (
        <div className="mt-2 ml-10 flex flex-wrap items-center gap-3">
          {/* 감정 선택 */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-txt-sub mr-1">감정</span>
            {EMOTION_OPTIONS.map((em, idx) => (
              <button
                key={em}
                type="button"
                onClick={() => setSelectedEmotion(em)}
                className={[
                  'text-xs px-2 py-1 rounded border transition-colors',
                  selectedEmotion === em
                    ? emotionColor(em) + ' font-semibold'
                    : 'border-border-soft hover:bg-bg-hover text-txt-sub',
                ].join(' ')}
                title={`${em} (키: ${idx + 1})`}
              >
                {em}
              </button>
            ))}
          </div>

          {/* 대화행위 선택 */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-txt-sub mr-1">대화행위</span>
            {DIALOG_ACT_OPTIONS.map((da) => (
              <button
                key={da}
                type="button"
                onClick={() =>
                  setSelectedDialogAct((prev) => (prev === da ? null : da))
                }
                className={[
                  'text-xs px-2 py-1 rounded border transition-colors',
                  selectedDialogAct === da
                    ? 'bg-accent text-white border-accent'
                    : 'border-border-soft hover:bg-bg-hover text-txt-sub',
                ].join(' ')}
              >
                {da}
              </button>
            ))}
          </div>

          {/* 저장 + 취소 */}
          <div className="flex items-center gap-2 ml-auto">
            {saveError && (
              <span className="text-xs text-red-600">{saveError}</span>
            )}
            <button
              type="button"
              onClick={() => setIsReviewing(false)}
              className="text-xs px-2 py-1 rounded border border-border-soft hover:bg-bg-hover text-txt-sub"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedEmotion || saving}
              className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-40 font-medium"
              title="저장 (Enter)"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── WaveformIcon — 재생 중 애니메이션 ────────────────────────────────────
function WaveformIcon() {
  return (
    <span className="flex items-end gap-px h-4 w-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ animationDelay: `${i * 0.15}s` }}
          className="w-1 rounded-sm bg-accent animate-bounce"
          // heights cycle: short, tall, medium
          aria-hidden
        />
      ))}
    </span>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────
const DIGIT_SUSPECT_RE = /(\d[\d\s.-]{6,}\d)/g

function renderTextWithPiiHint(text: string | null | undefined): React.ReactNode {
  if (!text) return '(공백)'
  if (!DIGIT_SUSPECT_RE.test(text)) return text
  DIGIT_SUSPECT_RE.lastIndex = 0
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = DIGIT_SUSPECT_RE.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    parts.push(
      <span
        key={`pii-${m.index}`}
        className="bg-red-100 text-red-700 px-1 rounded font-medium"
        title="숫자 7자리 이상 — PII 의심"
      >
        {m[0]}
      </span>,
    )
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
