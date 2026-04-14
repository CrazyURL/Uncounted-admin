import type { ReactNode } from 'react'

interface LoadingOverlayProps {
  isVisible: boolean
  message?: string
  children?: ReactNode
}

export default function LoadingOverlay({
  isVisible,
  message = '처리 중입니다...',
  children,
}: LoadingOverlayProps) {
  if (!isVisible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={message}
      aria-live="assertive"
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 200 }}
    >
      <div
        className="rounded-2xl px-8 py-6 flex flex-col items-center gap-4"
        style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(255,255,255,0.08)', minWidth: 200 }}
      >
        <span
          className="material-symbols-outlined text-4xl animate-spin"
          style={{ color: '#8b5cf6' }}
        >
          progress_activity
        </span>
        <p className="text-sm font-medium text-white">{message}</p>
        {children}
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          잠시만 기다려주세요
        </p>
      </div>
    </div>
  )
}
