// ── BatchApplyProgress — 일괄 적용 진행 UI ────────────────────────────────────

type Props = {
  done: number
  total: number
  failed: number
  skipped?: number
  onCancel: () => void
  onClose: () => void
}

export default function BatchApplyProgress({ done, total, failed, skipped = 0, onCancel, onClose }: Props) {
  const isComplete = done >= total && total > 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const updated = done - failed

  return (
    <div
      className="mx-4 mb-4 rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {!isComplete ? (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-sub)' }}>일괄 적용 중...</p>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {done.toLocaleString()} / {total.toLocaleString()}개
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full mb-3"
            style={{ backgroundColor: 'var(--color-muted)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }}
            />
          </div>

          <button
            onClick={onCancel}
            className="text-xs"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            중단
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>
              check_circle
            </span>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-sub)' }}>일괄 적용 완료</p>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
            {updated.toLocaleString()}개 적용
            {skipped > 0 ? ` · ${skipped.toLocaleString()}개 건너뜀` : ''}
            {failed > 0 ? ` · ${failed.toLocaleString()}개 실패` : ''}
          </p>
          <button
            onClick={onClose}
            className="text-xs font-semibold"
            style={{ color: 'var(--color-accent)' }}
          >
            닫기
          </button>
        </>
      )}
    </div>
  )
}
