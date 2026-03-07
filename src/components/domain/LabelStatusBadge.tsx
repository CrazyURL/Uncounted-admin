// ── 자동 라벨 상태 배지 ─────────────────────────────────────────────────
// AUTO(자동) / RECOMMENDED(추천) / REVIEW(검토) / LOCKED(잠금) / CONFIRMED(확정)

type LabelStatusBadgeProps = {
  status: 'AUTO' | 'RECOMMENDED' | 'REVIEW' | 'LOCKED' | 'CONFIRMED' | null
}

const STATUS_CONFIG: Record<string, { icon: string; text: string; accent: boolean }> = {
  AUTO: { icon: 'smart_toy', text: '자동', accent: true },
  RECOMMENDED: { icon: 'recommend', text: '추천', accent: true },
  REVIEW: { icon: 'rate_review', text: '검토', accent: false },
  LOCKED: { icon: 'lock', text: '잠금', accent: false },
  CONFIRMED: { icon: 'check_circle', text: '확정', accent: true },
}

export default function LabelStatusBadge({ status }: LabelStatusBadgeProps) {
  if (!status) return null

  const config = STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        backgroundColor: config.accent ? 'var(--color-accent-dim)' : 'var(--color-muted)',
        color: config.accent ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{config.icon}</span>
      {config.text}
    </span>
  )
}
