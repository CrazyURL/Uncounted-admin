// /admin/calls 3그룹 필터 바.
//   Group A 처리현황(process, 단일선택 radio) · 처리오류=독립 danger 칩
//   Group B 검수현황(review, 단일선택 radio)
//   Group C 데이터 특이사항(flags, 다중선택 checkbox)
// 상태는 URL 파생(AdminInventoryPage). 본 컴포넌트는 표시 + 콜백만.
import type {
  FilterGroups,
  FilterOption,
  FilterState,
  ProcessStatus,
  ReviewFilter,
  FlagId,
} from '../../lib/adminFilters'

interface Props {
  groups: FilterGroups
  state: FilterState
  onProcessChange: (v?: ProcessStatus) => void
  onReviewChange: (v?: ReviewFilter) => void
  onToggleFlag: (f: FlagId) => void
  className?: string
}

function Count({ value, active, warn }: { value?: number; active: boolean; warn?: boolean }) {
  if (value === undefined) return null
  return (
    <span
      className={`tabular-nums ${active ? 'text-white/80' : warn ? 'text-warning font-semibold' : 'text-txt-tertiary'}`}
    >
      {value.toLocaleString()}
    </span>
  )
}

// 단일선택(radio) 칩 — Group A/B
function RadioChip({ opt, active, onSelect }: { opt: FilterOption; active: boolean; onSelect: () => void }) {
  const base =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent'
  const tone = opt.danger
    ? active
      ? 'bg-danger text-white'
      : 'bg-surface border border-danger text-danger hover:bg-danger/10'
    : active
      ? 'bg-accent text-white'
      : 'bg-surface border border-border text-txt-sub hover:text-txt hover:border-accent'
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onSelect} className={`${base} ${tone}`}>
      <span>{opt.label}</span>
      <Count value={opt.count} active={active} warn={opt.warn || opt.danger} />
    </button>
  )
}

// 다중선택(checkbox) 칩 — Group C
function CheckChip({ opt, checked, onToggle }: { opt: FilterOption; checked: boolean; onToggle: () => void }) {
  const base =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent'
  const tone = checked
    ? 'bg-accent text-white'
    : 'bg-surface border border-border text-txt-sub hover:text-txt hover:border-accent'
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className={`${base} ${tone}`}>
      <span aria-hidden className="text-xs">{checked ? '☑' : '☐'}</span>
      <span>{opt.label}</span>
      <Count value={opt.count} active={checked} warn={opt.warn} />
      {opt.warn && !checked && <span className="text-warning">⚠</span>}
    </button>
  )
}

function GroupRow({ label, children, role }: { label: string; children: React.ReactNode; role: 'radiogroup' | 'group' }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs font-semibold text-txt-tertiary shrink-0 sm:w-24">{label}</span>
      <div role={role} aria-label={label} className="flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  )
}

export function ReviewQueueFilterBar({
  groups,
  state,
  onProcessChange,
  onReviewChange,
  onToggleFlag,
  className = '',
}: Props) {
  const processActive = state.process ?? 'all'
  const reviewActive = state.review ?? 'all'
  // 처리오류(danger)는 라디오 그룹에서 시각 분리 — 나머지 처리현황 뒤에 구분선과 함께 렌더.
  const processMain = groups.process.filter((o) => !o.danger)
  const processDanger = groups.process.filter((o) => o.danger)

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <GroupRow label="처리현황" role="radiogroup">
        {processMain.map((opt) => (
          <RadioChip
            key={opt.id}
            opt={opt}
            active={processActive === opt.id}
            onSelect={() => onProcessChange(opt.id === 'all' ? undefined : (opt.id as ProcessStatus))}
          />
        ))}
        {processDanger.length > 0 && <span aria-hidden className="hidden sm:block w-px h-5 bg-border" />}
        {processDanger.map((opt) => (
          <RadioChip
            key={opt.id}
            opt={opt}
            active={processActive === opt.id}
            onSelect={() => onProcessChange(opt.id as ProcessStatus)}
          />
        ))}
      </GroupRow>

      <GroupRow label="검수현황" role="radiogroup">
        {groups.review.map((opt) => (
          <RadioChip
            key={opt.id}
            opt={opt}
            active={reviewActive === opt.id}
            onSelect={() => onReviewChange(opt.id === 'all' ? undefined : (opt.id as ReviewFilter))}
          />
        ))}
      </GroupRow>

      <GroupRow label="데이터 특이사항" role="group">
        {groups.flags.map((opt) => (
          <CheckChip
            key={opt.id}
            opt={opt}
            checked={state.flags.includes(opt.id as FlagId)}
            onToggle={() => onToggleFlag(opt.id as FlagId)}
          />
        ))}
      </GroupRow>
    </div>
  )
}
