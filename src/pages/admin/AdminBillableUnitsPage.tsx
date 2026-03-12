import { useEffect, useState, useMemo, useRef } from 'react'
import { type Session } from '../../types/session'
import { type BillableUnit } from '../../types/admin'
import { loadAllSessions } from '../../lib/sessionMapper'
import { deriveUnitsFromSessions, summarizeUnits } from '../../lib/billableUnitEngine'
import { upsertBillableUnits } from '../../lib/adminStore'
import { loadBillableUnitsApi } from '../../lib/api/admin'
import UnitSummaryBar from '../../components/domain/UnitSummaryBar'
import BillableUnitRow from '../../components/domain/BillableUnitRow'

const PAGE_SIZE = 200

export default function AdminBillableUnitsPage() {
  const [units, setUnits] = useState<BillableUnit[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filterGrade, setFilterGrade] = useState<string | null>(null)
  const [filterConsent, setFilterConsent] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const offsetRef = useRef(0)
  offsetRef.current = offset

  useEffect(() => {
    setLoading(true)
    setUnits([])
    setOffset(0)
    setHasMore(false)
    loadBillableUnitsApi({
      qualityGrade: filterGrade ? [filterGrade as 'A' | 'B' | 'C'] : undefined,
      qualityTier: filterTier ? [filterTier] : undefined,
      consentStatus: filterConsent ?? undefined,
      limit: PAGE_SIZE,
      offset: 0,
    }).then(({ data, count }) => {
      const items = (data as BillableUnit[]) ?? []
      setUnits(items)
      setTotalCount(count ?? 0)
      setHasMore(items.length < (count ?? 0))
      setOffset(items.length)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filterGrade, filterConsent, filterTier])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const { data, count } = await loadBillableUnitsApi({
        qualityGrade: filterGrade ? [filterGrade as 'A' | 'B' | 'C'] : undefined,
        qualityTier: filterTier ? [filterTier] : undefined,
        consentStatus: filterConsent ?? undefined,
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      })
      const items = (data as BillableUnit[]) ?? []
      const nextOffset = offsetRef.current + items.length
      setUnits(prev => [...prev, ...items])
      setTotalCount(count ?? 0)
      setOffset(nextOffset)
      setHasMore(nextOffset < (count ?? 0))
    } catch (err) {
      console.error('[AdminUnitsPage] loadMore failed:', err)
    }
    setLoadingMore(false)
  }

  async function refreshFromSessions() {
    setSyncing(true)
    try {
      const sessions: Session[] = await loadAllSessions({ skipUserFilter: true })
      const derived = deriveUnitsFromSessions(sessions)
      await upsertBillableUnits(derived)
      // 새로고침 후 첫 페이지 재조회
      const { data, count } = await loadBillableUnitsApi({
        qualityGrade: filterGrade ? [filterGrade as 'A' | 'B' | 'C'] : undefined,
        qualityTier: filterTier ? [filterTier] : undefined,
        consentStatus: filterConsent ?? undefined,
        limit: PAGE_SIZE,
        offset: 0,
      })
      const items = (data as BillableUnit[]) ?? []
      setUnits(items)
      setTotalCount(count ?? 0)
      setHasMore(items.length < (count ?? 0))
      setOffset(items.length)
    } finally {
      setSyncing(false)
    }
  }

  const summary = useMemo(() => summarizeUnits(units), [units])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: '#1337ec' }}>progress_activity</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <UnitSummaryBar summary={summary} />

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        {(['A', 'B', 'C'] as const).map(g => (
          <button
            key={g}
            onClick={() => setFilterGrade(filterGrade === g ? null : g)}
            className="text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              backgroundColor: filterGrade === g ? '#1337ec' : 'rgba(255,255,255,0.06)',
              color: filterGrade === g ? 'white' : 'rgba(255,255,255,0.5)',
            }}
          >
            {g}등급
          </button>
        ))}
        <span className="w-px h-5 self-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        {(['basic', 'verified', 'gold'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterTier(filterTier === t ? null : t)}
            className="text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              backgroundColor: filterTier === t ? '#1337ec' : 'rgba(255,255,255,0.06)',
              color: filterTier === t ? 'white' : 'rgba(255,255,255,0.5)',
            }}
          >
            {t}
          </button>
        ))}
        <span className="w-px h-5 self-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <button
          onClick={() => setFilterConsent(filterConsent === 'PUBLIC_CONSENTED' ? null : 'PUBLIC_CONSENTED')}
          className="text-xs px-2.5 py-1 rounded-full transition-colors"
          style={{
            backgroundColor: filterConsent === 'PUBLIC_CONSENTED' ? '#22c55e' : 'rgba(255,255,255,0.06)',
            color: filterConsent === 'PUBLIC_CONSENTED' ? 'white' : 'rgba(255,255,255,0.5)',
          }}
        >
          동의만
        </button>
      </div>

      {/* 새로고침 */}
      <button
        onClick={refreshFromSessions}
        disabled={syncing}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
      >
        <span className={`material-symbols-outlined text-sm ${syncing ? 'animate-spin' : ''}`}>refresh</span>
        {syncing ? '동기화 중...' : '세션에서 새로고침'}
      </button>

      {/* 유닛 리스트 */}
      <div className="space-y-1">
        {units.map(u => (
          <BillableUnitRow key={u.id} unit={u} />
        ))}
      </div>

      {/* 더 보기 */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {units.length.toLocaleString()}건 표시 중 / 총 {totalCount.toLocaleString()}건
        </span>
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
          >
            {loadingMore
              ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              : '더 보기'}
          </button>
        )}
      </div>
    </div>
  )
}
