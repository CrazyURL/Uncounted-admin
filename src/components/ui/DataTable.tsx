import { type ReactNode } from 'react'
import { SkeletonTableRow } from './Skeleton'
import { EmptyState, EmptyIcon } from './EmptyState'
import { ErrorState } from './ErrorState'
import { labels } from '../../lib/labels'

export interface ColumnDef<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  width?: string  // CSS width (예: '120px', '20%')
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  data: T[] | null
  columns: ColumnDef<T>[]
  rowKey: (row: T) => string | number
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyHint?: string
  onRowClick?: (row: T) => void
  selectable?: boolean
  selectedKeys?: Set<string | number>
  onSelectionChange?: (keys: Set<string | number>) => void
  className?: string
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyHint,
  onRowClick,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  className = '',
}: DataTableProps<T>) {
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />
  }

  if (loading && (!data || data.length === 0)) {
    return (
      <div className={`overflow-x-auto rounded-xl border border-border ${className}`}>
        <table className="w-full">
          <thead className="bg-surface-alt sticky top-0">
            <tr>
              {selectable && <th className="w-10 px-3 py-2"></th>}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-3 py-2 text-${col.align ?? 'left'} text-xs font-semibold text-txt-sub uppercase tracking-wider`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={columns.length + (selectable ? 1 : 0)} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<EmptyIcon />}
        title={emptyTitle ?? labels.empty.search}
        description={emptyHint ?? labels.empty.searchHint}
      />
    )
  }

  const isAllSelected =
    selectable && selectedKeys != null && data.length > 0 && data.every((r) => selectedKeys.has(rowKey(r)))
  const toggleAll = () => {
    if (!onSelectionChange) return
    if (isAllSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(data.map(rowKey)))
    }
  }
  const toggleOne = (key: string | number) => {
    if (!onSelectionChange || !selectedKeys) return
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-surface ${className}`}>
      <table className="w-full">
        <thead className="bg-surface-alt sticky top-0 z-10">
          <tr>
            {selectable && (
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  aria-label="모두 선택"
                  className="rounded border-border text-accent focus:ring-accent"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 py-2.5 text-${col.align ?? 'left'} text-xs font-semibold text-txt-sub uppercase tracking-wider`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {data.map((row) => {
            const key = rowKey(row)
            const selected = selectable && selectedKeys?.has(key)
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-surface-alt' : ''} ${selected ? 'bg-accent-dim/50' : ''} transition-colors`}
              >
                {selectable && (
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggleOne(key)}
                      aria-label="선택"
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-3 text-${col.align ?? 'left'} text-sm text-txt ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
