import { type Dataset, type DatasetStatus } from '../../types/dataset'

type Props = {
  dataset: Dataset
  sessionCount: number
  totalHours: number
  avgQa: number
  onClick: () => void
  onDelete: (id: string) => void
}

const STATUS_CONFIG: Record<DatasetStatus, { label: string; color: string; bg: string }> = {
  draft: { label: '초안', color: 'var(--color-text-sub)', bg: 'var(--color-border-light)' },
  finalized: { label: '확정', color: 'var(--color-accent)', bg: 'rgba(19,55,236,0.15)' },
  exported: { label: '추출됨', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
}

export default function DatasetCard({ dataset, sessionCount, totalHours, avgQa, onClick, onDelete }: Props) {
  const status = STATUS_CONFIG[dataset.status]

  return (
    <div
      className="rounded-xl p-4 border cursor-pointer transition-colors hover:border-gray-600"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border-light)' }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-2">
          <h3 className="text-sm font-semibold text-txt truncate">{dataset.name}</h3>
          {dataset.description && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {dataset.description}
            </p>
          )}
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{ backgroundColor: status.bg, color: status.color }}
        >
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>세션</p>
          <p className="text-sm font-semibold text-txt">{sessionCount}건</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>총 시간</p>
          <p className="text-sm font-semibold text-txt">{totalHours.toFixed(1)}h</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>평균 품질</p>
          <p className="text-sm font-semibold text-txt">{avgQa}점</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-surface-alt)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {dataset.createdAt.slice(0, 10)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(dataset.id) }}
          className="text-xs flex items-center gap-0.5 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <span className="material-symbols-outlined text-sm">delete</span>
          삭제
        </button>
      </div>
    </div>
  )
}
