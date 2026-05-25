// 사람 감정 라벨 검수 큐 한 건 (PR-H2b-queue).
// 경량 카드 — UtteranceReviewRow(full AdminUtterance 의존)를 재사용하지 않는다.
// 저장 본문/기본값은 humanLabelPayload 로 UtteranceReviewRow 와 공유한다.

import { useState } from 'react'
import type { EmotionQueueItem } from '../../lib/api/emotionLabels'
import { saveUtteranceHumanLabel } from '../../lib/api/utterances'
import type { EmotionFineLabel } from '../../lib/api/utterances'
import {
  buildHumanLabelBody,
  defaultFineFor,
  EMOTION_FINE_OPTIONS,
  HUMAN_CATEGORY_OPTIONS,
  type HumanCategoryChoice,
} from '../../lib/labels/humanLabelPayload'

export interface EmotionLabelQueueRowProps {
  item: EmotionQueueItem
  /** 저장(resolved/undecidable) 성공 시 호출 — 부모가 목록에서 제거하고 다음 항목으로 이동 */
  onResolved: (utteranceId: string) => void
}

// 기존 pending 행의 카테고리 값으로 버튼 초기값을 잡는다(긍정/중립/부정만, 그 외 null → 미선택).
function initialCategory(item: EmotionQueueItem): HumanCategoryChoice | null {
  if (item.category_decision === 'undecidable') return '판단불가'
  const c = item.human_emotion_category
  if (c === '긍정' || c === '중립' || c === '부정') return c
  return null
}

const QUEUE_REASON_LABEL: Record<string, string> = {
  pending_context: '맥락 보류',
  undecidable: '판단불가',
}

export function EmotionLabelQueueRow({ item, onResolved }: EmotionLabelQueueRowProps) {
  const [category, setCategory] = useState<HumanCategoryChoice | null>(() => initialCategory(item))
  const [fine, setFine] = useState<EmotionFineLabel | null>(() => {
    const c = initialCategory(item)
    if (!c || c === '판단불가') return null
    return (item.human_fine_label as EmotionFineLabel | null) ?? defaultFineFor(c)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function selectCategory(cat: HumanCategoryChoice) {
    setCategory(cat)
    setError(null)
    setFine(defaultFineFor(cat))
  }

  async function handleSave() {
    if (!category || saving) return
    setSaving(true)
    setError(null)
    const built = buildHumanLabelBody(category, fine)
    const res = await saveUtteranceHumanLabel(item.utterance_id, built.body)
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onResolved(item.utterance_id)
  }

  return (
    <div className="rounded-lg border border-border-soft bg-surface p-3 text-sm">
      {/* 발화 텍스트 (마스킹·200자 슬라이스) */}
      <p className="text-txt break-words">{item.text || '(공백)'}</p>

      {/* 자동/기존 라벨 컨텍스트 */}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-txt-sub">
        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
          사유: {QUEUE_REASON_LABEL[item.queue_reason] ?? item.queue_reason}
        </span>
        {item.human_emotion_category && (
          <span>기존 카테고리: {item.human_emotion_category}</span>
        )}
        {item.human_fine_label && <span>기존 세부: {item.human_fine_label}</span>}
      </div>

      {/* 카테고리 버튼 (긍정/중립/부정/판단불가) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-indigo-700">사람 감정 라벨</span>
        <span className="text-[10px] text-txt-sub mr-1">학습용 · 모델값 미변경</span>
        {HUMAN_CATEGORY_OPTIONS.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => selectCategory(cat)}
            className={[
              'text-xs px-2 py-1 rounded border transition-colors',
              category === cat
                ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                : 'border-border-soft hover:bg-bg-hover text-txt-sub',
            ].join(' ')}
          >
            {cat}
          </button>
        ))}

        {/* 세부 감정(7종) — resolved 일 때만. 부정은 슬픔/분노/불안이 섞여 기본값 맹신 위험 → 드롭다운 강조(시각 nudge). */}
        {category && category !== '판단불가' && (
          <label className="flex items-center gap-1 text-xs text-txt-sub">
            세부
            <select
              value={fine ?? ''}
              onChange={(e) => setFine(e.target.value as EmotionFineLabel)}
              className={[
                'text-xs px-1.5 py-1 rounded border bg-surface text-txt',
                category === '부정'
                  ? 'border-orange-400 ring-2 ring-orange-300 font-semibold'
                  : 'border-border-soft',
              ].join(' ')}
            >
              {EMOTION_FINE_OPTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </label>
        )}

        {category === '부정' && (
          <span className="text-[11px] text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
            부정 라벨은 세부 감정(슬픔/분노/불안)을 확인해 주세요.
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!category || saving}
            className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 font-medium"
          >
            {saving ? '저장 중...' : '저장 후 다음'}
          </button>
        </div>
      </div>
    </div>
  )
}
