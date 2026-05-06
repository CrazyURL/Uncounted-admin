import { type ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}
      role="status"
    >
      {icon && (
        <div className="mb-4 text-txt-tertiary opacity-60" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-txt">{title}</h3>
      {description && <p className="mt-2 text-sm text-txt-sub max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

// 기본 빈 상태 아이콘 (선택적 사용)
export function EmptyIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  )
}
