import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  ConfirmDialog,
  DataTable,
  EmptyState,
  EmptyIcon,
  ErrorBanner,
  Input,
  Select,
  StatusBadge,
  useToast,
  type ColumnDef,
  type SelectOption,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import {
  fetchReviewQueue,
  updateReviewStatus,
  type ReviewQueueResponse,
} from '../../lib/api/reviews'
import {
  type AdminSession,
  type ReviewStatus,
  pipelineProgress,
  firstFailedStep,
  isPipelineComplete,
} from '../../types/adminSession'

const REVIEW_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: labels.review.pending },
  { value: 'in_review', label: labels.review.in_review },
  { value: 'approved', label: labels.review.approved },
  { value: 'rejected', label: labels.review.rejected },
  { value: 'needs_revision', label: labels.review.needs_revision },
]

const CONSENT_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'both_agreed', label: labels.consent.both_agreed },
  { value: 'user_only', label: labels.consent.user_only },
]

export default function AdminReviewQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()

  const reviewFilter = (searchParams.get('review') ?? 'pending') as ReviewStatus | 'all'
  const consentFilter = (searchParams.get('consent') ?? 'both_agreed') as
    | 'both_agreed'
    | 'user_only'
    | 'all'
  const qualityLow = searchParams.get('low') === '1'
  const search = searchParams.get('q') ?? ''

  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    sessionId: string
    status: ReviewStatus
    label: string
    body: string
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams)
      if (value == null || value === '' || value === 'all') next.delete(key)
      else next.set(key, value)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchReviewQueue({
      reviewStatus: reviewFilter,
      consentStatus: consentFilter,
      qualityLow,
      search: search || undefined,
    })
    if (res.error) {
      setError(res.error)
    } else {
      setData(res.data ?? null)
    }
    setLoading(false)
  }, [reviewFilter, consentFilter, qualityLow, search])

  useEffect(() => {
    load()
  }, [load])

  const totalDurationSec = useMemo(() => {
    return (data?.sessions ?? []).reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)
  }, [data])

  const handleAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    const res = await updateReviewStatus(confirmAction.sessionId, confirmAction.status)
    setActionLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(getToastForStatus(confirmAction.status))
    setConfirmAction(null)
    await load()
  }

  const columns: ColumnDef<AdminSession>[] = useMemo(
    () => [
      {
        key: 'title',
        header: '통화',
        render: (s) => (
          <div>
            <div className="font-medium text-txt">{s.title || '(제목 없음)'}</div>
            <div className="text-xs text-txt-tertiary">{s.id.slice(0, 8)}…</div>
          </div>
        ),
      },
      {
        key: 'duration',
        header: '길이',
        render: (s) => formatDuration(s.duration_seconds),
        width: '90px',
      },
      {
        key: 'consent',
        header: '동의',
        render: (s) => <StatusBadge kind="consent" value={s.consent_status} />,
        width: '120px',
      },
      {
        key: 'pipeline',
        header: '처리 흐름',
        render: (s) => <PipelineCells session={s} />,
      },
      {
        key: 'review',
        header: '검수',
        render: (s) => <StatusBadge kind="review" value={s.review_status ?? 'pending'} />,
        width: '110px',
      },
      {
        key: 'actions',
        header: '액션',
        align: 'right',
        render: (s) => <RowActions session={s} onAction={(status, label, body) =>
          setConfirmAction({ sessionId: s.id, status, label, body })
        } />,
        width: '280px',
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-txt">{labels.noun.review} 대기열</h1>
        <p className="mt-1 text-sm text-txt-sub">
          GPU 처리 흐름이 완료된 양측 동의 통화를 검수하고 납품 가능 상태로 전환합니다.
        </p>
      </header>

      {/* 카운트 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label={labels.review.pending} value={data?.pendingCount ?? 0} />
        <SummaryCard label={labels.review.in_review} value={data?.inReviewCount ?? 0} />
        <SummaryCard label={labels.review.approved} value={data?.approvedCount ?? 0} />
        <SummaryCard label={labels.review.rejected} value={data?.rejectedCount ?? 0} />
        <SummaryCard label={labels.review.needs_revision} value={data?.needsRevisionCount ?? 0} />
      </div>

      {/* 통화시간 합산 */}
      {data && (
        <Card padding="sm">
          <div className="text-sm text-txt-sub">
            현재 필터 결과: <span className="font-semibold text-txt">{data.total}</span>건 (총{' '}
            <span className="font-semibold text-txt">{formatDuration(totalDurationSec)}</span>)
          </div>
        </Card>
      )}

      {/* 필터 */}
      <Card>
        <CardHeader title="필터" description="검수 상태 · 동의 상태 · 저품질 우선" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select
              label="검수 상태"
              value={reviewFilter}
              options={REVIEW_FILTER_OPTIONS}
              onChange={(e) => updateParam('review', e.target.value)}
            />
            <Select
              label="동의 상태"
              value={consentFilter}
              options={CONSENT_FILTER_OPTIONS}
              onChange={(e) => updateParam('consent', e.target.value)}
            />
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-txt mb-1.5">우선 정렬</label>
              <label className="inline-flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={qualityLow}
                  onChange={(e) => updateParam('low', e.target.checked ? '1' : null)}
                  className="rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm text-txt">저품질 우선</span>
              </label>
            </div>
            <Input
              label="검색"
              placeholder="제목 / 세션 ID"
              value={search}
              onChange={(e) => updateParam('q', e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* 검수 대기열 */}
      <DataTable<AdminSession>
        data={data?.sessions ?? null}
        columns={columns}
        rowKey={(s) => s.id}
        loading={loading}
        error={null}
        emptyTitle={labels.empty.review}
        emptyHint={labels.empty.reviewHint}
      />

      {/* 빈 상태에서도 도움말 */}
      {!loading && !error && (data?.sessions.length ?? 0) === 0 && (
        <EmptyState
          icon={<EmptyIcon />}
          title={labels.empty.review}
          description={labels.empty.reviewHint}
        />
      )}

      {/* 확인 모달 */}
      {confirmAction && (
        <ConfirmDialog
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={handleAction}
          title={confirmAction.label}
          body={confirmAction.body}
          confirmLabel={confirmAction.label}
          variant={confirmAction.status === 'rejected' ? 'danger' : 'primary'}
          loading={actionLoading}
        />
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function getToastForStatus(status: ReviewStatus): string {
  switch (status) {
    case 'approved': return labels.toast.approved
    case 'rejected': return labels.toast.rejected
    case 'needs_revision': return labels.toast.needsRevision
    default: return labels.toast.saved
  }
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}

// ── Sub-components ──────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card padding="sm">
      <div className="text-xs text-txt-sub">{label}</div>
      <div className="mt-1 text-2xl font-bold text-txt">{value.toLocaleString('ko-KR')}</div>
    </Card>
  )
}

function PipelineCells({ session }: { session: AdminSession }) {
  const steps: Array<{ key: keyof typeof labels.pipeline; status?: string }> = [
    { key: 'upload', status: session.upload_status },
    { key: 'stt', status: session.stt_status },
    { key: 'diarize', status: session.diarize_status },
    { key: 'pii', status: session.pii_status },
    { key: 'quality', status: session.quality_status },
  ]
  const failed = firstFailedStep(session)
  const progressPct = Math.round(pipelineProgress(session) * 100)

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step) => (
        <div
          key={step.key}
          title={`${labels.pipeline[step.key]} — ${step.status ? (labels.status as Record<string, string>)[step.status] ?? step.status : labels.status.pending}`}
          className={`w-2.5 h-2.5 rounded-full ${dotClass(step.status)}`}
          aria-label={`${labels.pipeline[step.key]} ${step.status ?? 'pending'}`}
        />
      ))}
      <span className="ml-2 text-xs text-txt-sub tabular-nums">{progressPct}%</span>
      {failed && (
        <span className="ml-1 text-xs text-danger" title={`실패 단계: ${failed}`}>
          ⚠
        </span>
      )}
    </div>
  )
}

function dotClass(status: string | undefined): string {
  switch (status) {
    case 'done': return 'bg-success'
    case 'running': return 'bg-accent animate-pulse'
    case 'failed': return 'bg-danger'
    default: return 'bg-muted border border-border'
  }
}

function RowActions({
  session,
  onAction,
}: {
  session: AdminSession
  onAction: (status: ReviewStatus, label: string, body: string) => void
}) {
  const complete = isPipelineComplete(session)
  const review = session.review_status ?? 'pending'

  // 처리 흐름 미완 시 검수 액션 비활성
  if (!complete && review === 'pending') {
    return <span className="text-xs text-txt-tertiary">처리 흐름 진행 중</span>
  }

  // 이미 결정된 상태 — 단순 표시만
  if (review === 'approved' || review === 'rejected') {
    return <span className="text-xs text-txt-tertiary">완료된 결정</span>
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="primary"
        onClick={() =>
          onAction(
            'approved',
            labels.action.approve,
            '승인 후에는 납품 가능 상태로 전환됩니다.',
          )
        }
      >
        {labels.action.approve}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          onAction(
            'needs_revision',
            labels.action.needRevision,
            'PII 보정 또는 라벨 수정이 필요한 경우 사용합니다.',
          )
        }
      >
        {labels.action.needRevision}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() =>
          onAction('rejected', labels.action.reject, labels.confirm.rejectBody)
        }
      >
        {labels.action.reject}
      </Button>
    </div>
  )
}
