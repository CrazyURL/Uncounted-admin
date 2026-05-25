// 발화 단위 검수 + 자동라벨 확인 행 (STAGE 14)
// 오디오 재생 → 감정/대화행위 선택 → 저장 → 다음 needs_review 자동 이동

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminUtterance,
  EmotionCategory,
  HumanLabelDecision,
  LabelSource,
} from '../../lib/api/utterances'
import {
  fetchUtteranceAudio,
  patchUtterance,
  saveUtteranceHumanLabel,
} from '../../lib/api/utterances'
import { UtteranceQualityReviewControls } from './UtteranceQualityReviewControls'
import { ManualPiiSpanRegister } from './ManualPiiSpanRegister'

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

// ── 사람 감정 라벨 (학습용, PR-H2a) ────────────────────────────────────────
// 위 EMOTION_OPTIONS(7종 모델 라벨, utterances.emotion in-place PATCH)와는 별개다.
// 사람 라벨은 utterances.emotion 을 건드리지 않고 utterance_human_labels 테이블에 누적된다.
// 1차로 3종 카테고리(긍정/중립/부정) 또는 판단불가를 고르고, 7종 fine_label 은 드롭다운으로 보정한다.
const HUMAN_CATEGORY_OPTIONS = ['긍정', '중립', '부정', '판단불가'] as const
type HumanCategory = (typeof HUMAN_CATEGORY_OPTIONS)[number]

// 카테고리 선택 시 자동 적용되는 기본 fine_label (설계 §3.2 안전맵 기준).
// resolved 는 서버에서 fine_label·emotion_category 둘 다 필수(미전송 시 400)이므로 기본값이 필요하다.
// ⚠️ 이 기본값은 학습 품질에 직접 영향을 준다 — 부정은 슬픔/분노/불안이 섞여 있으므로
//    검수자가 가능하면 아래 fine_label 드롭다운으로 정확한 7종을 보정해야 한다(기본값 맹신 금지).
const DEFAULT_FINE_BY_CATEGORY: Record<EmotionCategory, Emotion> = {
  긍정: '기쁨',
  중립: '중립',
  부정: '불안',
}

interface SavedHumanLabel {
  decision: HumanLabelDecision
  category: EmotionCategory | null
  fineLabel: Emotion | null
}

// 서버 human_label(PR-H2b-api)을 배지 표시용 SavedHumanLabel 로 변환.
// 새로고침 후 server-init 으로 사람 라벨 배지를 재구성하는 데 쓴다.
// pending_context 인데 카테고리·세부가 모두 비면 표시할 게 없으므로 null(배지 미렌더).
function humanLabelToSaved(hl: AdminUtterance['human_label']): SavedHumanLabel | null {
  if (!hl) return null
  if (hl.category_decision === 'undecidable') {
    return { decision: 'undecidable', category: null, fineLabel: null }
  }
  if (hl.category_decision === 'pending_context' && !hl.emotion_category && !hl.fine_label) {
    return null
  }
  return {
    decision: hl.category_decision,
    category: hl.emotion_category,
    fineLabel: (hl.fine_label as Emotion | null) ?? null,
  }
}

// 서버 human_label → 작업용 카테고리 버튼 초기값(긍정/중립/부정/판단불가).
function humanLabelToCategory(hl: AdminUtterance['human_label']): HumanCategory | null {
  if (!hl) return null
  if (hl.category_decision === 'undecidable') return '판단불가'
  return hl.emotion_category ?? null
}

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

// confidence(0~1)를 정수 퍼센트로. 범위 밖/비숫자면 null → 미표시.
function formatConfidence(v: number | null | undefined): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null
  return `${Math.round(v * 100)}%`
}

const UTTERANCE_TYPE_MAP: Record<string, string> = {
  statement: '진술',
  question: '질문',
  exclamation: '감탄',
  request: '요청',
}

// utterance_form(jsonb) 요약 라벨. object 가 아니면 null → chip 미렌더.
function utteranceFormLabel(form: AdminUtterance['utterance_form']): string | null {
  if (typeof form !== 'object' || form === null || Array.isArray(form)) return null
  if (form.is_greeting && !form.is_closing) return '인사'
  if (form.is_closing && !form.is_greeting) return '종료'
  if (form.is_backchannel) return '백채널'
  if (form.is_short_response) return '단응답'
  const t = form.utterance_type
  if (typeof t === 'string' && t) return UTTERANCE_TYPE_MAP[t] ?? t
  return null
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
  /** 품질 검수 판정 변경 시 호출 — 부모가 리포트 재집계 트리거 */
  onQualityReviewUpdated?: (id: string) => void
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
  onQualityReviewUpdated,
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
  const [expandedLabels, setExpandedLabels] = useState(false)
  const [manualPiiOpen, setManualPiiOpen] = useState(false)

  // 사람 감정 라벨 (학습용) — 모델 emotion 과 분리된 별도 저장 상태.
  // PR-H2b: 서버 human_label 로 초기화 → 새로고침 후에도 배지/선택이 유지된다.
  const [humanCategory, setHumanCategory] = useState<HumanCategory | null>(
    () => humanLabelToCategory(utterance.human_label),
  )
  const [humanFine, setHumanFine] = useState<Emotion | null>(() => {
    const s = humanLabelToSaved(utterance.human_label)
    return s && s.decision !== 'undecidable' ? s.fineLabel : null
  })
  const [humanSaving, setHumanSaving] = useState(false)
  const [humanSaveError, setHumanSaveError] = useState<string | null>(null)
  const [savedHuman, setSavedHuman] = useState<SavedHumanLabel | null>(
    () => humanLabelToSaved(utterance.human_label),
  )

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // 상위에서 utterance 가 바뀌면 선택값 동기화
  useEffect(() => {
    setSelectedEmotion((utterance.emotion as Emotion | null) ?? null)
    setSelectedDialogAct((utterance.dialog_act as DialogAct | null) ?? null)
  }, [utterance.emotion, utterance.dialog_act])

  // 사람 라벨 server-init 재동기화 (PR-H2b).
  // key = 결정|updated_at — 실제 서버 refetch 로 값이 바뀔 때만 갱신한다.
  // 로컬 저장(handleSaveHuman)은 서버 refetch 가 아니므로 이 key 가 안 바뀌어 배지가 보존된다.
  // 모델 emotion PATCH 의 낙관 업데이트({...u,...fields})도 human_label 참조를 보존하므로 무영향.
  const serverHumanKey = utterance.human_label
    ? `${utterance.human_label.category_decision}|${utterance.human_label.updated_at ?? ''}`
    : 'none'
  useEffect(() => {
    setSavedHuman(humanLabelToSaved(utterance.human_label))
    setHumanCategory(humanLabelToCategory(utterance.human_label))
    const s = humanLabelToSaved(utterance.human_label)
    setHumanFine(s && s.decision !== 'undecidable' ? s.fineLabel : null)
    // utterance.human_label 은 serverHumanKey 에 반영됨 — id/key 변경 시에만 재동기화.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utterance.id, serverHumanKey])

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

  // 사람 감정 라벨 — 카테고리 선택. 긍정/중립/부정은 기본 fine_label 을 자동 적용(드롭다운으로 보정 가능).
  const handleSelectHumanCategory = useCallback((cat: HumanCategory) => {
    setHumanCategory(cat)
    setHumanSaveError(null)
    setSavedHuman(null) // 재선택 시 직전 저장 표시 초기화 (다시 저장하기 전까지 깨끗한 상태)
    setHumanFine(cat === '판단불가' ? null : DEFAULT_FINE_BY_CATEGORY[cat])
  }, [])

  // 사람 감정 라벨 저장 — utterances.emotion 미변경, utterance_human_labels 에 upsert.
  const handleSaveHuman = useCallback(async () => {
    if (!humanCategory || humanSaving) return
    setHumanSaving(true)
    setHumanSaveError(null)

    const isUndecidable = humanCategory === '판단불가'
    // resolved 는 fine_label·emotion_category 둘 다 필수. category_source 는 서버가 manual 로 강제하므로 미전송.
    const fineLabel = isUndecidable ? null : (humanFine ?? DEFAULT_FINE_BY_CATEGORY[humanCategory])
    const res = await saveUtteranceHumanLabel(
      utterance.id,
      isUndecidable
        ? { category_decision: 'undecidable' }
        : { category_decision: 'resolved', emotion_category: humanCategory, fine_label: fineLabel ?? undefined },
    )
    setHumanSaving(false)

    if (res.error) {
      setHumanSaveError(res.error)
      return
    }

    setSavedHuman({
      decision: isUndecidable ? 'undecidable' : 'resolved',
      category: isUndecidable ? null : humanCategory,
      fineLabel,
    })
  }, [humanCategory, humanFine, humanSaving, utterance.id])

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
        isDanger ? 'bg-pink-50' : savedFlash ? 'bg-green-50' : '',
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
        <span className="flex items-center gap-0.5 w-20 shrink-0">
          {utterance.speaker_role === 'self' ? (
            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-medium leading-none">나</span>
          ) : utterance.speaker_role === 'other' ? (
            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 font-medium leading-none">상대</span>
          ) : (
            <span className="text-xs text-txt-sub">{utterance.speaker_id ? `S${utterance.speaker_id.slice(-2)}` : '-'}</span>
          )}
          {utterance.speaker_gender === 'male' && (
            <span className="text-[10px] text-blue-500 leading-none">♂</span>
          )}
          {utterance.speaker_gender === 'female' && (
            <span className="text-[10px] text-pink-500 leading-none">♀</span>
          )}
          {utterance.speaker_voice_age_range && (
            <span className="text-[10px] text-txt-sub leading-none">{utterance.speaker_voice_age_range}</span>
          )}
        </span>

        {/* 발화 텍스트 */}
        <span className="flex-1 truncate text-txt" title={utterance.text || '(공백)'}>
          {renderTextWithPiiHint(utterance.text)}
        </span>

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

        {/* 수동 PII 등록 토글 — 탐지기가 놓친 PII 를 원문에서 직접 등록 */}
        <button
          type="button"
          onClick={() => setManualPiiOpen((p) => !p)}
          aria-pressed={manualPiiOpen}
          className={[
            'text-xs px-2 py-0.5 rounded border whitespace-nowrap',
            manualPiiOpen
              ? 'bg-amber-100 text-amber-800 border-amber-400'
              : 'border-border-soft hover:bg-bg-hover text-txt-sub',
          ].join(' ')}
          title="자동 탐지가 놓친 개인정보를 원문에서 직접 선택해 등록"
        >
          PII 수동등록
        </button>
      </div>

      {/* 수동 PII 등록 패널 */}
      {manualPiiOpen && (
        <ManualPiiSpanRegister
          utteranceId={utterance.id}
          onClose={() => setManualPiiOpen(false)}
        />
      )}

      {/* 라벨 카테고리 (발화 단위 자동라벨 — 표시 전용) */}
      {(utterance.emotion || utterance.dialog_act || utterance.segment_topic) && (
        <div className="mt-1.5 ml-10 flex flex-wrap items-center gap-1.5 text-xs">
          {/* 감정 */}
          {utterance.emotion && (
            <span
              className={[
                'px-1.5 py-0.5 rounded border font-medium whitespace-nowrap',
                emotionColor(utterance.emotion),
              ].join(' ')}
            >
              {utterance.emotion}
              {formatConfidence(utterance.emotion_confidence) && (
                <span className="ml-1 opacity-60">{formatConfidence(utterance.emotion_confidence)}</span>
              )}
            </span>
          )}

          {/* 대화행위 */}
          {utterance.dialog_act && (
            <span className="px-1.5 py-0.5 rounded border font-medium whitespace-nowrap text-blue-700 bg-blue-50 border-blue-300">
              {utterance.dialog_act}
              {formatConfidence(utterance.dialog_act_confidence) && (
                <span className="ml-1 opacity-60">{formatConfidence(utterance.dialog_act_confidence)}</span>
              )}
            </span>
          )}

          {/* 주제 */}
          {utterance.segment_topic && (
            <span className="px-1.5 py-0.5 rounded border font-medium whitespace-nowrap text-purple-700 bg-purple-50 border-purple-300">
              {utterance.segment_topic}
            </span>
          )}

          {/* 더보기 토글 */}
          {(utteranceFormLabel(utterance.utterance_form) ||
            utterance.honorific_level ||
            (utterance.confidence_tier && utterance.confidence_tier !== utterance.label_source)) && (
            <button
              type="button"
              onClick={() => setExpandedLabels((p) => !p)}
              className="text-xs px-1.5 py-0.5 rounded border border-border-soft hover:bg-bg-hover text-txt-sub"
              title="추가 라벨"
            >
              {expandedLabels ? '▲ 접기' : '▼ 더보기'}
            </button>
          )}

          {/* 확장 라벨 */}
          {expandedLabels && (
            <>
              {utteranceFormLabel(utterance.utterance_form) && (
                <span className="px-1.5 py-0.5 rounded border font-medium whitespace-nowrap text-orange-700 bg-orange-50 border-orange-300">
                  {utteranceFormLabel(utterance.utterance_form)}
                </span>
              )}
              {utterance.honorific_level && (
                <span className="px-1.5 py-0.5 rounded border font-medium whitespace-nowrap text-teal-700 bg-teal-50 border-teal-300">
                  {utterance.honorific_level}
                </span>
              )}
              {utterance.confidence_tier && utterance.confidence_tier !== utterance.label_source && (
                <span className="px-1.5 py-0.5 rounded border font-medium whitespace-nowrap text-gray-700 bg-gray-100 border-gray-300">
                  {utterance.confidence_tier}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* 사람 감정 라벨 배지 (이번 세션에서 저장한 값 — 모델 배지와 구분하여 "사람" 접두) */}
      {savedHuman && (
        <div className="mt-1 ml-10 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="px-1.5 py-0.5 rounded border font-medium whitespace-nowrap text-indigo-700 bg-indigo-50 border-indigo-300">
            사람{' '}
            {savedHuman.decision === 'undecidable'
              ? '판단불가'
              : `${savedHuman.fineLabel} · ${savedHuman.category}`}
          </span>
        </div>
      )}

      {/* 납품 품질 검수 컨트롤 (저품질 검수 큐 액션) */}
      <UtteranceQualityReviewControls
        utterance={utterance}
        onUpdated={(id) => onQualityReviewUpdated?.(id)}
      />

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
        <>
        <div className="mt-2 ml-10 flex flex-wrap items-center gap-3">
          {/* 감정 선택 (모델 라벨 — utterances.emotion in-place 저장) */}
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

        {/* 사람 감정 라벨 (학습용) — 모델값 미변경, utterance_human_labels 에 저장.
            onKeyDown stopPropagation: row 단축키(1~7=모델감정, Enter=모델저장)와 충돌 방지. */}
        <div
          onKeyDown={(e) => e.stopPropagation()}
          className="mt-2 ml-10 pt-2 border-t border-dashed border-border-soft flex flex-wrap items-center gap-2"
        >
          <span className="text-xs font-medium text-indigo-700">사람 감정 라벨</span>
          <span className="text-[10px] text-txt-sub mr-1">학습용 · 모델값 미변경</span>
          {HUMAN_CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelectHumanCategory(cat)}
              className={[
                'text-xs px-2 py-1 rounded border transition-colors',
                humanCategory === cat
                  ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                  : 'border-border-soft hover:bg-bg-hover text-txt-sub',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}

          {/* 세부 감정(7종) — resolved 일 때만. 검수자가 정확한 fine_label 로 보정한다.
              부정은 슬픔/분노/불안이 섞여 기본값(불안) 맹신이 위험 → 드롭다운 강조 + 확인 문구(PR-H2b).
              저장 API/DB 정책은 바꾸지 않는다(시각적 유도만). */}
          {humanCategory && humanCategory !== '판단불가' && (
            <label className="flex items-center gap-1 text-xs text-txt-sub">
              세부
              <select
                value={humanFine ?? ''}
                onChange={(e) => setHumanFine(e.target.value as Emotion)}
                className={[
                  'text-xs px-1.5 py-1 rounded border bg-surface text-txt',
                  humanCategory === '부정'
                    ? 'border-orange-400 ring-2 ring-orange-300 font-semibold'
                    : 'border-border-soft',
                ].join(' ')}
              >
                {EMOTION_OPTIONS.map((em) => (
                  <option key={em} value={em}>
                    {em}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* 부정 라벨 세부감정 확인 유도 — 시각적 nudge 만, 저장 정책 무변경. */}
          {humanCategory === '부정' && (
            <span className="text-[11px] text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
              부정 라벨은 세부 감정(슬픔/분노/불안)을 확인해 주세요.
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {humanSaveError && <span className="text-xs text-red-600">{humanSaveError}</span>}
            {savedHuman && !humanSaveError && !humanSaving && (
              <span className="text-xs text-indigo-600">사람 라벨 저장됨</span>
            )}
            <button
              type="button"
              onClick={handleSaveHuman}
              disabled={!humanCategory || humanSaving}
              className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 font-medium"
            >
              {humanSaving ? '저장 중...' : '사람 라벨 저장'}
            </button>
          </div>
        </div>
        </>
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
