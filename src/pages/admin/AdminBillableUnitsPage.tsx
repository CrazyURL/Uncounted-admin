import { useEffect, useState, useMemo, useRef } from 'react'
import { type Session } from '../../types/session'
import { type BillableUnit } from '../../types/admin'
import { loadAllSessions } from '../../lib/sessionMapper'
import { deriveUnitsFromSessions, summarizeUnits } from '../../lib/billableUnitEngine'
import { upsertBillableUnits, loadBillableUnits } from '../../lib/adminStore'
import UnitSummaryBar from '../../components/domain/UnitSummaryBar'
import BillableUnitRow from '../../components/domain/BillableUnitRow'

export default function AdminBillableUnitsPage() {
  const [units, setUnits] = useState<BillableUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filterGrade, setFilterGrade] = useState<string | null>(null)
  const [filterConsent, setFilterConsent] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    loadBillableUnits().then(loaded => {
      if (loaded.length > 0) {
        setUnits(loaded)
        setLoading(false)
      } else {
        // Supabase에 BU가 없으면 세션에서 자동 파생
        refreshFromSessions()
      }
    })
  }, [])

  async function refreshFromSessions() {
    setSyncing(true)
    try {
      const sessions: Session[] = await loadAllSessions({ skipUserFilter: true })
      const derived = deriveUnitsFromSessions(sessions)
      await upsertBillableUnits(derived)
      setUnits(derived)
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = units
    if (filterGrade) result = result.filter(u => u.qualityGrade === filterGrade)
    if (filterConsent) result = result.filter(u => u.consentStatus === filterConsent)
    if (filterTier) result = result.filter(u => u.qualityTier === filterTier)
    return result
  }, [units, filterGrade, filterConsent, filterTier])

  const summary = useMemo(() => summarizeUnits(filtered), [filtered])

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
        {/* 등급 필터 */}
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
        {/* 티어 필터 */}
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
        {/* 동의 필터 */}
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
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {filtered.length.toLocaleString()}개 유닛
        </p>
        {filtered.slice(0, 200).map(u => (
          <BillableUnitRow key={u.id} unit={u} />
        ))}
        {filtered.length > 200 && (
          <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
            상위 200건 표시 중 (총 {filtered.length.toLocaleString()}건)
          </p>
        )}
      </div>
    </div>
  )
}
