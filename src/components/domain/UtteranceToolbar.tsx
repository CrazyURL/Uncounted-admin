import { type FilterMode, type SortField, type SortOrder, type ViewMode } from '../../types/export'

interface UtteranceToolbarProps {
  filterMode: FilterMode
  setFilterMode: (mode: FilterMode) => void
  sortField: SortField
  setSortField: (field: SortField) => void
  sortOrder: SortOrder
  setSortOrder: (order: SortOrder) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  counts: Record<FilterMode, number>
  reviewedCount: number
  totalCount: number
  autoFilter: (type: 'short' | 'gradeC' | 'highBeep') => Promise<void>
  onSelectAll: () => void
  onBulkExclude: () => void
  onBulkInclude: () => void
  selectedCount: number
}

const FILTER_TABS: Array<{ id: FilterMode; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'included', label: '포함' },
  { id: 'excluded', label: '제외' },
  { id: 'unreviewed', label: '미검토' },
  { id: 'pii_needed', label: 'PII 미적용' },
  { id: 'no_labels', label: '라벨 없음' },
]

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'chunk', label: '청크순' },
  { value: 'duration', label: '길이순' },
  { value: 'snr', label: 'SNR순' },
  { value: 'beep', label: 'Beep%순' },
  { value: 'grade', label: '등급순' },
]

export function UtteranceToolbar({
  filterMode,
  setFilterMode,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  viewMode,
  setViewMode,
  counts,
  reviewedCount,
  totalCount,
  autoFilter,
  onSelectAll,
  onBulkExclude,
  onBulkInclude,
  selectedCount,
}: UtteranceToolbarProps) {
  const progress = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col gap-3 rounded-xl p-4" style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Row 1: Progress + Auto Filters + View Mode */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          {/* Progress bar */}
          <div className="flex flex-col gap-1 flex-1 max-w-xs">
            <div className="flex justify-between text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span>검수 진행률 ({reviewedCount}/{totalCount})</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? '#22c55e' : '#8b5cf6',
                }}
              />
            </div>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />

          {/* Auto Filters */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>자동 필터:</span>
            <button
              onClick={() => autoFilter('short')}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              3초 미만 제외
            </button>
            <button
              onClick={() => autoFilter('gradeC')}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}
            >
              C등급 제외
            </button>
            <button
              onClick={() => autoFilter('highBeep')}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.2)' }}
            >
              Beep 30%+ 제외
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex rounded-lg overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setViewMode('card')}
            className="text-[11px] px-3 py-1.5 transition-colors"
            style={{
              backgroundColor: viewMode === 'card' ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: viewMode === 'card' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
            }}
          >
            카드뷰
          </button>
          <button
            onClick={() => setViewMode('table')}
            className="text-[11px] px-3 py-1.5 transition-colors"
            style={{
              backgroundColor: viewMode === 'table' ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: viewMode === 'table' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
            }}
          >
            테이블뷰
          </button>
        </div>
      </div>

      {/* Row 2: Filter Tabs + Sort */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-1.5">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id)}
              className="text-[11px] px-3 py-1.5 rounded-lg transition-all"
              style={{
                backgroundColor: filterMode === tab.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: filterMode === tab.id ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                border: filterMode === tab.id ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {tab.label}
              <span
                className="ml-1 text-[10px]"
                style={{ color: filterMode === tab.id ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.3)' }}
              >
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>정렬:</span>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="text-[11px] px-2 py-1 rounded-lg outline-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            title={sortOrder === 'asc' ? '오름차순' : '내림차순'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Row 3: Bulk Actions */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={onSelectAll}
            className="text-[11px] font-medium transition-colors"
            style={{ color: '#a78bfa' }}
          >
            이 목록 전체 선택
          </button>
          <span className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>{selectedCount}</span>개 선택됨
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onBulkInclude}
            disabled={selectedCount === 0}
            className="text-[11px] px-3 py-1 rounded-lg transition-colors disabled:opacity-30"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            선택 발화 포함
          </button>
          <button
            onClick={onBulkExclude}
            disabled={selectedCount === 0}
            className="text-[11px] px-3 py-1 rounded-lg transition-colors disabled:opacity-30"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            선택 발화 제외
          </button>
        </div>
      </div>
    </div>
  )
}
