import { type BillableUnitSummary } from '../../lib/billableUnitEngine'

type Props = { summary: BillableUnitSummary }

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' }

export default function UnitSummaryBar({ summary }: Props) {
  const cards = [
    { label: '총 유닛', value: summary.total.toLocaleString(), icon: 'grid_view' },
    { label: '사용 가능', value: summary.available.toLocaleString(), icon: 'check_circle', color: '#22c55e' },
    { label: '잠금', value: summary.locked.toLocaleString(), icon: 'lock', color: '#f59e0b' },
    { label: '납품 완료', value: summary.delivered.toLocaleString(), icon: 'local_shipping', color: 'var(--color-accent)' },
  ]

  return (
    <div className="space-y-3">
      {/* 상단 카드 */}
      <div className="grid grid-cols-4 gap-2">
        {cards.map(c => (
          <div
            key={c.label}
            className="rounded-xl p-3 text-center"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <span className="material-symbols-outlined text-lg mb-1 block" style={{ color: c.color ?? 'var(--color-accent)' }}>
              {c.icon}
            </span>
            <p className="text-base font-bold text-txt">{c.value}</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* 등급 분포 미니바 */}
      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p className="text-[10px] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>등급 분포</p>
        <div className="flex h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
          {(['A', 'B', 'C'] as const).map(g => {
            const pct = summary.total > 0 ? (summary.byGrade[g] / summary.total) * 100 : 0
            if (pct === 0) return null
            return (
              <div
                key={g}
                style={{ width: `${pct}%`, backgroundColor: GRADE_COLORS[g] }}
              />
            )
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {(['A', 'B', 'C'] as const).map(g => (
            <span key={g} className="text-[10px]" style={{ color: GRADE_COLORS[g] }}>
              {g}: {summary.byGrade[g].toLocaleString()}
            </span>
          ))}
        </div>
      </div>

      {/* 티어 + 동의 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-[10px] mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>품질 티어</p>
          {(['basic', 'verified', 'gold'] as const).map(t => (
            <div key={t} className="flex justify-between text-xs">
              <span style={{ color: 'var(--color-text-sub)' }}>{t}</span>
              <span className="text-txt">{summary.byTier[t].toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-[10px] mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>공개 동의</p>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--color-text-sub)' }}>동의</span>
            <span className="text-txt">{summary.byConsent.consented.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--color-text-sub)' }}>비동의</span>
            <span className="text-txt">{summary.byConsent.private.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span style={{ color: 'var(--color-text-sub)' }}>유효 시간</span>
            <span className="text-txt">{summary.totalEffectiveHours}h</span>
          </div>
        </div>
      </div>
    </div>
  )
}
