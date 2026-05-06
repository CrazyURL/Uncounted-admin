import { type HTMLAttributes } from 'react'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'rect' | 'circle' | 'text'
  width?: number | string
  height?: number | string
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  const shape =
    variant === 'circle' ? 'rounded-full' :
    variant === 'text'   ? 'rounded-md h-4' :
                           'rounded-lg'
  const cls = `bg-muted animate-pulse ${shape} ${className}`
  const dim: Record<string, unknown> = { ...style }
  if (width != null) dim.width = typeof width === 'number' ? `${width}px` : width
  if (height != null) dim.height = typeof height === 'number' ? `${height}px` : height
  return <div className={cls} style={dim as React.CSSProperties} aria-hidden="true" {...rest} />
}

// 자주 쓰이는 패턴 — 테이블 행 스켈레톤
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-border-light">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <Skeleton variant="text" width="80%" />
        </td>
      ))}
    </tr>
  )
}

// 자주 쓰이는 패턴 — 카드 스켈레톤
export function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
    </div>
  )
}
