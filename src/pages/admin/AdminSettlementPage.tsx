import { useState, useEffect } from 'react'
import { loadLedgerEntries, updateLedgerStatus } from '../../lib/adminStore'
import { type LedgerEntry, type LedgerStatus, LEDGER_TYPE_LABEL_KO, LEDGER_STATUS_LABEL_KO } from '../../types/ledger'

type GroupedByUser = {
  userId: string
  entries: LedgerEntry[]
  estimatedLow: number
  estimatedHigh: number
  confirmedTotal: number
  withdrawableTotal: number
  paidTotal: number
}

function groupByUser(entries: LedgerEntry[]): GroupedByUser[] {
  const map = new Map<string, LedgerEntry[]>()
  for (const e of entries) {
    if (e.status === 'voided') continue
    const arr = map.get(e.userId) ?? []
    arr.push(e)
    map.set(e.userId, arr)
  }
  return Array.from(map.entries()).map(([userId, entries]) => ({
    userId,
    entries,
    estimatedLow: entries.filter(e => e.status === 'estimated').reduce((s, e) => s + e.amountLow, 0),
    estimatedHigh: entries.filter(e => e.status === 'estimated').reduce((s, e) => s + e.amountHigh, 0),
    confirmedTotal: entries.filter(e => e.status === 'confirmed').reduce((s, e) => s + (e.amountConfirmed ?? e.amountHigh), 0),
    withdrawableTotal: entries.filter(e => e.status === 'withdrawable').reduce((s, e) => s + (e.amountConfirmed ?? e.amountHigh), 0),
    paidTotal: entries.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amountConfirmed ?? e.amountHigh), 0),
  })).sort((a, b) => b.confirmedTotal - a.confirmedTotal)
}

const STATUS_COLORS: Record<LedgerStatus, string> = {
  estimated: '#3b82f6',
  confirmed: '#f59e0b',
  withdrawable: '#22c55e',
  paid: '#6b7280',
  voided: '#ef4444',
}

export default function AdminSettlementPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LedgerStatus | 'all'>('all')
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const data = await loadLedgerEntries(filter === 'all' ? undefined : { status: filter })
    setEntries(data)
    setLoading(false)
  }

  useEffect(() => { reload() }, [filter])

  const groups = groupByUser(entries)

  // 전체 합산
  const totalConfirmed = groups.reduce((s, g) => s + g.confirmedTotal, 0)
  const totalWithdrawable = groups.reduce((s, g) => s + g.withdrawableTotal, 0)
  const totalPaid = groups.reduce((s, g) => s + g.paidTotal, 0)
  const confirmedCount = entries.filter(e => e.status === 'confirmed').length

  async function handleBatchTransition(from: LedgerStatus, to: LedgerStatus) {
    setProcessing(true)
    setMessage(null)
    try {
      const targetEntries = entries.filter(e => e.status === from)
      const ids = targetEntries.map(e => e.id)
      if (ids.length === 0) {
        setMessage(`${LEDGER_STATUS_LABEL_KO[from]} 상태 항목 없음`)
        return
      }
      const updated = await updateLedgerStatus(ids, to)
      setMessage(`${updated}건: ${LEDGER_STATUS_LABEL_KO[from]} \u2192 ${LEDGER_STATUS_LABEL_KO[to]}`)
      await reload()
    } catch (err) {
      console.error('Batch transition error:', err)
      setMessage('전환 실패')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>확정 대기</p>
          <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>
            {totalConfirmed.toLocaleString()}<span className="text-xs font-normal">원</span>
          </p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{confirmedCount}건</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>출금 가능</p>
          <p className="text-lg font-bold" style={{ color: '#22c55e' }}>
            {totalWithdrawable.toLocaleString()}<span className="text-xs font-normal">원</span>
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>지급 완료</p>
          <p className="text-lg font-bold" style={{ color: '#6b7280' }}>
            {totalPaid.toLocaleString()}<span className="text-xs font-normal">원</span>
          </p>
        </div>
      </div>

      {/* 배치 전환 버튼 */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>배치 상태 전환</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleBatchTransition('confirmed', 'withdrawable')}
            disabled={processing || confirmedCount === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-30"
            style={{ backgroundColor: '#22c55e' }}
          >
            확정{' \u2192 '}출금 가능 ({confirmedCount}건)
          </button>
          <button
            onClick={() => handleBatchTransition('withdrawable', 'paid')}
            disabled={processing || entries.filter(e => e.status === 'withdrawable').length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-30"
            style={{ backgroundColor: '#6b7280' }}
          >
            출금 가능{' \u2192 '}지급 완료
          </button>
        </div>
        {message && (
          <p className="text-xs mt-2" style={{ color: message.includes('실패') ? '#ef4444' : '#22c55e' }}>
            {message}
          </p>
        )}
      </div>

      {/* 필터 */}
      <div className="flex gap-1.5 overflow-x-auto">
        {(['all', 'estimated', 'confirmed', 'withdrawable', 'paid', 'voided'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="text-[10px] px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
            style={{
              backgroundColor: filter === s ? '#1337ec' : 'rgba(255,255,255,0.06)',
              color: filter === s ? 'white' : 'rgba(255,255,255,0.5)',
            }}
          >
            {s === 'all' ? '전체' : LEDGER_STATUS_LABEL_KO[s]}
          </button>
        ))}
      </div>

      {/* 사용자별 그룹 */}
      {groups.length === 0 && (
        <p className="text-xs text-center py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>원장 데이터 없음</p>
      )}
      {groups.map(g => (
        <div key={g.userId} className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
          <button
            onClick={() => setExpandedUser(expandedUser === g.userId ? null : g.userId)}
            className="w-full text-left p-3 flex items-center justify-between"
          >
            <div>
              <p className="text-xs text-white font-medium font-mono">{g.userId.slice(0, 12)}...</p>
              <div className="flex gap-3 mt-1">
                {g.confirmedTotal > 0 && (
                  <span className="text-[10px]" style={{ color: '#f59e0b' }}>확정 ₩{g.confirmedTotal.toLocaleString()}</span>
                )}
                {g.withdrawableTotal > 0 && (
                  <span className="text-[10px]" style={{ color: '#22c55e' }}>출금가능 ₩{g.withdrawableTotal.toLocaleString()}</span>
                )}
                {g.paidTotal > 0 && (
                  <span className="text-[10px]" style={{ color: '#6b7280' }}>지급 ₩{g.paidTotal.toLocaleString()}</span>
                )}
                {g.estimatedHigh > 0 && (
                  <span className="text-[10px]" style={{ color: '#3b82f6' }}>추정 ~₩{g.estimatedHigh.toLocaleString()}</span>
                )}
              </div>
            </div>
            <span className="material-symbols-outlined text-base" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {expandedUser === g.userId ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {expandedUser === g.userId && (
            <div className="border-t px-3 pb-3 space-y-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {g.entries.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${STATUS_COLORS[e.status]}20`, color: STATUS_COLORS[e.status] }}
                    >
                      {LEDGER_STATUS_LABEL_KO[e.status]}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{LEDGER_TYPE_LABEL_KO[e.ledgerType]}</span>
                  </div>
                  <span className="text-white font-mono">
                    {e.amountConfirmed !== null
                      ? `₩${e.amountConfirmed.toLocaleString()}`
                      : `₩${e.amountLow.toLocaleString()}~${e.amountHigh.toLocaleString()}`
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
