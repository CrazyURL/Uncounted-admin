// 통화 단위 페이지네이션 바
//
// AdminUtterancesPage 트리에서 사용. 클라이언트 사이드 슬라이싱.

import { Button, Card, type SelectOption } from '../ui'

interface SessionPaginationBarProps {
  page: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (p: number) => void
  onPageSizeChange: (n: number) => void
}

const PAGE_SIZE_OPTIONS: SelectOption[] = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '30', label: '30개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
]

export function SessionPaginationBar({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: SessionPaginationBarProps) {
  const startIdx = (page - 1) * pageSize + 1
  const endIdx = Math.min(page * pageSize, totalItems)
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-txt-sub">
            {totalItems > 0 ? (
              <>
                <span className="font-semibold text-txt">{startIdx.toLocaleString('ko-KR')}</span>–
                <span className="font-semibold text-txt">{endIdx.toLocaleString('ko-KR')}</span> /{' '}
                {totalItems.toLocaleString('ko-KR')}통화
              </>
            ) : (
              <>0통화</>
            )}
          </span>
          <select
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10) || 20)}
            className="ml-2 text-xs px-2 py-1 rounded border border-border-light bg-surface text-txt cursor-pointer hover:bg-bg-hover"
          >
            {PAGE_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(1)}>
            처음
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            이전
          </Button>
          <span className="px-3 text-xs text-txt tabular-nums">
            <span className="font-semibold">{page}</span> / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            다음
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            끝
          </Button>
        </div>
      </div>
    </Card>
  )
}
