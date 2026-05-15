import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BigStat, Button, ConfirmDialog, EmptyState, ErrorBanner, StatusBadge, useToast } from '../../components/ui'
import { FilterChips, type FilterChip } from '../../components/domain/FilterChips'
import { SessionPipelineCells } from '../../components/domain/SessionPipelineCells'
import { SessionDeliveryModal } from '../../components/domain/SessionDeliveryModal'
import { fetchDashboardStats, type DashboardStats } from '../../lib/api/dashboard'
import {
  fetchReviewQueue,
  updateReviewStatus,
  bulkAutoApprove,
  type ReviewQueueFilters,
} from '../../lib/api/reviews'
import {
  type AdminSession,
  firstFailedStep,
  isPipelineComplete,
} from '../../types/adminSession'
import { labels } from '../../lib/labels'

// ── 타입 & 상수 ─────────────────────────────────────────────────────────────

type FilterId = 'all' | 'pending' | 'approved' | 'needs_revision' | 'rejected' | 'failed'
type PipelineState = 'failed' | 'running' | 'complete'

const SESSIONS_PER_PAGE = 20

// ── 순수 헬퍼 함수 ───────────────────────────────────────────────────────────

function buildFilters(filterId: FilterId, page: number): ReviewQueueFilters {
  const base: ReviewQueueFilters = {
    consentStatus: 'both_agreed',
    page,
    limit: SESSIONS_PER_PAGE,
  }
  switch (filterId) {
    case 'pending':        return { ...base, reviewStatus: 'pending' }
    case 'approved':       return { ...base, reviewStatus: 'approved' }
    case 'needs_revision': return { ...base, reviewStatus: 'needs_revision' }
    case 'rejected':       return { ...base, reviewStatus: 'rejected' }
    case 'failed':         return { ...base, pipelineFailed: true }
    default:               return base
  }
}

function buildChips(stats: DashboardStats | null): FilterChip[] {
  const r = stats?.review
  const failedCount = stats?.alerts.pipelineFailedCount ?? 0
  const total =
    (r?.pending ?? 0) +
    (r?.in_review ?? 0) +
    (r?.approved ?? 0) +
    (r?.rejected ?? 0) +
    (r?.needs_revision ?? 0)
  return [
    { id: 'all',            label: '전체',    count: total },
    { id: 'pending',        label: '검수대기', count: (r?.pending ?? 0) + (r?.in_review ?? 0) },
    { id: 'approved',       label: '승인됨',   count: r?.approved ?? 0 },
    { id: 'needs_revision', label: '수정 필요', count: r?.needs_revision ?? 0 },
    { id: 'rejected',       label: '거절됨',   count: r?.rejected ?? 0 },
    { id: 'failed',         label: '처리 오류', count: failedCount, warn: failedCount > 0 },
  ]
}

function getPipelineState(session: AdminSession): PipelineState {
  if (firstFailedStep(session) !== null) return 'failed'
  if (isPipelineComplete(session)) return 'complete'
  return 'running'
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

// ── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()

  const filterId = (searchParams.get('filter') as FilterId) ?? 'all'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())
  const [deliveryTarget, setDeliveryTarget] = useState<{ id: string; title: string | null } | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const res = await fetchDashboardStats()
    if (res.data) setStats(res.data)
    setStatsLoading(false)
  }, [])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchReviewQueue(buildFilters(filterId, page))
    if (res.data) {
      setSessions(res.data.sessions)
      setTotal(res.data.total)
    } else {
      setError(res.error ?? labels.error.fetchFailed)
    }
    setLoading(false)
  }, [filterId, page])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    setSelectedIds(new Set())
    loadSessions()
  }, [loadSessions])

  function setFilter(id: string) {
    setSearchParams({ filter: id, page: '1' })
  }

  function setPage(n: number) {
    setSearchParams({ filter: filterId, page: String(n) })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === sessions.length && sessions.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)))
    }
  }

  function addActionLoading(id: string) {
    setActionLoading((prev) => new Set(prev).add(id))
  }

  function removeActionLoading(id: string) {
    setActionLoading((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function updateSessionStatus(sessionId: string, reviewStatus: AdminSession['review_status']) {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, review_status: reviewStatus } : s))
    )
  }

  async function handleApprove(sessionId: string) {
    addActionLoading(sessionId)
    const res = await updateReviewStatus(sessionId, 'approved')
    if (res.data) {
      updateSessionStatus(sessionId, 'approved')
      toast.success(labels.toast.approved)
      loadStats()
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    removeActionLoading(sessionId)
  }

  async function handleReject(sessionId: string) {
    setRejectTarget(null)
    addActionLoading(sessionId)
    const res = await updateReviewStatus(sessionId, 'rejected')
    if (res.data) {
      updateSessionStatus(sessionId, 'rejected')
      toast.success(labels.toast.rejected)
      loadStats()
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    removeActionLoading(sessionId)
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return
    setBulkApproving(true)
    const res = await bulkAutoApprove({ sessionIds: Array.from(selectedIds) })
    if (res.data) {
      toast.success(`${res.data.approved}건 승인 완료 (${res.data.skipped}건 건너뜀)`)
      setSelectedIds(new Set())
      loadSessions()
      loadStats()
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    setBulkApproving(false)
  }

  const chips = buildChips(stats)
  const totalPages = Math.ceil(total / SESSIONS_PER_PAGE)
  const r = stats?.review
  const failedCount = stats?.alerts.pipelineFailedCount ?? 0

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold text-txt">재고 · 통화</h1>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <BigStat
          title="양측 동의"
          value={statsLoading ? '…' : (stats?.consent.bothAgreedCount ?? 0).toLocaleString()}
          sub={stats ? formatDuration(stats.consent.totalDurationSec) : undefined}
        />
        <BigStat
          title="검수대기"
          value={statsLoading ? '…' : ((r?.pending ?? 0) + (r?.in_review ?? 0)).toLocaleString()}
          onClick={() => setFilter('pending')}
        />
        <BigStat
          title="승인됨"
          value={statsLoading ? '…' : (r?.approved ?? 0).toLocaleString()}
          onClick={() => setFilter('approved')}
        />
        <BigStat
          title="납품 완료"
          value={statsLoading ? '…' : (stats?.delivery.total ?? 0).toLocaleString()}
        />
        <BigStat
          title="처리 오류"
          value={statsLoading ? '…' : failedCount.toLocaleString()}
          tone={failedCount > 0 ? 'danger' : undefined}
          onClick={failedCount > 0 ? () => setFilter('failed') : undefined}
        />
      </div>

      {/* 필터 칩 */}
      <FilterChips chips={chips} active={filterId} onChange={setFilter} />

      {/* 일괄 처리 바 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-accent/10 border border-accent/30 rounded-lg">
          <span className="text-sm text-txt font-medium">{selectedIds.size}건 선택됨</span>
          <Button variant="primary" size="sm" onClick={handleBulkApprove} disabled={bulkApproving}>
            {bulkApproving ? '처리 중…' : '일괄 승인'}
          </Button>
          <button
            className="ml-auto text-sm text-txt-sub hover:text-txt focus:outline-none"
            onClick={() => setSelectedIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 세션 테이블 */}
      {error ? (
        <ErrorBanner message={error} onRetry={loadSessions} />
      ) : loading ? (
        <SessionTableSkeleton />
      ) : sessions.length === 0 ? (
        <EmptyState
          title={labels.empty.sessions}
          description={labels.empty.sessionsHint}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-txt-sub text-left">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sessions.length}
                    onChange={toggleSelectAll}
                    className="accent-accent"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="px-4 py-3 font-medium">통화명</th>
                <th className="px-4 py-3 font-medium w-24">길이</th>
                <th className="px-4 py-3 font-medium w-44">처리 흐름</th>
                <th className="px-4 py-3 font-medium w-28">상태</th>
                <th className="px-4 py-3 font-medium w-48 text-right">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  selected={selectedIds.has(session.id)}
                  actionLoading={actionLoading.has(session.id)}
                  onToggle={() => toggleSelect(session.id)}
                  onApprove={() => handleApprove(session.id)}
                  onReject={() => setRejectTarget(session.id)}
                  onDeliver={() =>
                    setDeliveryTarget({ id: session.id, title: session.title ?? null })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-txt-sub">
          <span>총 {total.toLocaleString()}건</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              이전
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              다음
            </Button>
          </div>
        </div>
      )}

      {/* 납품 모달 */}
      <SessionDeliveryModal
        sessionId={deliveryTarget?.id ?? ''}
        sessionTitle={deliveryTarget?.title ?? null}
        open={deliveryTarget !== null}
        onClose={() => setDeliveryTarget(null)}
        onSuccess={() => {
          setDeliveryTarget(null)
          loadStats()
          loadSessions()
        }}
      />

      {/* 거절 확인 다이얼로그 */}
      <ConfirmDialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) handleReject(rejectTarget)
        }}
        title={labels.confirm.rejectTitle}
        body={labels.confirm.rejectBody}
        confirmLabel="거절"
        variant="danger"
      />
    </div>
  )
}

// ── 로컬 서브 컴포넌트 ───────────────────────────────────────────────────────

function SessionTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-surface-alt rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

interface SessionRowProps {
  session: AdminSession
  selected: boolean
  actionLoading: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  onDeliver: () => void
}

function SessionRow({
  session,
  selected,
  actionLoading,
  onToggle,
  onApprove,
  onReject,
  onDeliver,
}: SessionRowProps) {
  return (
    <tr className={`hover:bg-surface-alt transition-colors ${selected ? 'bg-accent/5' : ''}`}>
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="accent-accent"
          aria-label={`선택: ${session.title ?? session.id}`}
        />
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-txt truncate max-w-[200px]">
          {session.title ?? `통화 ${session.id.slice(-6)}`}
        </div>
        <div className="text-xs text-txt-tertiary">
          {new Date(session.date).toLocaleDateString('ko-KR')}
        </div>
      </td>
      <td className="px-4 py-3 text-txt-sub tabular-nums">
        {formatDuration(session.duration_seconds)}
      </td>
      <td className="px-4 py-3">
        <SessionPipelineCells session={session} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge kind="review" value={session.review_status} />
      </td>
      <td className="px-4 py-3 text-right">
        <RowActions
          pipelineState={getPipelineState(session)}
          reviewStatus={session.review_status}
          loading={actionLoading}
          onApprove={onApprove}
          onReject={onReject}
          onDeliver={onDeliver}
        />
      </td>
    </tr>
  )
}

interface RowActionsProps {
  pipelineState: PipelineState
  reviewStatus: AdminSession['review_status']
  loading: boolean
  onApprove: () => void
  onReject: () => void
  onDeliver: () => void
}

function RowActions({
  pipelineState,
  reviewStatus,
  loading,
  onApprove,
  onReject,
  onDeliver,
}: RowActionsProps) {
  if (pipelineState === 'failed') {
    return <span className="text-xs text-danger">⚠ 처리 오류</span>
  }
  if (pipelineState === 'running') {
    return <span className="text-xs text-txt-sub">⏳ 처리 중</span>
  }
  if (reviewStatus === 'approved') {
    return (
      <Button variant="secondary" size="sm" onClick={onDeliver} disabled={loading}>
        납품 등록
      </Button>
    )
  }
  if (reviewStatus === 'rejected') {
    return <span className="text-xs text-txt-tertiary">거절됨</span>
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="primary" size="sm" onClick={onApprove} disabled={loading} loading={loading}>
        승인
      </Button>
      <Button variant="danger" size="sm" onClick={onReject} disabled={loading}>
        거절
      </Button>
    </div>
  )
}
