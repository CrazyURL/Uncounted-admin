import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
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
  Skeleton,
  Badge,
  Button,
  StatusBadge,
  useToast,
  type ColumnDef,
  type SelectOption,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import { fetchDashboardStats, type DashboardStats, type PipelineDistribution } from '../../lib/api/dashboard'
import { fetchGpuWorkerStatusApi, type WorkerStatus } from '../../lib/api/gpuWorker'
import {
  fetchReviewQueue,
  updateReviewStatus,
  bulkAutoApprove,
  type ReviewQueueResponse,
  type BulkAutoApproveResponse,
} from '../../lib/api/reviews'
import {
  type AdminSession,
  type ReviewStatus,
  pipelineProgress,
  firstFailedStep,
  isPipelineComplete,
} from '../../types/adminSession'

type TabId = 'consent' | 'pipeline' | 'review' | 'delivery' | 'alerts'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'consent', label: labels.consent.both_agreed },
  { id: 'pipeline', label: labels.noun.pipeline },
  { id: 'review', label: labels.noun.review },
  { id: 'delivery', label: labels.noun.delivery },
  { id: 'alerts', label: '이상 신호' },
]

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('consent')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchDashboardStats()
    if (res.error) setError(res.error)
    else setStats(res.data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-txt">{labels.noun.dashboard}</h1>
          <p className="mt-1 text-sm text-txt-sub">
            BM v10 — 양측 동의 → 처리 흐름 → 검수 → 납품 → 이상 신호 5단계 통합
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          {labels.action.refresh}
        </Button>
      </header>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* 탭 */}
      <div role="tablist" className="flex border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px focus:outline-none focus:ring-2 focus:ring-accent rounded-t ${
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-txt-sub hover:text-txt'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {loading && !stats ? (
        <DashboardSkeleton />
      ) : (
        <>
          {tab === 'consent' && stats && <ConsentTab stats={stats} onNavigate={navigate} />}
          {tab === 'pipeline' && stats && <PipelineTab stats={stats} onNavigate={navigate} />}
          {tab === 'review' && stats && <ReviewTab stats={stats} onNavigate={navigate} />}
          {tab === 'delivery' && stats && <DeliveryTab stats={stats} onNavigate={navigate} />}
          {tab === 'alerts' && stats && <AlertsTab stats={stats} onNavigate={navigate} />}
        </>
      )}
    </div>
  )
}

// ── Tab: Consent ────────────────────────────────────────────────────────
function ConsentTab({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BigStat
          title="양측 동의 통화"
          value={stats.consent.bothAgreedCount.toLocaleString('ko-KR')}
          sub={`최근 24시간 +${stats.consent.bothAgreed24h.toLocaleString('ko-KR')}건`}
        />
        <BigStat
          title="누적 통화시간"
          value={formatHours(stats.consent.totalDurationSec)}
          sub="양측 동의 합산"
        />
        <BigStat
          title="검수 대기"
          value={stats.review.pending.toLocaleString('ko-KR')}
          sub="처리 흐름 완료 후 검수 시작"
          onClick={() => onNavigate('/admin/utterances?session_review=pending')}
        />
      </div>
      <InlineCallList />
    </div>
  )
}

// ── Tab: Pipeline ───────────────────────────────────────────────────────
function PipelineTab({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  const stages = [
    { key: 'upload' as const, label: labels.pipeline.upload },
    { key: 'stt' as const, label: labels.pipeline.stt },
    { key: 'diarize' as const, label: labels.pipeline.diarize },
    { key: 'pii' as const, label: labels.pipeline.pii },
    { key: 'quality' as const, label: labels.pipeline.quality },
  ]

  // 파이프라인 전체에서 처리 중인 단계가 하나도 없는데 대기가 있으면 지연
  const anyRunning = stages.some((s) => stats.pipeline[s.key].running > 0)
  const anyPending = stages.some((s) => stats.pipeline[s.key].pending > 0)
  const stallDetected = anyPending && !anyRunning

  return (
    <div className="space-y-4">
      {stallDetected && (
        <div className="flex items-start gap-2 rounded-lg border border-danger bg-danger-dim px-4 py-3 text-sm text-danger">
          <span className="material-icons text-base leading-5">warning</span>
          <span>
            <strong>워커 지연 감지</strong> — 대기 중인 세션이 있지만 처리 중인 세션이 없습니다.
            GPU 워커가 중단되었거나 Voice API에 연결하지 못하고 있을 수 있습니다.
          </span>
        </div>
      )}
      <WorkerStatusCard />
      <div className="space-y-3">
        {stages.map((s) => (
          <PipelineRow key={s.key} label={s.label} dist={stats.pipeline[s.key]} onClick={() => onNavigate('/admin/sessions')} />
        ))}
      </div>
    </div>
  )
}

// ── GPU 워커 상태 카드 (BM v10 STAGE 4) ─────────────────────────────────
function WorkerStatusCard() {
  const [worker, setWorker] = useState<WorkerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetchGpuWorkerStatusApi()
    if (res.error) setError(res.error)
    else {
      setError(null)
      setWorker(res.data ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const id = setInterval(reload, 15_000)
    return () => clearInterval(id)
  }, [reload])

  if (loading && !worker) {
    return (
      <Card padding="sm">
        <Skeleton variant="text" width="40%" />
        <div className="mt-2"><Skeleton width="60%" height={20} /></div>
      </Card>
    )
  }
  if (error || !worker) {
    return (
      <Card padding="sm">
        <div className="text-sm text-danger">GPU 워커 상태 조회 실패: {error ?? '알 수 없음'}</div>
      </Card>
    )
  }

  const { queue, currentRunning, oldestPending, recentFailures, concurrency } = worker
  const totalQueue = queue.pending + queue.running + queue.failedRetryEligible
  const totalBothAgreed = queue.pending + queue.noAudio + queue.running + queue.failedRetryEligible + queue.failedExhausted + queue.done

  return (
    <Card padding="sm">
      <CardHeader
        title={`GPU 워커 (동시 ${concurrency}개)`}
        description={`Voice API · ${worker.voiceApiUrl.replace(/^https?:\/\//, '')} · 폴링 ${Math.round(worker.pollIntervalMs / 1000)}초 · 양측동의 합계 ${totalBothAgreed.toLocaleString('ko-KR')}건`}
      />
      <CardBody>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <WorkerStat label="처리 중" value={queue.running} tone="accent" />
          <WorkerStat label="대기" value={queue.pending} tone="neutral" />
          <WorkerStat label="재시도 대기" value={queue.failedRetryEligible} tone="warning" />
          <WorkerStat label="영구 실패" value={queue.failedExhausted} tone="danger" />
          <WorkerStat label="완료" value={queue.done} tone="success" />
          <WorkerStat label="오디오 없음" value={queue.noAudio} tone="muted" />
        </div>

        {totalQueue > 0 && (
          <div className="mt-3 text-xs text-txt-sub">
            큐 합계 <span className="font-mono tabular-nums">{totalQueue.toLocaleString('ko-KR')}</span>건
            {currentRunning && (
              <> · 현재 처리: <span className="font-mono">{currentRunning.id.slice(0, 16)}…</span></>
            )}
            {oldestPending && (
              <> · 최오래 대기: <span className="font-mono">{new Date(oldestPending.raw_audio_uploaded_at).toLocaleTimeString('ko-KR')}</span></>
            )}
          </div>
        )}

        {recentFailures.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-danger cursor-pointer">최근 실패 {recentFailures.length}건</summary>
            <ul className="mt-2 space-y-1 text-xs text-txt-sub">
              {recentFailures.slice(0, 5).map(f => (
                <li key={f.id} className="font-mono truncate">
                  {f.id.slice(0, 16)}… · 재시도{f.gpu_retry_count} · {f.gpu_last_error?.slice(0, 60) ?? '-'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  )
}

function WorkerStat({ label, value, tone }: { label: string; value: number; tone: 'accent' | 'neutral' | 'warning' | 'danger' | 'success' | 'muted' }) {
  const toneColor: Record<typeof tone, string> = {
    accent:  'text-accent',
    neutral: 'text-txt-sub',
    warning: 'text-warning',
    danger:  'text-danger',
    success: 'text-success',
    muted:   'text-txt-tertiary',
  }
  return (
    <div className="text-center bg-surface-alt rounded-lg p-2">
      <div className="text-[10px] text-txt-tertiary">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${toneColor[tone]}`}>{value.toLocaleString('ko-KR')}</div>
    </div>
  )
}

function PipelineRow({
  label,
  dist,
  onClick,
}: {
  label: string
  dist: PipelineDistribution
  onClick?: () => void
}) {
  // total includes noAudio so the denominator reflects all both_agreed sessions
  const total = dist.pending + dist.running + dist.done + dist.failed + (dist.noAudio ?? 0)
  const donePct = total > 0 ? Math.round((dist.done / total) * 100) : 0
  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-txt">{label}</span>
            <span className="text-xs text-txt-sub tabular-nums">
              {dist.done.toLocaleString('ko-KR')}/{total.toLocaleString('ko-KR')} ({donePct}%)
            </span>
          </div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden flex">
            {bar(dist.done, total, 'bg-success')}
            {bar(dist.running, total, 'bg-accent')}
            {bar(dist.pending, total, 'bg-border')}
            {bar(dist.failed, total, 'bg-danger')}
          </div>
          <div className="mt-2 flex items-center flex-wrap gap-2 text-xs text-txt-sub">
            <Badge tone="success" size="sm">{labels.status.done} {dist.done}</Badge>
            <Badge tone="accent" size="sm">{labels.status.running} {dist.running}</Badge>
            {dist.pending > 0 && <Badge tone="neutral" size="sm">대기 중 {dist.pending}</Badge>}
            {dist.failed > 0 && <Badge tone="danger" size="sm">{labels.status.failed} {dist.failed}</Badge>}
            {dist.noAudio > 0 && (
              <Badge tone="warning" size="sm" title="오디오 미업로드 — GPU 워커가 처리할 수 없음">
                오디오 없음 {dist.noAudio}
              </Badge>
            )}
          </div>
        </div>
        {onClick && (
          <Button size="sm" variant="ghost" onClick={onClick} aria-label="자세히">
            →
          </Button>
        )}
      </div>
    </Card>
  )
}

function bar(value: number, total: number, cls: string) {
  if (total === 0 || value === 0) return null
  const pct = (value / total) * 100
  return <div className={cls} style={{ width: `${pct}%` }} aria-hidden="true" />
}

// ── Tab: Review ─────────────────────────────────────────────────────────
function ReviewTab({ stats }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  const items = [
    { key: 'pending', label: labels.review.pending, count: stats.review.pending, tone: 'neutral' as const },
    { key: 'in_review', label: labels.review.in_review, count: stats.review.in_review, tone: 'accent' as const },
    { key: 'approved', label: labels.review.approved, count: stats.review.approved, tone: 'success' as const },
    { key: 'rejected', label: labels.review.rejected, count: stats.review.rejected, tone: 'danger' as const },
    { key: 'needs_revision', label: labels.review.needs_revision, count: stats.review.needs_revision, tone: 'warning' as const },
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map((it) => (
          <Card key={it.key} padding="sm">
            <div className="text-xs text-txt-sub">{it.label}</div>
            <div className="mt-1 text-2xl font-bold text-txt">{it.count.toLocaleString('ko-KR')}</div>
          </Card>
        ))}
      </div>
      <InlineReviewQueue />
    </div>
  )
}

// ── Tab: Delivery ───────────────────────────────────────────────────────
function DeliveryTab({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BigStat
          title="총 납품 건수"
          value={stats.delivery.total.toLocaleString('ko-KR')}
          sub="비배타적 라이선스"
        />
        <BigStat
          title="최근 30일 매출"
          value={`₩${stats.delivery.recentRevenue.toLocaleString('ko-KR')}`}
        />
      </div>
      <Card>
        <CardHeader title="최근 납품 10건" />
        <CardBody>
          {stats.delivery.recent.length === 0 ? (
            <p className="text-sm text-txt-sub">{labels.empty.delivery}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {stats.delivery.recent.map((d) => (
                <li key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-txt truncate">통화 {d.session_id.slice(0, 8)}…</div>
                    <div className="text-xs text-txt-sub">
                      매수자 {d.client_id.slice(0, 8)}… · {new Date(d.delivered_at).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-txt">₩{d.price_krw.toLocaleString('ko-KR')}</div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <InlineDeliverableSessions onNavigate={onNavigate} />
    </div>
  )
}

// ── Tab: Alerts ─────────────────────────────────────────────────────────
function AlertsTab({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader
          title={labels.warning.pipelineFailed}
          description="실패한 단계가 있는 통화 — 재시도 또는 운영자 검토 필요"
        />
        <CardBody>
          <div className="text-3xl font-bold text-danger">
            {stats.alerts.pipelineFailedCount.toLocaleString('ko-KR')}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onNavigate('/admin/utterances?session_review=all&consent=all')}
            >
              실패 통화 검수
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title={labels.review.rejected}
          description="운영자 거절 통화 — 약관 위반 또는 저품질"
        />
        <CardBody>
          <div className="text-3xl font-bold text-danger">
            {stats.alerts.rejectedCount.toLocaleString('ko-KR')}
          </div>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => onNavigate('/admin/utterances?session_review=rejected')}>
              거절 목록 보기
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

// ── InlineCallList ──────────────────────────────────────────────────────
function InlineCallList() {
  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchReviewQueue({ consentStatus: 'both_agreed', reviewStatus: 'all' })
    if (res.error) setError(res.error)
    else setData(res.data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const columns: ColumnDef<AdminSession>[] = useMemo(() => [
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
      render: (s) => inlineFmtDuration(s.duration_seconds),
      width: '90px',
    },
    {
      key: 'date',
      header: '날짜',
      render: (s) => new Date(s.date).toLocaleDateString('ko-KR'),
      width: '100px',
    },
    {
      key: 'pipeline',
      header: '처리 흐름',
      render: (s) => <InlinePipelineCells session={s} />,
    },
    {
      key: 'review',
      header: '검수',
      render: (s) => <StatusBadge kind="review" value={s.review_status ?? 'pending'} />,
      width: '110px',
    },
  ], [])

  if (error) return <ErrorBanner message={error} onRetry={load} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-txt">양측 동의 통화 목록</span>
        {data && <span className="text-xs text-txt-sub">{data.total.toLocaleString('ko-KR')}건</span>}
      </div>
      <DataTable<AdminSession>
        data={data?.sessions ?? null}
        columns={columns}
        rowKey={(s) => s.id}
        loading={loading}
        error={null}
        emptyTitle="양측 동의 통화 없음"
        emptyHint="양측 동의가 완료된 통화가 없습니다."
      />
    </div>
  )
}

// ── InlineReviewQueue ───────────────────────────────────────────────────
const INLINE_REVIEW_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: labels.review.pending },
  { value: 'in_review', label: labels.review.in_review },
  { value: 'approved', label: labels.review.approved },
  { value: 'rejected', label: labels.review.rejected },
  { value: 'needs_revision', label: labels.review.needs_revision },
]

const INLINE_CONSENT_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'both_agreed', label: labels.consent.both_agreed },
  { value: 'user_only', label: labels.consent.user_only },
]

function InlineReviewQueue() {
  const navigate = useNavigate()
  const toast = useToast()

  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | 'all'>('pending')
  const [consentFilter, setConsentFilter] = useState<'both_agreed' | 'user_only' | 'all'>('both_agreed')
  const [qualityLow, setQualityLow] = useState(false)
  const [search, setSearch] = useState('')

  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    sessionId: string; status: ReviewStatus; label: string; body: string
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [bulkDryRun, setBulkDryRun] = useState<BulkAutoApproveResponse | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchReviewQueue({
      reviewStatus: reviewFilter,
      consentStatus: consentFilter,
      qualityLow,
      pipelineFailed: false,
      search: search || undefined,
    })
    if (res.error) setError(res.error)
    else setData(res.data ?? null)
    setLoading(false)
  }, [reviewFilter, consentFilter, qualityLow, search])

  useEffect(() => { load() }, [load])

  const reloadBulkDryRun = useCallback(async () => {
    const res = await bulkAutoApprove({ dryRun: true })
    if (!res.error && res.data) setBulkDryRun(res.data)
  }, [])
  useEffect(() => { reloadBulkDryRun() }, [reloadBulkDryRun, data])

  async function handleBulkApprove() {
    setBulkLoading(true)
    const res = await bulkAutoApprove({ dryRun: false })
    setBulkLoading(false)
    setBulkConfirm(false)
    if (res.error) { toast.error(`일괄 승인 실패: ${res.error}`); return }
    const d = res.data!
    toast.success(`일괄 승인 완료 — 승인 ${d.approved}건 / 보류 ${d.skipped}건`)
    await load()
    await reloadBulkDryRun()
  }

  const handleAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    const res = await updateReviewStatus(confirmAction.sessionId, confirmAction.status)
    setActionLoading(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(inlineGetToastForStatus(confirmAction.status))
    setConfirmAction(null)
    await load()
  }

  const totalDurationSec = data?.filteredDurationSec ?? 0

  const columns: ColumnDef<AdminSession>[] = useMemo(() => [
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
      render: (s) => inlineFmtDuration(s.duration_seconds),
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
      render: (s) => <InlinePipelineCells session={s} />,
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
      render: (s) => (
        <InlineRowActions
          session={s}
          onAction={(status, label, body) =>
            setConfirmAction({ sessionId: s.id, status, label, body })
          }
        />
      ),
      width: '280px',
    },
  ], [])

  return (
    <div className="space-y-4">
      {/* 자동 승인 */}
      {bulkDryRun && bulkDryRun.eligibleCount !== undefined && (
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="text-txt">
                자동 승인 가능 <span className="font-bold text-accent">{bulkDryRun.eligibleCount}</span>건
                <span className="text-txt-sub"> · 보류 {bulkDryRun.skipped}건</span>
              </div>
              <div className="text-xs text-txt-sub mt-0.5">
                조건: A등급 + 숫자 7자리+ 없음 + ≥1초 + 화자 할당 + PII 위험 없음
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={bulkDryRun.eligibleCount === 0 || bulkLoading}
              onClick={() => setBulkConfirm(true)}
            >
              {bulkLoading ? '처리 중…' : `${bulkDryRun.eligibleCount}건 일괄 승인`}
            </Button>
          </div>
        </Card>
      )}

      {/* 통화시간 합산 */}
      {data && (
        <Card padding="sm">
          <div className="text-sm text-txt-sub">
            현재 필터 결과: <span className="font-semibold text-txt">{data.total}</span>건 (총{' '}
            <span className="font-semibold text-txt">{inlineFmtDuration(totalDurationSec)}</span>)
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
              options={INLINE_REVIEW_FILTER_OPTIONS}
              onChange={(e) => setReviewFilter(e.target.value as ReviewStatus | 'all')}
            />
            <Select
              label="동의 상태"
              value={consentFilter}
              options={INLINE_CONSENT_FILTER_OPTIONS}
              onChange={(e) => setConsentFilter(e.target.value as 'both_agreed' | 'user_only' | 'all')}
            />
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-txt mb-1.5">우선 정렬</label>
              <label className="inline-flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={qualityLow}
                  onChange={(e) => setQualityLow(e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm text-txt">저품질 우선</span>
              </label>
            </div>
            <Input
              label="검색"
              placeholder="제목 / 세션 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <DataTable<AdminSession>
        data={data?.sessions ?? null}
        columns={columns}
        rowKey={(s) => s.id}
        loading={loading}
        error={null}
        emptyTitle={labels.empty.review}
        emptyHint={labels.empty.reviewHint}
        onRowClick={(s) => {
          if (isPipelineComplete(s)) {
            navigate(`/admin/utterances?session=${s.id}`)
          } else {
            const failed = firstFailedStep(s)
            const progress = pipelineProgress(s)
            toast.show(
              failed
                ? `처리 흐름 ${labels.pipeline[failed]} 단계 실패 — 재시도 필요 (${Math.round(progress * 5)}/5 완료)`
                : `처리 흐름 진행 중 (${Math.round(progress * 5)}/5 완료) — 모든 단계 완료 후 발화 검수 가능`,
              'info',
            )
          }
        }}
      />

      {!loading && !error && (data?.sessions.length ?? 0) === 0 && (
        <EmptyState
          icon={<EmptyIcon />}
          title={labels.empty.review}
          description={labels.empty.reviewHint}
        />
      )}

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

      {bulkConfirm && bulkDryRun && (
        <ConfirmDialog
          open
          onClose={() => setBulkConfirm(false)}
          onConfirm={handleBulkApprove}
          title="조건부 일괄 자동 승인"
          body={`자동 승인 가능 ${bulkDryRun.eligibleCount ?? 0}건을 일괄 approved 로 전환합니다. 보류된 ${bulkDryRun.skipped}건은 수동 검수 필요. label_source='auto:bulk_review' 로 기록됩니다.`}
          confirmLabel={`${bulkDryRun.eligibleCount ?? 0}건 승인`}
          variant="primary"
          loading={bulkLoading}
        />
      )}
    </div>
  )
}

// ── Inline helpers (shared by InlineCallList & InlineReviewQueue) ────────

function inlineFmtDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}

function inlineGetToastForStatus(status: ReviewStatus): string {
  switch (status) {
    case 'approved': return labels.toast.approved
    case 'rejected': return labels.toast.rejected
    case 'needs_revision': return labels.toast.needsRevision
    default: return labels.toast.saved
  }
}

function InlinePipelineCells({ session }: { session: AdminSession }) {
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
          className={`w-2.5 h-2.5 rounded-full ${inlineDotClass(step.status)}`}
          aria-label={`${labels.pipeline[step.key]} ${step.status ?? 'pending'}`}
        />
      ))}
      <span className="ml-2 text-xs text-txt-sub tabular-nums">{progressPct}%</span>
      {failed && <span className="ml-1 text-xs text-danger" title={`실패 단계: ${failed}`}>⚠</span>}
    </div>
  )
}

function inlineDotClass(status: string | undefined): string {
  switch (status) {
    case 'done': return 'bg-success'
    case 'running': return 'bg-accent animate-pulse'
    case 'failed': return 'bg-danger'
    default: return 'bg-muted border border-border'
  }
}

function InlineRowActions({
  session,
  onAction,
}: {
  session: AdminSession
  onAction: (status: ReviewStatus, label: string, body: string) => void
}) {
  const complete = isPipelineComplete(session)
  const review = session.review_status ?? 'pending'

  if (!complete && review === 'pending') {
    return <span className="text-xs text-txt-tertiary">처리 흐름 진행 중</span>
  }
  if (review === 'approved' || review === 'rejected') {
    return <span className="text-xs text-txt-tertiary">완료된 결정</span>
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="primary"
        onClick={() => onAction('approved', labels.action.approve, '승인 후에는 납품 가능 상태로 전환됩니다.')}
      >
        {labels.action.approve}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onAction('needs_revision', labels.action.needRevision, 'PII 보정 또는 라벨 수정이 필요한 경우 사용합니다.')}
      >
        {labels.action.needRevision}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => onAction('rejected', labels.action.reject, labels.confirm.rejectBody)}
      >
        {labels.action.reject}
      </Button>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────
function BigStat({
  title,
  value,
  sub,
  onClick,
}: {
  title: string
  value: string
  sub?: string
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left bg-surface border border-border rounded-xl p-5 ${
        onClick
          ? 'hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-accent transition-colors cursor-pointer'
          : ''
      }`}
    >
      <div className="text-sm text-txt-sub">{title}</div>
      <div className="mt-2 text-3xl font-bold text-txt tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-txt-tertiary">{sub}</div>}
    </Wrapper>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} padding="md">
          <Skeleton variant="text" width="40%" />
          <div className="mt-3">
            <Skeleton width="60%" height={32} />
          </div>
          <div className="mt-2">
            <Skeleton variant="text" width="50%" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function formatHours(sec: number): string {
  if (sec <= 0) return '0시간'
  const h = sec / 3600
  if (h >= 100) return `${Math.round(h).toLocaleString('ko-KR')}시간`
  return `${h.toFixed(1)}시간`
}

// ── InlineDeliverableSessions — 검수 승인 통화 인라인 목록 (납품 탭 하위) ──
//
// 사용자가 별도 페이지로 전환하지 않고도 납품 가능한 통화를 확인할 수 있도록
// /admin/utterances 페이지의 핵심 데이터(승인된 통화) 를 inline 으로 표시.
// 행 클릭 → /admin/utterances?session={id} 로 이동하여 발화 선택 + 납품.
function InlineDeliverableSessions({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchReviewQueue({ reviewStatus: 'approved', consentStatus: 'both_agreed' })
    if (res.error) setError(res.error)
    else setData(res.data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const columns: ColumnDef<AdminSession>[] = useMemo(() => [
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
      render: (s) => inlineFmtDuration(s.duration_seconds),
      width: '90px',
    },
    {
      key: 'review',
      header: '검수',
      render: (s) => <StatusBadge kind="review" value={s.review_status ?? 'pending'} />,
      width: '110px',
    },
    {
      key: 'go',
      header: '',
      align: 'right',
      width: '120px',
      render: (s) => (
        <Button
          size="sm"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(`/admin/utterances?session=${s.id}`)
          }}
        >
          납품
        </Button>
      ),
    },
  ], [onNavigate])

  if (error) return <ErrorBanner message={error} onRetry={load} />

  return (
    <Card>
      <CardHeader
        title="납품 가능 통화"
        description="검수 승인 + 양측 동의 — 클릭하면 발화 선택 + 납품 등록 페이지로 이동"
      />
      <CardBody>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-txt-sub">
            {data ? `${data.total.toLocaleString('ko-KR')}건` : ''}
          </span>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('/admin/utterances?session_review=approved')}>
            전체 보기 →
          </Button>
        </div>
        <DataTable<AdminSession>
          data={data?.sessions ?? null}
          columns={columns}
          rowKey={(s) => s.id}
          loading={loading}
          error={null}
          emptyTitle="납품 가능 통화 없음"
          emptyHint="검수 승인된 양측 동의 통화가 없습니다."
          onRowClick={(s) => onNavigate(`/admin/utterances?session=${s.id}`)}
        />
      </CardBody>
    </Card>
  )
}
