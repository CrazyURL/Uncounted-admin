export interface BigStatProps {
  title: string
  value: string
  sub?: string
  onClick?: () => void
  tone?: 'warning' | 'danger'
}

export function BigStat({ title, value, sub, onClick, tone }: BigStatProps) {
  const Wrapper = onClick ? 'button' : 'div'
  const valueClass =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-txt'
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left bg-surface border border-border rounded-xl p-5 ${
        onClick
          ? 'hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-accent transition-colors cursor-pointer'
          : ''
      }`}
    >
      <div className="text-sm text-txt-sub">{title}</div>
      <div className={`mt-2 text-3xl font-bold ${valueClass} tabular-nums`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-txt-tertiary">{sub}</div>}
    </Wrapper>
  )
}
