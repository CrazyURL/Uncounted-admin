// 사람 감정 라벨 검수 큐 (PR-H2b-queue).
// /admin/calls(통화 인벤토리)와 분리된 전용 진입점.
// 기본 조회는 human_pending(맥락 보류 + 판단불가)만 — low_confidence 25k 목록은 노출하지 않고 카운트만 표시한다.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchEmotionQueue,
  fetchEmotionLabelStats,
  type EmotionQueueItem,
} from '../../lib/api/emotionLabels'
import { EmotionLabelQueueRow } from '../../components/domain/EmotionLabelQueueRow'

const PAGE_SIZE = 50

export default function AdminEmotionLabelQueuePage() {
  const [items, setItems] = useState<EmotionQueueItem[]>([])
  const [pendingTotal, setPendingTotal] = useState<number | null>(null)
  const [lowConfCount, setLowConfCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedCount, setResolvedCount] = useState(0)

  // 서버에서 가져온 누적 건수(페이지네이션 offset). 로컬 제거와 무관하게 증가시킨다.
  const fetchedRef = useRef(0)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    fetchedRef.current = 0
    setResolvedCount(0)
    const [queueRes, statsRes] = await Promise.all([
      fetchEmotionQueue({ source: 'human_pending', limit: PAGE_SIZE, offset: 0 }),
      fetchEmotionLabelStats(),
    ])
    if (queueRes.error) {
      setError(queueRes.error)
      setItems([])
    } else {
      const data = queueRes.data ?? []
      setItems(data)
      fetchedRef.current = data.length
      setPendingTotal(queueRes.meta?.total ?? data.length)
    }
    if (statsRes.data) setLowConfCount(statsRes.data.lowConfidenceQueueCount ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    const res = await fetchEmotionQueue({
      source: 'human_pending',
      limit: PAGE_SIZE,
      offset: fetchedRef.current,
    })
    if (res.error) {
      setError(res.error)
    } else {
      const data = res.data ?? []
      // 중복 방지(로컬 제거로 offset 이 드리프트할 수 있음): 이미 가진 utterance_id 는 제외.
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.utterance_id))
        return [...prev, ...data.filter((i) => !seen.has(i.utterance_id))]
      })
      fetchedRef.current += data.length
      if (res.meta?.total != null) setPendingTotal(res.meta.total)
    }
    setLoadingMore(false)
  }, [])

  const handleResolved = useCallback((utteranceId: string) => {
    setItems((prev) => prev.filter((i) => i.utterance_id !== utteranceId))
    setResolvedCount((n) => n + 1)
  }, [])

  const remainingPending =
    pendingTotal != null ? Math.max(pendingTotal - resolvedCount, 0) : null
  const hasMore = fetchedRef.current < (pendingTotal ?? 0)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          사람 감정 라벨 검수
        </h1>
        <button
          onClick={loadInitial}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-sub)' }}
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          새로고침
        </button>
      </div>

      {/* 카운트 요약 — low_confidence 후보는 숫자만(목록 미노출) */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
          검수 대기{' '}
          <strong className="tabular-nums">
            {remainingPending != null ? remainingPending.toLocaleString('ko-KR') : '—'}
          </strong>
          건
        </span>
        <span className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 border border-gray-200">
          low-confidence 후보{' '}
          <strong className="tabular-nums">
            {lowConfCount != null ? lowConfCount.toLocaleString('ko-KR') : '—'}
          </strong>
          건 <span className="text-[11px]">(별도 · 미노출)</span>
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-txt-sub">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-txt-sub">
          검수 대기 중인 사람 감정 라벨이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <EmotionLabelQueueRow
              key={item.utterance_id}
              item={item}
              onResolved={handleResolved}
            />
          ))}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs px-4 py-1.5 rounded border border-border-soft hover:bg-bg-hover text-txt-sub disabled:opacity-50"
              >
                {loadingMore ? '불러오는 중...' : '더 불러오기'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
