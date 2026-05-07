import { type ReactNode } from 'react'
import { Button } from './Button'
import { labels } from '../../lib/labels'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
  children?: ReactNode
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
  className = '',
  children,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center py-10 px-4 ${className}`}
    >
      <div className="text-danger mb-4" aria-hidden="true">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-txt">
        {title ?? labels.error.fetchFailed}
      </h3>
      {message && <p className="mt-2 text-sm text-txt-sub max-w-md break-words">{message}</p>}
      {children}
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel ?? labels.action.retry}
          </Button>
        </div>
      )}
    </div>
  )
}

// 인라인 에러 박스 (전체 화면 차지하지 않음)
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="bg-danger-dim border border-danger/20 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 text-danger">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="text-sm font-medium">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-danger hover:underline focus:outline-none focus:underline"
        >
          {labels.action.retry}
        </button>
      )}
    </div>
  )
}
