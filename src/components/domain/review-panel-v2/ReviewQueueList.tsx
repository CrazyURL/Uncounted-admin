// 검수 큐 리스트 (화면 ①, 정본 §4.1)
// 점수 기반 정렬 + 빨강/노랑/초록 필터.

import { useMemo, useState } from 'react'
import type { ReviewQueueItem, ReviewPriorityTier } from './types'

interface ReviewQueueListProps {
  items: ReviewQueueItem[]
  totalUtteranceCount: number
  redUtteranceCount: number
  onOpenSession: (sessionId: string) => void
  onBulkAutoApprove: (sessionIds: string[]) => void
}

type FilterTier = 'red' | 'yellow' | 'green' | 'all'

export function ReviewQueueList({
  items,
  totalUtteranceCount,
  redUtteranceCount,
  onOpenSession,
  onBulkAutoApprove,
}: ReviewQueueListProps) {
  const [filter, setFilter] = useState<FilterTier>('red')

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((i) => i.call_review_tier === filter)
  }, [items, filter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => b.call_review_score - a.call_review_score)
  }, [filtered])

  const greenSessionIds = useMemo(
    () => items.filter((i) => i.call_review_tier === 'green').map((i) => i.session_id),
    [items],
  )

  const reviewPercent = totalUtteranceCount > 0 ? ((redUtteranceCount / totalUtteranceCount) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">통화 검수 큐</h2>
        <div className="text-sm text-txt-sub">
          📊 {totalUtteranceCount.toLocaleString()} 발화 중 검수 필요 ={' '}
          <span className="font-medium text-red-600">{redUtteranceCount.toLocaleString()}</span> ({reviewPercent}%)
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-txt-sub">필터:</span>
        {(['red', 'yellow', 'green', 'all'] as const).map((t) => (
          <label key={t} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="filter" value={t} checked={filter === t} onChange={() => setFilter(t)} />
            {filterLabel(t)}
          </label>
        ))}
        {filter === 'green' && greenSessionIds.length > 0 && (
          <button
            type="button"
            className="ml-auto px-3 py-1 bg-emerald-500 text-white rounded text-sm"
            onClick={() => onBulkAutoApprove(greenSessionIds)}
          >
            ✓ {greenSessionIds.length}건 일괄 자동승인
          </button>
        )}
      </div>

      {/* 큐 리스트 */}
      <div className="space-y-2">
        {sorted.length === 0 && (
          <div className="text-center text-sm text-txt-sub py-8">해당 필터에 통화 없음.</div>
        )}
        {sorted.map((item) => (
          <QueueRow key={item.session_id} item={item} onOpen={() => onOpenSession(item.session_id)} />
        ))}
      </div>
    </div>
  )
}

function QueueRow({ item, onOpen }: { item: ReviewQueueItem; onOpen: () => void }) {
  const tierIcon = item.call_review_tier === 'red' ? '🔴' : item.call_review_tier === 'yellow' ? '🟡' : '🟢'
  const durStr = formatDuration(item.duration_seconds)

  return (
    <div className="border border-border-light rounded p-3 bg-surface space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="font-medium text-sm">
            {tierIcon} {item.session_label} · {durStr} · 발화 {item.utterance_count}
            <span className="ml-2 text-txt-sub">
              검수점수 {item.call_review_score} ({tierLabel(item.call_review_tier)})
            </span>
          </div>
          {item.reasons.length > 0 && (
            <div className="text-xs text-txt-sub mt-1">이유: {item.reasons.join(', ')}</div>
          )}
          {item.relation_estimated && (
            <div className="text-xs text-txt-sub mt-0.5">
              관계 추정: {item.relation_estimated} (conf {item.relation_confidence?.toFixed(2)})
              <span className="ml-1 text-gray-400" title="관계 추정값은 수정 불가 (정본 §4.2)">
                🔒
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm self-start"
        >
          ▼ 검수 시작
        </button>
      </div>
    </div>
  )
}

function filterLabel(t: FilterTier): string {
  switch (t) {
    case 'red':
      return '🔴 빨강 (필수)'
    case 'yellow':
      return '🟡 노랑 (권장)'
    case 'green':
      return '🟢 초록 (자동승인)'
    case 'all':
      return '전체'
  }
}

function tierLabel(t: ReviewPriorityTier): string {
  switch (t) {
    case 'red':
      return '필수'
    case 'yellow':
      return '권장'
    case 'green':
      return '자동승인 가능'
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
