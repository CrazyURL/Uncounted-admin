import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card,
  DataTable,
  Input,
  Select,
  Badge,
  ErrorBanner,
  type ColumnDef,
  type SelectOption,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import {
  fetchUtterances,
  fetchUtteranceStats,
  type AdminUtterance,
  type UtteranceListResponse,
  type UtteranceStatsResponse,
} from '../../lib/api/utterances'

const SETTLED_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'yes', label: '정산 완료' },
  { value: 'no', label: '미정산' },
]

export default function AdminUtterancesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const settled = (searchParams.get('settled') ?? 'all') as 'all' | 'yes' | 'no'
  const search = searchParams.get('q') ?? ''
  const sessionId = searchParams.get('session') ?? ''

  const [data, setData] = useState<UtteranceListResponse | null>(null)
  const [stats, setStats] = useState<UtteranceStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    const [list, st] = await Promise.all([
      fetchUtterances({
        settled: settled === 'all' ? undefined : settled,
        sessionId: sessionId || undefined,
        search: search || undefined,
      }),
      fetchUtteranceStats(),
    ])
    if (list.error) setError(list.error)
    else setData(list.data ?? null)
    if (!st.error) setStats(st.data ?? null)
    setLoading(false)
  }, [settled, sessionId, search])

  useEffect(() => {
    load()
  }, [load])

  const columns: ColumnDef<AdminUtterance>[] = useMemo(
    () => [
      {
        key: 'session',
        header: '세션',
        render: (u) => (
          <span className="font-mono text-xs text-txt-sub">{u.session_id.slice(0, 8)}…</span>
        ),
        width: '110px',
      },
      {
        key: 'speaker',
        header: '발화자',
        render: (u) => (u.speaker_id ? `S${u.speaker_id.slice(-2)}` : '-'),
        width: '90px',
      },
      {
        key: 'time',
        header: '시각',
        render: (u) => (
          <span className="tabular-nums text-xs text-txt-sub">
            {formatMs(u.start_ms)} – {formatMs(u.end_ms)}
          </span>
        ),
        width: '170px',
      },
      {
        key: 'duration',
        header: '길이',
        align: 'right',
        render: (u) => (
          <span className="tabular-nums">{u.duration_seconds.toFixed(1)}초</span>
        ),
        width: '90px',
      },
      {
        key: 'text',
        header: '발화',
        render: (u) => <span className="text-sm text-txt">{u.text || '(공백)'}</span>,
      },
      {
        key: 'price',
        header: '단가',
        align: 'right',
        render: (u) => (
          <span className="tabular-nums text-sm">
            ₩{u.unit_price_krw.toLocaleString('ko-KR')}
          </span>
        ),
        width: '110px',
      },
      {
        key: 'settled',
        header: '정산',
        render: (u) =>
          u.settled_at ? (
            <Badge tone="success" size="sm">정산 완료</Badge>
          ) : (
            <Badge tone="neutral" size="sm">미정산</Badge>
          ),
        width: '110px',
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-txt">{labels.noun.utterance} 단위 정산</h1>
        <p className="mt-1 text-sm text-txt-sub">
          BM v10 — 청구 단위(BU) 폐기. 발화(utterance)가 단일 정산 기준입니다.
          단가 = 길이(초) × 시간당 단가 / 3600.
        </p>
      </header>

      {/* 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card padding="sm">
          <div className="text-xs text-txt-sub">총 발화</div>
          <div className="mt-1 text-2xl font-bold text-txt">
            {stats?.total.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">정산 완료</div>
          <div className="mt-1 text-2xl font-bold text-success">
            {stats?.settledCount.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">미정산</div>
          <div className="mt-1 text-2xl font-bold text-warning">
            {stats?.unsettledCount.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">예상 매출</div>
          <div className="mt-1 text-xl font-bold text-txt tabular-nums">
            ₩{(stats?.estimatedRevenueKrw ?? 0).toLocaleString('ko-KR')}
          </div>
        </Card>
      </div>

      {/* 필터 */}
      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="정산 상태"
            value={settled}
            options={SETTLED_OPTIONS}
            onChange={(e) => updateParam('settled', e.target.value)}
          />
          <Input
            label="세션 ID"
            placeholder="세션 ID 일부"
            value={sessionId}
            onChange={(e) => updateParam('session', e.target.value)}
          />
          <Input
            label="발화 검색"
            placeholder="텍스트 검색"
            value={search}
            onChange={(e) => updateParam('q', e.target.value)}
          />
        </div>
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <DataTable<AdminUtterance>
        data={data?.utterances ?? null}
        columns={columns}
        rowKey={(u) => u.id}
        loading={loading}
        emptyTitle="발화가 없습니다"
        emptyHint="GPU 처리(STT + 화자 분리) 완료 후 발화가 생성됩니다"
      />
    </div>
  )
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
