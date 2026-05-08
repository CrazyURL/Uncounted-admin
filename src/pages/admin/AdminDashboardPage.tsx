import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardHeader,
  CardBody,
  ErrorBanner,
  Skeleton,
  Badge,
  Button,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import { fetchDashboardStats, type DashboardStats, type PipelineDistribution } from '../../lib/api/dashboard'

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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BigStat
        title="양측 동의 통화"
        value={stats.consent.bothAgreedCount.toLocaleString('ko-KR')}
        sub={`최근 24시간 +${stats.consent.bothAgreed24h.toLocaleString('ko-KR')}건`}
        onClick={() => onNavigate('/admin/consents')}
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
        onClick={() => onNavigate('/admin/review')}
      />
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
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <PipelineRow key={s.key} label={s.label} dist={stats.pipeline[s.key]} onClick={() => onNavigate('/admin/sessions')} />
      ))}
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
  const total = dist.pending + dist.running + dist.done + dist.failed
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
          <div className="mt-2 flex items-center gap-3 text-xs text-txt-sub">
            <Badge tone="success" size="sm">{labels.status.done} {dist.done}</Badge>
            <Badge tone="accent" size="sm">{labels.status.running} {dist.running}</Badge>
            <Badge tone="neutral" size="sm">{labels.status.pending} {dist.pending}</Badge>
            {dist.failed > 0 && <Badge tone="danger" size="sm">{labels.status.failed} {dist.failed}</Badge>}
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
function ReviewTab({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  const items = [
    { key: 'pending', label: labels.review.pending, count: stats.review.pending, tone: 'neutral' as const },
    { key: 'in_review', label: labels.review.in_review, count: stats.review.in_review, tone: 'accent' as const },
    { key: 'approved', label: labels.review.approved, count: stats.review.approved, tone: 'success' as const },
    { key: 'rejected', label: labels.review.rejected, count: stats.review.rejected, tone: 'danger' as const },
    { key: 'needs_revision', label: labels.review.needs_revision, count: stats.review.needs_revision, tone: 'warning' as const },
  ]
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map((it) => (
          <Card key={it.key} padding="sm">
            <div className="text-xs text-txt-sub">{it.label}</div>
            <div className="mt-1 text-2xl font-bold text-txt">{it.count.toLocaleString('ko-KR')}</div>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <Button variant="primary" onClick={() => onNavigate('/admin/review')}>
          검수 대기열 열기
        </Button>
      </div>
    </div>
  )
}

// ── Tab: Delivery ───────────────────────────────────────────────────────
function DeliveryTab({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (p: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BigStat
          title="총 납품 건수"
          value={stats.delivery.total.toLocaleString('ko-KR')}
          sub="비배타적 라이선스"
        />
        <BigStat
          title="최근 30일 매출"
          value={`₩${stats.delivery.recentRevenue.toLocaleString('ko-KR')}`}
        />
        <Card>
          <CardHeader title="신규 납품" description="검수 승인된 통화부터 등록" />
          <CardBody>
            <Button variant="primary" fullWidth onClick={() => onNavigate('/admin/delivery/new')}>
              납품 등록
            </Button>
          </CardBody>
        </Card>
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
              onClick={() => onNavigate('/admin/review?pipeline_failed=1&review=all&consent=all')}
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
            <Button size="sm" variant="secondary" onClick={() => onNavigate('/admin/review?review=rejected')}>
              거절 목록 보기
            </Button>
          </div>
        </CardBody>
      </Card>
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
