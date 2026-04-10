interface MetadataDistributionChartProps {
  title: string
  distribution: Record<string, number>
}

const BAR_COLORS = [
  '#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed',
  '#6d28d9', '#5b21b6', '#ddd6fe', '#ede9fe',
]

export default function MetadataDistributionChart({
  title,
  distribution,
}: MetadataDistributionChartProps) {
  const entries = Object.entries(distribution).sort(([, a], [, b]) => b - a)
  const maxValue = Math.max(...entries.map(([, v]) => v), 1)

  if (entries.length === 0) {
    return (
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
        <h3 className="text-xs font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {title}
        </h3>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>데이터 없음</p>
      </div>
    )
  }

  const total = entries.reduce((sum, [, v]) => sum + v, 0)

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {title}
      </h3>

      <div className="space-y-2">
        {entries.map(([label, count], idx) => {
          const pct = Math.round((count / total) * 100)
          const widthPct = Math.max((count / maxValue) * 100, 2)
          const color = BAR_COLORS[idx % BAR_COLORS.length]

          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {label}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {count.toLocaleString()} ({pct}%)
                </span>
              </div>
              <div
                className="h-2 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
