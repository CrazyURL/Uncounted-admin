import { useState } from 'react'

export interface FilterChip {
  id: string
  label: string
  count?: number
  warn?: boolean
  /**
   * 기본 노출 칩(전체·미검수·저품질 등 운영에서 늘 보는 것).
   * 미지정 칩은 '상세 필터' 아래로 접힌다. 어느 칩도 primary 가 없으면
   * 전부 노출(기존 동작 유지) — 다른 화면 호환용.
   */
  primary?: boolean
}

interface FilterChipsProps {
  chips: FilterChip[]
  active: string
  onChange: (id: string) => void
  className?: string
}

function ChipButton({
  chip,
  isActive,
  onChange,
}: {
  chip: FilterChip
  isActive: boolean
  onChange: (id: string) => void
}) {
  return (
    <button
      onClick={() => onChange(chip.id)}
      aria-pressed={isActive}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
        isActive
          ? 'bg-accent text-white'
          : 'bg-surface border border-border text-txt-sub hover:text-txt hover:border-accent'
      }`}
    >
      <span>{chip.label}</span>
      {chip.count !== undefined && (
        <span
          className={`tabular-nums ${
            isActive ? 'text-white/80' : chip.warn ? 'text-warning font-semibold' : 'text-txt-tertiary'
          }`}
        >
          {chip.count.toLocaleString()}
        </span>
      )}
      {chip.warn && !isActive && <span className="text-warning">⚠</span>}
    </button>
  )
}

export function FilterChips({ chips, active, onChange, className = '' }: FilterChipsProps) {
  const hasPrimary = chips.some((c) => c.primary)
  const primaryChips = hasPrimary ? chips.filter((c) => c.primary) : chips
  const moreChips = hasPrimary ? chips.filter((c) => !c.primary) : []
  const activeInMore = moreChips.some((c) => c.id === active)

  const [expanded, setExpanded] = useState(false)
  // 접힌 상세에 들어 있는 필터가 활성화되면 강제로 펼쳐 활성 칩을 항상 보이게 한다.
  const showMore = expanded || activeInMore

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} role="toolbar" aria-label="필터">
      {primaryChips.map((chip) => (
        <ChipButton key={chip.id} chip={chip} isActive={chip.id === active} onChange={onChange} />
      ))}

      {moreChips.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={showMore}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-txt-sub hover:text-txt focus:outline-none focus:ring-2 focus:ring-accent"
          >
            상세 필터 <span aria-hidden="true">{showMore ? '▴' : '▾'}</span>
          </button>
          {showMore &&
            moreChips.map((chip) => (
              <ChipButton key={chip.id} chip={chip} isActive={chip.id === active} onChange={onChange} />
            ))}
        </>
      )}
    </div>
  )
}
