import { useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { loadAllSessions, invalidateSessionCache } from '../../lib/sessionMapper'
import {
  LABEL_FIELDS,
  calcLabelCoverage,
  calcFieldValueDistribution,
} from '../../lib/adminHelpers'
import { type LabelFieldKey } from '../../types/dataset'

export default function AdminLabelCatalogPage() {
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    invalidateSessionCache()
    loadAllSessions({ skipUserFilter: true }).then(sessions => {
      setAllSessions(sessions)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminLabelCatalog] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  const coverage = useMemo(() => calcLabelCoverage(allSessions), [allSessions])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <span className="material-symbols-outlined text-4xl mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          label_off
        </span>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          세션이 없습니다
        </p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4 space-y-4">
      {/* 상단 요약 */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="총 세션" value={`${coverage.totalSessions}`} />
        <SummaryCard label="라벨 있음" value={`${coverage.anyLabelCount}`} sub={`${Math.round((coverage.anyLabelCount / coverage.totalSessions) * 100)}%`} />
        <SummaryCard label="완전 라벨" value={`${coverage.fullLabelCount}`} sub={`${Math.round((coverage.fullLabelCount / coverage.totalSessions) * 100)}%`} />
      </div>

      {/* 필드별 카드 */}
      {LABEL_FIELDS.map(fieldMeta => (
        <FieldCard
          key={fieldMeta.key}
          fieldKey={fieldMeta.key}
          fieldLabel={fieldMeta.labelKo}
          options={fieldMeta.options as string[]}
          sessions={allSessions}
          coverage={coverage.fields.find(f => f.field === fieldMeta.key)!}
        />
      ))}
    </motion.div>
  )
}

// ── 요약 카드 ──

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ backgroundColor: '#1b1e2e' }}>
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
      <p className="text-sm font-bold text-white mt-0.5">
        {value}
        {sub && <span className="text-xs font-normal ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
      </p>
    </div>
  )
}

// ── 필드별 분포 카드 ──

function FieldCard({
  fieldKey,
  fieldLabel,
  options,
  sessions,
  coverage,
}: {
  fieldKey: LabelFieldKey
  fieldLabel: string
  options: string[]
  sessions: Session[]
  coverage: { fillRate: number; filledCount: number; totalCount: number }
}) {
  const distribution = useMemo(
    () => calcFieldValueDistribution(sessions, fieldKey),
    [sessions, fieldKey],
  )

  const distMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of distribution) m.set(d.value, d.count)
    return m
  }, [distribution])

  const maxCount = Math.max(...distribution.map(d => d.count), 1)
  const fillPct = Math.round(coverage.fillRate * 100)
  const fillColor = fillPct >= 80 ? '#22c55e' : fillPct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{fieldLabel}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${fillColor}15`, color: fillColor }}>
            {fillPct}%
          </span>
        </div>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {coverage.filledCount}/{coverage.totalCount}건
        </span>
      </div>

      <div className="space-y-1.5">
        {options.map(opt => {
          const count = distMap.get(opt) ?? 0
          const barPct = maxCount > 0 ? (count / maxCount) * 100 : 0
          return (
            <div key={opt} className="flex items-center gap-2">
              <span className="text-[11px] w-16 text-right truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {opt}
              </span>
              <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: count > 0 ? '#1337ec' : 'transparent',
                    minWidth: count > 0 ? '2px' : '0',
                  }}
                />
              </div>
              <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: count > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }}>
                {count}
              </span>
            </div>
          )
        })}

        {/* OPTIONS에 없는 값(레거시/기타)이 있으면 표시 */}
        {distribution
          .filter(d => !options.includes(d.value))
          .map(d => (
            <div key={d.value} className="flex items-center gap-2">
              <span className="text-[11px] w-16 text-right truncate italic" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {d.value}
              </span>
              <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(d.count / maxCount) * 100}%`, backgroundColor: 'rgba(255,255,255,0.2)', minWidth: '2px' }}
                />
              </div>
              <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {d.count}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}
