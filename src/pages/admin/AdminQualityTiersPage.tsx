import { useEffect, useState, useMemo, useRef } from 'react'
import { type BillableUnit } from '../../types/admin'
import { loadBillableUnits } from '../../lib/adminStore'

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' }
const GRADE_THRESHOLDS = [
  { grade: 'A', min: 80, desc: 'QA 80점 이상' },
  { grade: 'B', min: 60, desc: 'QA 60~79점' },
  { grade: 'C', min: 0, desc: 'QA 60점 미만' },
]

export default function AdminQualityTiersPage() {
  const [units, setUnits] = useState<BillableUnit[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    loadBillableUnits().then(u => { setUnits(u); setLoading(false) })
  }, [])

  const gradeStats = useMemo(() => {
    const stats: Record<string, { count: number; hours: number; consentRate: number; labelRate: number }> = {}
    for (const g of ['A', 'B', 'C']) {
      const filtered = units.filter(u => u.qualityGrade === g)
      const consented = filtered.filter(u => u.consentStatus === 'PUBLIC_CONSENTED').length
      const labeled = filtered.filter(u => u.hasLabels).length
      stats[g] = {
        count: filtered.length,
        hours: Math.round(filtered.reduce((sum, u) => sum + u.effectiveSeconds / 3600, 0) * 100) / 100,
        consentRate: filtered.length > 0 ? Math.round((consented / filtered.length) * 100) : 0,
        labelRate: filtered.length > 0 ? Math.round((labeled / filtered.length) * 100) : 0,
      }
    }
    return stats
  }, [units])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: '#1337ec' }}>progress_activity</span>
      </div>
    )
  }

  const total = units.length

  return (
    <div className="p-4 space-y-4">
      {/* 분포 바 */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
        <p className="text-xs font-medium text-white mb-3">품질 등급 분포</p>
        <div className="flex h-6 rounded-lg overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          {(['A', 'B', 'C'] as const).map(g => {
            const pct = total > 0 ? (gradeStats[g].count / total) * 100 : 0
            if (pct === 0) return null
            return (
              <div
                key={g}
                className="flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${pct}%`, backgroundColor: GRADE_COLORS[g] }}
              >
                {pct >= 8 ? `${g} ${Math.round(pct)}%` : ''}
              </div>
            )
          })}
        </div>
      </div>

      {/* 등급별 상세 카드 */}
      {(['A', 'B', 'C'] as const).map(g => {
        const s = gradeStats[g]
        const threshold = GRADE_THRESHOLDS.find(t => t.grade === g)!
        return (
          <div key={g} className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-sm font-bold w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ backgroundColor: `${GRADE_COLORS[g]}20`, color: GRADE_COLORS[g] }}
              >
                {g}
              </span>
              <div>
                <p className="text-sm font-medium text-white">{threshold.desc}</p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {s.count.toLocaleString()}개 유닛 · {s.hours}시간
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>동의율</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${s.consentRate}%`, backgroundColor: '#22c55e' }} />
                  </div>
                  <span className="text-xs text-white">{s.consentRate}%</span>
                </div>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>라벨률</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${s.labelRate}%`, backgroundColor: '#1337ec' }} />
                  </div>
                  <span className="text-xs text-white">{s.labelRate}%</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
