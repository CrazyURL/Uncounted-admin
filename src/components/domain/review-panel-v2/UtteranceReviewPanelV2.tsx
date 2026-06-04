// 발화 단건 검수 패널 (화면 ③, 정본 §4.3)
// 인라인 통합 + 체크박스 4종 + 화자 라디오 즉시 노출 + PII 드래그 + 3버튼.

import { useState, useCallback } from 'react'
import type {
  UtteranceReviewItem,
  GtSpeaker,
  ExcludeReason,
  PiiInterval,
} from './types'
import { PiiRangePicker } from './PiiRangePicker'
import { useReviewKeyboard, type ReviewKeyAction } from './ReviewKeyboardHook'

interface UtteranceReviewPanelV2Props {
  utterance: UtteranceReviewItem
  isActive: boolean
  onSubmit: (decision: ReviewDecision) => void
  onNextRed: () => void
  onPlay: () => void
  onSeek: (deltaSec: number) => void
}

export type ReviewDecision =
  | { type: 'normal' } // 자동전사 그대로 OK
  | {
      type: 'modify'
      gt_transcript: string
      gt_speaker: GtSpeaker | null
      gt_pii_intervals: PiiInterval[]
      reviewer_comment: string | null
      revisions: { type: 'text_correction' | 'speaker_relabel' | 'pii_addition'; payload: Record<string, unknown> }[]
    }
  | {
      type: 'exclude'
      reason: ExcludeReason
      reason_note: string | null
      is_deferred_split: boolean
    }

const EXCLUDE_REASONS: { value: ExcludeReason; label: string; isDeferredSplit?: boolean }[] = [
  { value: '잡음', label: '잡음 심함' },
  { value: '화자혼재', label: '화자혼재 (mixed segment)', isDeferredSplit: true },
  { value: '동의불완전', label: '동의 불완전' },
  { value: 'PII우려', label: 'PII 보호 우선' },
  { value: '기타', label: '기타' },
]

export function UtteranceReviewPanelV2({
  utterance,
  isActive,
  onSubmit,
  onNextRed,
  onPlay,
  onSeek,
}: UtteranceReviewPanelV2Props) {
  // 체크박스 상태
  const [checkedText, setCheckedText] = useState(false)
  const [checkedSpeaker, setCheckedSpeaker] = useState(false)
  const [checkedPii, setCheckedPii] = useState(false)
  const [checkedExclude, setCheckedExclude] = useState(false)

  // 정정 입력
  const [gtTranscript, setGtTranscript] = useState(utterance.auto_transcript)
  const [gtSpeaker, setGtSpeaker] = useState<GtSpeaker>(
    utterance.is_user ? '본인' : utterance.is_user === false ? '상대' : 'unknown',
  )
  const [piiIntervals, setPiiIntervals] = useState<PiiInterval[]>([])
  const [comment, setComment] = useState('')

  // 제외 입력
  const [excludeReason, setExcludeReason] = useState<ExcludeReason>('잡음')
  const [excludeReasonNote, setExcludeReasonNote] = useState('')

  // 키보드 액션
  const handleKeyAction = useCallback(
    (action: ReviewKeyAction) => {
      switch (action.type) {
        case 'toggle_text':
          setCheckedText((v) => !v)
          break
        case 'toggle_speaker':
          setCheckedSpeaker((v) => !v)
          break
        case 'toggle_pii':
          setCheckedPii((v) => !v)
          break
        case 'toggle_exclude':
          setCheckedExclude((v) => !v)
          break
        case 'play_pause':
          onPlay()
          break
        case 'seek':
          onSeek(action.deltaSec)
          break
        case 'next_red':
          onNextRed()
          break
      }
    },
    [onPlay, onSeek, onNextRed],
  )
  useReviewKeyboard({ enabled: isActive, onAction: handleKeyAction })

  const hasAnyEdit = checkedText || checkedSpeaker || checkedPii

  const handleNormal = () => {
    onSubmit({ type: 'normal' })
  }

  const handleModify = () => {
    const revisions: { type: 'text_correction' | 'speaker_relabel' | 'pii_addition'; payload: Record<string, unknown> }[] = []
    if (checkedText && gtTranscript !== utterance.auto_transcript) {
      revisions.push({
        type: 'text_correction',
        payload: { before_text: utterance.auto_transcript, after_text: gtTranscript },
      })
    }
    if (checkedSpeaker) {
      revisions.push({
        type: 'speaker_relabel',
        payload: {
          before_speaker: utterance.is_user ? '본인' : utterance.is_user === false ? '상대' : 'unknown',
          after_speaker: gtSpeaker,
        },
      })
    }
    if (checkedPii && piiIntervals.length > 0) {
      for (const itv of piiIntervals) {
        revisions.push({
          type: 'pii_addition',
          payload: { ...itv },
        })
      }
    }
    onSubmit({
      type: 'modify',
      gt_transcript: gtTranscript,
      gt_speaker: gtSpeaker,
      gt_pii_intervals: piiIntervals,
      reviewer_comment: comment || null,
      revisions,
    })
  }

  const handleExclude = () => {
    const reasonDef = EXCLUDE_REASONS.find((r) => r.value === excludeReason)
    onSubmit({
      type: 'exclude',
      reason: excludeReason,
      reason_note: excludeReasonNote || null,
      is_deferred_split: reasonDef?.isDeferredSplit ?? false,
    })
  }

  return (
    <div className="border border-border-light rounded-lg p-4 space-y-3 bg-surface">
      {/* 헤더 */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">#{utterance.sequence_order}</span>
          <span className="text-txt-sub">
            {formatTime(utterance.start_sec)}-{formatTime(utterance.end_sec)} ({utterance.duration_sec.toFixed(1)}초)
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${tierColor(utterance.review_priority_tier)}`}>
            점수 {utterance.review_priority_score} ({tierLabel(utterance.review_priority_tier)})
          </span>
        </div>
        <button onClick={onPlay} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
          🔊 재생
        </button>
      </div>

      {/* 자동전사 */}
      <div>
        <div className="text-xs text-txt-sub mb-1">자동전사:</div>
        <div className="font-mono text-sm p-2 bg-surface-alt border border-border-light rounded">
          {utterance.auto_transcript}
        </div>
      </div>

      {/* 체크박스 4종 (문제 신고형) */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-txt-sub">이 발화 문제 있음?</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={checkedText} onChange={(e) => setCheckedText(e.target.checked)} />
          텍스트 <span className="text-xs text-txt-sub">(1)</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={checkedSpeaker} onChange={(e) => setCheckedSpeaker(e.target.checked)} />
          화자 <span className="text-xs text-txt-sub">(2)</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={checkedPii} onChange={(e) => setCheckedPii(e.target.checked)} />
          PII <span className="text-xs text-txt-sub">(3)</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={checkedExclude} onChange={(e) => setCheckedExclude(e.target.checked)} />
          제외 <span className="text-xs text-txt-sub">(4)</span>
        </label>
      </div>

      {/* 체크박스 펼침 */}
      {checkedText && (
        <div className="space-y-1">
          <div className="text-xs text-txt-sub">텍스트 정정 (검수자가 들은 그대로):</div>
          <textarea
            value={gtTranscript}
            onChange={(e) => setGtTranscript(e.target.value)}
            rows={3}
            className="w-full font-mono text-sm p-2 border border-border-light rounded"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs px-2 py-0.5 bg-gray-100 rounded"
              onClick={() => setGtTranscript(utterance.auto_transcript)}
            >
              📋 자동전사 복사
            </button>
            <button type="button" className="text-xs px-2 py-0.5 bg-gray-100 rounded" onClick={() => setGtTranscript('')}>
              ✕ 비우기
            </button>
          </div>
        </div>
      )}

      {checkedSpeaker && (
        <div className="space-y-1 text-sm">
          <div className="text-xs text-txt-sub">
            자동: {utterance.is_user ? '본인' : utterance.is_user === false ? '상대' : 'unknown'} → 검수:
          </div>
          <div className="flex gap-3">
            {(['본인', '상대', 'unknown'] as const).map((s) => (
              <label key={s} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="gt_speaker"
                  value={s}
                  checked={gtSpeaker === s}
                  onChange={() => setGtSpeaker(s)}
                />
                {s === 'unknown' ? '모름' : s}
              </label>
            ))}
          </div>
        </div>
      )}

      {checkedPii && (
        <PiiRangePicker
          gtText={checkedText ? gtTranscript : utterance.auto_transcript}
          existingIntervals={piiIntervals}
          onAdd={(itv) => setPiiIntervals((prev) => [...prev, { ...itv, source: 'human' as const }])}
          onRemove={(start, end) => setPiiIntervals((prev) => prev.filter((p) => !(p.start_char === start && p.end_char === end)))}
        />
      )}

      {checkedExclude && (
        <div className="space-y-1 text-sm">
          <div className="text-xs text-txt-sub">제외 사유:</div>
          {EXCLUDE_REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="exclude_reason"
                value={r.value}
                checked={excludeReason === r.value}
                onChange={() => setExcludeReason(r.value)}
              />
              {r.label}
              {r.isDeferredSplit && <span className="text-xs text-blue-600">(deferred_split — P3 복구)</span>}
            </label>
          ))}
          <input
            type="text"
            placeholder="추가 메모 (선택)"
            value={excludeReasonNote}
            onChange={(e) => setExcludeReasonNote(e.target.value)}
            className="w-full text-sm p-1 border border-border-light rounded mt-1"
          />
        </div>
      )}

      {/* 메모 (정정 시) */}
      {hasAnyEdit && (
        <div>
          <div className="text-xs text-txt-sub mb-1">검수 메모 (선택):</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full text-sm p-2 border border-border-light rounded"
            placeholder='예: "좌사" → "조사" 오인식. PII 없음.'
          />
        </div>
      )}

      {/* 3버튼 + 다음 빨강 */}
      <div className="flex gap-2 pt-2 border-t border-border-light">
        <button
          type="button"
          className="flex-1 px-3 py-2 bg-emerald-500 text-white rounded font-medium text-sm"
          onClick={handleNormal}
          disabled={hasAnyEdit || checkedExclude}
          title={hasAnyEdit || checkedExclude ? '체크박스가 켜져 있을 때는 [수정] 또는 [제외] 사용' : ''}
        >
          ✓ 정상
        </button>
        <button
          type="button"
          className="flex-1 px-3 py-2 bg-amber-500 text-white rounded font-medium text-sm"
          onClick={handleModify}
          disabled={!hasAnyEdit || checkedExclude}
        >
          ⚒ 수정
        </button>
        <button
          type="button"
          className="flex-1 px-3 py-2 bg-red-500 text-white rounded font-medium text-sm"
          onClick={handleExclude}
          disabled={!checkedExclude}
        >
          ✗ 제외
        </button>
        <button
          type="button"
          className="px-3 py-2 bg-gray-100 rounded text-sm"
          onClick={onNextRed}
          title="Tab"
        >
          ⏭ 다음 빨강
        </button>
      </div>
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function tierColor(tier: 'red' | 'yellow' | 'green'): string {
  switch (tier) {
    case 'red':
      return 'bg-red-100 text-red-700'
    case 'yellow':
      return 'bg-yellow-100 text-yellow-700'
    case 'green':
      return 'bg-green-100 text-green-700'
  }
}

function tierLabel(tier: 'red' | 'yellow' | 'green'): string {
  switch (tier) {
    case 'red':
      return '필수'
    case 'yellow':
      return '권장'
    case 'green':
      return '자동승인 가능'
  }
}
