// ── RefineryPage — 품질 정제소 ─────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { staggerContainerVariants, fadeSlideVariants } from '../lib/motionTokens'
import { type Session } from '../types/session'
import { loadAllSessions, getCachedSessions } from '../lib/sessionMapper'
import { calcRefineryMetrics } from '../lib/refineryEngine'
import RefineryReportCard from '../components/domain/RefineryReportCard'

export default function RefineryPage() {
  const cached = getCachedSessions()
  const [sessions, setSessions] = useState<Session[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached || cached.length === 0)

  useEffect(() => {
    if (cached && cached.length > 0) return
    loadAllSessions().then((all) => {
      setSessions(all)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-24 gap-4 min-h-full"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <span className="material-symbols-outlined text-4xl animate-spin" style={{ color: 'var(--color-accent)' }}>
          autorenew
        </span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>품질 분석 중...</p>
      </div>
    )
  }

  const refinery = calcRefineryMetrics(sessions)

  const gradeA = sessions.filter((s) => (s.qaScore ?? 0) >= 80).length
  const gradeB = sessions.filter((s) => { const q = s.qaScore ?? 0; return q >= 60 && q < 80 }).length
  const gradeC = sessions.length - gradeA - gradeB

  const avgQa = sessions.length > 0
    ? Math.round(sessions.reduce((s, ss) => s + (ss.qaScore ?? 0), 0) / sessions.length)
    : 0
  const gradeLabel = avgQa >= 80 ? 'A' : avgQa >= 70 ? 'B+' : avgQa >= 60 ? 'B' : 'C'

  const labeledCount = sessions.filter((s) => s.labels !== null).length
  const totalDurationH = Math.round(sessions.reduce((s, ss) => s + ss.duration, 0) / 3600 * 10) / 10

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-full px-4 py-4 flex flex-col gap-4 pb-24"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* 품질 등급 요약 */}
      <motion.div
        variants={fadeSlideVariants}
        className="rounded-2xl p-5 text-center"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          전체 품질 등급
        </p>

        {/* 도넛 + 등급 */}
        <div className="relative w-28 h-28 mx-auto mb-3">
          <GradeDonut a={gradeA} b={gradeB} c={gradeC} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-extrabold text-2xl" style={{ color: 'var(--color-text)' }}>{gradeLabel}</span>
          </div>
        </div>

        {/* A/B/C 범례 */}
        <div className="flex justify-center gap-5">
          <LegendDot color="var(--color-accent)" label="A등급" count={gradeA} />
          <LegendDot color="#B8ACEF" label="B등급" count={gradeB} />
          <LegendDot color="var(--color-text-tertiary)" label="C등급" count={gradeC} />
        </div>
      </motion.div>

      {/* 핵심 지표 그리드 */}
      <motion.div
        variants={fadeSlideVariants}
        className="rounded-2xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="grid grid-cols-2 gap-2">
          <KpiCell label="총 시간" value={`${totalDurationH}h`} />
          <KpiCell
            label="유효 발화"
            value={`${Math.round(refinery.validSpeechRatio * 100)}%`}
            sub={refinery.hasRealMetrics ? '실측' : '추정'}
          />
          <KpiCell
            label="라벨 완성"
            value={`${sessions.length > 0 ? Math.round((labeledCount / sessions.length) * 100) : 0}%`}
            sub={`${labeledCount.toLocaleString()}/${sessions.length.toLocaleString()}건`}
          />
          <KpiCell
            label="평균 QA"
            value={`${avgQa}점`}
            sub={gradeLabel + ' 등급'}
          />
        </div>
      </motion.div>

      {/* 정제소 리포트 (상세 바 + 개선 힌트) */}
      <RefineryReportCard metrics={refinery} sessionCount={sessions.length} />

      {/* 등급 분포 바 */}
      <motion.div
        variants={fadeSlideVariants}
        className="rounded-2xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          등급 분포
        </p>
        <div className="flex flex-col gap-2.5">
          <GradeBar label="A" count={gradeA} total={sessions.length} color="var(--color-accent)" />
          <GradeBar label="B" count={gradeB} total={sessions.length} color="#B8ACEF" />
          <GradeBar label="C" count={gradeC} total={sessions.length} color="#E2E8F0" />
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── 도넛 차트 ────────────────────────────────────────────────────────────────────

function GradeDonut({ a, b, c }: { a: number; b: number; c: number }) {
  const total = a + b + c || 1
  const pA = a / total
  const pB = b / total
  const r = 40
  const cx = 50
  const cy = 50

  function arc(start: number, pct: number): string {
    if (pct <= 0) return ''
    const startAngle = start * 360 - 90
    const endAngle = (start + pct) * 360 - 90
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180)
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180)
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180)
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180)
    const largeArc = pct > 0.5 ? 1 : 0
    return `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2}`
  }

  const segments: { color: string; start: number; pct: number }[] = []
  let cursor = 0
  if (pA > 0.005) { segments.push({ color: '#6B4EE8', start: cursor, pct: pA }); cursor += pA }
  if (pB > 0.005) { segments.push({ color: '#B8ACEF', start: cursor, pct: pB }); cursor += pB }
  const pCActual = 1 - cursor
  if (pCActual > 0.005) { segments.push({ color: '#E2E8F0', start: cursor, pct: pCActual }) }

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0EEFF" strokeWidth="10" />
      {segments.map((seg, i) => (
        <path
          key={i}
          d={arc(seg.start, seg.pct)}
          fill="none"
          stroke={seg.color}
          strokeWidth="10"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

// ── 범례 점 ──────────────────────────────────────────────────────────────────────

function LegendDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>{label}</span>
      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text)' }}>{count}</span>
    </div>
  )
}

// ── KPI 셀 ───────────────────────────────────────────────────────────────────────

function KpiCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
      <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
      <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

// ── 등급 분포 바 ─────────────────────────────────────────────────────────────────

function GradeBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--color-text)' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] w-16 text-right" style={{ color: 'var(--color-text-sub)' }}>
        {count.toLocaleString()}건 ({pct}%)
      </span>
    </div>
  )
}
