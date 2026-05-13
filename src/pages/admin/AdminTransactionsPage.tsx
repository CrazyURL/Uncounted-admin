import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  DataTable,
  ErrorBanner,
  Select,
  type ColumnDef,
  type SelectOption,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import { apiFetch } from '../../lib/api/client'
import { fetchClients, type DeliveryClient, type Delivery } from '../../lib/api/deliveries'

interface DeliveriesResponse {
  deliveries: Delivery[]
  total: number
}

async function fetchDeliveries(clientId?: string) {
  const params = new URLSearchParams()
  if (clientId) params.set('client_id', clientId)
  return apiFetch<DeliveriesResponse>(`/api/admin/deliveries?${params.toString()}`)
}

export default function AdminTransactionsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const clientFilter = searchParams.get('client') ?? ''

  const [data, setData] = useState<DeliveriesResponse | null>(null)
  const [clients, setClients] = useState<DeliveryClient[]>([])
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
    const [d, c] = await Promise.all([
      fetchDeliveries(clientFilter || undefined),
      fetchClients(),
    ])
    if (d.error) setError(d.error)
    else setData(d.data ?? null)
    if (!c.error) setClients(c.data ?? [])
    setLoading(false)
  }, [clientFilter])

  useEffect(() => {
    load()
  }, [load])

  // client_id → name 매핑
  const clientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.name ?? id.slice(0, 8) + '…',
    [clients],
  )

  const totalRevenue = useMemo(() => {
    return (data?.deliveries ?? []).reduce((sum, d) => sum + d.price_krw, 0)
  }, [data])

  const columns: ColumnDef<Delivery>[] = useMemo(
    () => [
      {
        key: 'session',
        header: '통화',
        render: (d) => (
          <div>
            <div className="font-mono text-sm text-txt">{d.session_id.slice(0, 8)}…</div>
          </div>
        ),
        width: '140px',
      },
      {
        key: 'client',
        header: '매수자',
        render: (d) => clientName(d.client_id),
      },
      {
        key: 'date',
        header: '납품일',
        render: (d) => new Date(d.delivered_at).toLocaleDateString('ko-KR'),
        width: '120px',
      },
      {
        key: 'price',
        header: '매출',
        align: 'right',
        render: (d) => (
          <span className="tabular-nums font-semibold text-txt">
            ₩{d.price_krw.toLocaleString('ko-KR')}
          </span>
        ),
        width: '140px',
      },
      {
        key: 'notes',
        header: '비고',
        render: (d) => <span className="text-txt-sub text-sm">{d.notes ?? '-'}</span>,
      },
    ],
    [clientName],
  )

  const clientOptions: SelectOption[] = useMemo(
    () => [
      { value: 'all', label: '전체 매수자' },
      ...clients.map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients],
  )

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-txt">{labels.noun.transaction} 내역</h1>
          <p className="mt-1 text-sm text-txt-sub">
            매수자별 납품 이력 — {labels.noun.nonexclusive} 라이선스 (같은 통화가 여러 row 가능)
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/admin/utterances')}>
          {labels.noun.delivery} 등록
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card padding="sm">
          <div className="text-xs text-txt-sub">총 납품 건수</div>
          <div className="mt-1 text-2xl font-bold text-txt">
            {data?.total.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">합산 매출 (현재 페이지)</div>
          <div className="mt-1 text-xl font-bold text-txt tabular-nums">
            ₩{totalRevenue.toLocaleString('ko-KR')}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">매수자 수</div>
          <div className="mt-1 text-2xl font-bold text-txt">{clients.length}</div>
        </Card>
      </div>

      <Card padding="sm">
        <Select
          label="매수자 필터"
          value={clientFilter || 'all'}
          options={clientOptions}
          onChange={(e) => updateParam('client', e.target.value)}
        />
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <DataTable<Delivery>
        data={data?.deliveries ?? null}
        columns={columns}
        rowKey={(d) => d.id}
        loading={loading}
        emptyTitle={labels.empty.transactions}
        emptyHint="첫 납품을 등록하면 여기에 표시됩니다"
      />
    </div>
  )
}
