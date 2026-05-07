import { useCallback, useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card,
  DataTable,
  Input,
  Badge,
  ErrorBanner,
  type ColumnDef,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import { fetchBalances, type BalanceUser, type BalancesResponse } from '../../lib/api/balances'

export default function AdminBalancesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''

  const [data, setData] = useState<BalancesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams)
      if (value == null || value === '') next.delete(key)
      else next.set(key, value)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchBalances(search || undefined)
    if (res.error) setError(res.error)
    else setData(res.data ?? null)
    setLoading(false)
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  const summary = useMemo(() => {
    if (!data) return { reached: 0, approaching: 0, totalPayout: 0 }
    let reached = 0
    let approaching = 0
    let totalPayout = 0
    for (const u of data.users) {
      if (u.capReached) reached++
      else if (u.capApproaching) approaching++
      totalPayout += u.userPayoutKrw
    }
    return { reached, approaching, totalPayout }
  }, [data])

  const columns: ColumnDef<BalanceUser>[] = useMemo(
    () => [
      {
        key: 'user',
        header: '사용자',
        render: (u) => (
          <div>
            <div className="font-medium text-txt">{u.email || '(이메일 없음)'}</div>
            <div className="text-xs text-txt-tertiary">{u.userId.slice(0, 8)}…</div>
          </div>
        ),
      },
      {
        key: 'hours',
        header: '발화 시간',
        align: 'right',
        render: (u) => <span className="tabular-nums">{u.hours.toFixed(1)}시간</span>,
        width: '120px',
      },
      {
        key: 'gross',
        header: '총액',
        align: 'right',
        render: (u) => (
          <span className="tabular-nums text-txt-sub">
            ₩{u.grossKrw.toLocaleString('ko-KR')}
          </span>
        ),
        width: '140px',
      },
      {
        key: 'payout',
        header: `${labels.noun.payout} (50%)`,
        align: 'right',
        render: (u) => (
          <span className="tabular-nums font-semibold text-txt">
            ₩{u.userPayoutKrw.toLocaleString('ko-KR')}
          </span>
        ),
        width: '160px',
      },
      {
        key: 'cap',
        header: labels.noun.cap,
        align: 'right',
        render: (u) => <CapCell user={u} yearlyCapKrw={data?.constants.yearlyCapKrw ?? 3_000_000} />,
        width: '180px',
      },
    ],
    [data?.constants.yearlyCapKrw],
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-txt">{labels.noun.balance} 관리</h1>
        <p className="mt-1 text-sm text-txt-sub">
          사용자별 발화 시간 누적 + 연간 한도 도달률 ({formatKrw(data?.constants.yearlyCapKrw ?? 3_000_000)})
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card padding="sm">
          <div className="text-xs text-txt-sub">총 사용자</div>
          <div className="mt-1 text-2xl font-bold text-txt">
            {data?.totalUsers.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">한도 도달</div>
          <div className="mt-1 text-2xl font-bold text-danger">{summary.reached}</div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">한도 80% 임박</div>
          <div className="mt-1 text-2xl font-bold text-warning">{summary.approaching}</div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">합산 정산금</div>
          <div className="mt-1 text-xl font-bold text-txt tabular-nums">
            ₩{summary.totalPayout.toLocaleString('ko-KR')}
          </div>
        </Card>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <Card padding="sm">
        <Input
          label="검색"
          placeholder="이메일 또는 사용자 ID"
          value={search}
          onChange={(e) => updateParam('q', e.target.value)}
        />
      </Card>

      <DataTable<BalanceUser>
        data={data?.users ?? null}
        columns={columns}
        rowKey={(u) => u.userId}
        loading={loading}
        emptyTitle={labels.empty.balances}
        emptyHint="양측 동의된 통화가 있는 사용자만 표시됩니다."
      />
    </div>
  )
}

function CapCell({ user, yearlyCapKrw }: { user: BalanceUser; yearlyCapKrw: number }) {
  const pct = Math.min(100, Math.round(user.capRatio * 100))
  const barColor = user.capReached
    ? 'bg-danger'
    : user.capApproaching
    ? 'bg-warning'
    : 'bg-success'

  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <span className="tabular-nums text-sm text-txt">{pct}%</span>
        {user.capReached && <Badge tone="danger" size="sm">한도 도달</Badge>}
        {user.capApproaching && <Badge tone="warning" size="sm">80% 임박</Badge>}
      </div>
      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={barColor} style={{ width: `${pct}%`, height: '100%' }} aria-hidden="true" />
      </div>
      <div className="mt-1 text-xs text-txt-tertiary">
        잔여 ₩{Math.max(0, yearlyCapKrw - user.userPayoutKrw).toLocaleString('ko-KR')}
      </div>
    </div>
  )
}

function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`
}
