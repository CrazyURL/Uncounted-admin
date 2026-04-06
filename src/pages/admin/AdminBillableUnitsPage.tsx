import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { type Session } from '../../types/session'
import { type BillableUnit } from '../../types/admin'
import { loadAllSessions } from '../../lib/sessionMapper'
import { deriveUnitsFromSessions, summarizeUnits } from '../../lib/billableUnitEngine'
import { upsertBillableUnits, bulkUpdateLabels } from '../../lib/adminStore'
import { loadBillableUnitsApi } from '../../lib/api/admin'
import UnitSummaryBar from '../../components/domain/UnitSummaryBar'
import BillableUnitRow from '../../components/domain/BillableUnitRow'
import BulkLabelEditor from '../../components/domain/BulkLabelEditor'

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
  const [labelingSessionId, setLabelingSessionId] = useState<string | null>(null)

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

  // Group units by sessionId for bulk labeling
  const sessionGroups = useMemo(() => {
    const groups = new Map<string, BillableUnit[]>()
    for (const u of units) {
      const existing = groups.get(u.sessionId)
      if (existing) {
        existing.push(u)
      } else {
        groups.set(u.sessionId, [u])
      }
    }
    return groups
  }, [units])

  const handleBulkLabelSave = useCallback(async (
    sessionId: string,
    labels: { relationship: string | null; purpose: string | null; domain: string | null; tone: string | null; noise: string | null },
  ) => {
    const sessionUnits = sessionGroups.get(sessionId)
    if (!sessionUnits?.length) return
    const unitIds = sessionUnits.map(u => u.id)
    await bulkUpdateLabels(unitIds, labels)
    setLabelingSessionId(null)
  }, [sessionGroups])

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

      {/* 유닛 리스트 (세션별 그룹) */}
      <div className="space-y-3">
        {[...sessionGroups.entries()].map(([sessionId, groupUnits]) => (
          <div key={sessionId}>
            {/* 세션 그룹 헤더 */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {sessionId.slice(0, 8)}... ({groupUnits.length}건)
              </span>
              <button
                onClick={() => setLabelingSessionId(labelingSessionId === sessionId ? null : sessionId)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors"
                style={{
                  backgroundColor: labelingSessionId === sessionId ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                  color: labelingSessionId === sessionId ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>label</span>
                라벨링
              </button>
            </div>
            {/* BulkLabelEditor */}
            {labelingSessionId === sessionId && (
              <BulkLabelEditor
                sessionId={sessionId}
                audioUrl={groupUnits[0]?.sessionId ? `${groupUnits[0].userId ?? ''}/${groupUnits[0].sessionId}.wav` : null}
                units={groupUnits}
                onSave={handleBulkLabelSave}
                onClose={() => setLabelingSessionId(null)}
              />
            )}
            {/* BU 행들 */}
            <div className="space-y-1">
              {groupUnits.map(u => (
                <BillableUnitRow key={u.id} unit={u} />
              ))}
            </div>
          </div>
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
