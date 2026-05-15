export interface FilterChip {
  id: string
  label: string
  count: number
  warn?: boolean
}

interface FilterChipsProps {
  chips: FilterChip[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function FilterChips({ chips, active, onChange, className = '' }: FilterChipsProps) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} role="toolbar" aria-label="필터">
      {chips.map((chip) => {
        const isActive = chip.id === active
        return (
          <button
            key={chip.id}
            onClick={() => onChange(chip.id)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
              isActive
                ? 'bg-accent text-white'
                : 'bg-surface border border-border text-txt-sub hover:text-txt hover:border-accent'
            }`}
          >
            <span>{chip.label}</span>
            <span
              className={`tabular-nums ${
                isActive ? 'text-white/80' : chip.warn ? 'text-warning font-semibold' : 'text-txt-tertiary'
              }`}
            >
              {chip.count.toLocaleString()}
            </span>
            {chip.warn && !isActive && <span className="text-warning">⚠</span>}
          </button>
        )
      })}
    </div>
  )
}
