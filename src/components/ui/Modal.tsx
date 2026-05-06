import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { labels } from '../../lib/labels'

type Size = 'sm' | 'md' | 'lg' | 'full'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  size?: Size
  children: ReactNode
  footer?: ReactNode
  closeOnBackdrop?: boolean
}

const sizeClass: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  full: 'max-w-[95vw] max-h-[95vh]',
}

export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // ESC 닫기 + body scroll 잠금 + 포커스 트랩 진입
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 포커스 트랩 진입
    const prevActive = document.activeElement as HTMLElement | null
    const dialogEl = dialogRef.current
    if (dialogEl) {
      const focusable = dialogEl.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    }

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevActive?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const modalRoot = typeof document !== 'undefined' ? document.body : null
  if (!modalRoot) return null

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className={`relative bg-surface border border-border rounded-2xl shadow-md w-full ${sizeClass[size]} max-h-[85vh] overflow-hidden flex flex-col`}
      >
        {title && (
          <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
            <h2 id="modal-title" className="text-lg font-semibold text-txt">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-txt-sub hover:text-txt focus:outline-none focus:ring-2 focus:ring-accent rounded p-1"
              aria-label={labels.action.close}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border-light bg-surface-alt flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    modalRoot,
  )
}

// ── ConfirmDialog (위험 액션 전 확인) ──────────────────────────────────────
interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel ?? labels.action.cancel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? labels.action.confirm}
          </Button>
        </>
      }
    >
      <div className="text-sm text-txt-sub">{body}</div>
    </Modal>
  )
}
