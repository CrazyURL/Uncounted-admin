import { useEffect, useState, useMemo, useRef } from 'react'
import { type BillableUnit } from '../../types/admin'
import { loadBillableUnits } from '../../lib/adminStore'
import { summarizeUnits } from '../../lib/billableUnitEngine'

export default function AdminConsentsPage() {
  const [units, setUnits] = useState<BillableUnit[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    loadBillableUnits().then(u => { setUnits(u); setLoading(false) })
  }, [])

  const summary = useMemo(() => summarizeUnits(units), [units])

  const consented = units.filter(u => u.consentStatus === 'PUBLIC_CONSENTED')
  const private_ = units.filter(u => u.consentStatus === 'PRIVATE')
  const consentRate = summary.total > 0 ? Math.round((summary.byConsent.consented / summary.total) * 100) : 0

  // 유저별 그룹
  const byUser = useMemo(() => {
    const map = new Map<string, { consented: number; private_: number; total: number }>()
    for (const u of units) {
      const uid = u.userId ?? '(unknown)'
      const entry = map.get(uid) ?? { consented: 0, private_: 0, total: 0 }
      entry.total++
      if (u.consentStatus === 'PUBLIC_CONSENTED') entry.consented++
      else entry.private_++
      map.set(uid, entry)
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [units])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: '#1337ec' }}>progress_activity</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '동의 유닛', value: consented.length.toLocaleString(), color: '#22c55e' },
          { label: '비동의', value: private_.length.toLocaleString(), color: '#ef4444' },
          { label: '동의율', value: `${consentRate}%`, color: '#1337ec' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* 유저별 */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
          사용자별 동의 현황
        </p>
        <div className="space-y-1">
          {byUser.map(([uid, data]) => {
            const rate = data.total > 0 ? Math.round((data.consented / data.total) * 100) : 0
            return (
              <div
                key={uid}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#1b1e2e' }}
              >
                <span className="text-xs text-white flex-1 truncate">{uid.slice(0, 12)}</span>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {data.total}유닛
                </span>
                <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${rate}%`, backgroundColor: '#22c55e' }} />
                </div>
                <span className="text-[10px] w-8 text-right" style={{ color: rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>
                  {rate}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
