import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DURATION, EASE } from './motionTokens'

type ToastOptions = {
  message: string
  duration?: number   // ms, 기본 3000
  icon?: string       // material symbol name
}

type ToastContextType = {
  showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

const toastVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.medium, ease: EASE.decelerate },
  },
  exit: {
    opacity: 0,
    y: 12,
    transition: { duration: DURATION.short, ease: EASE.accelerate },
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = useCallback((options: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const id = ++idRef.current
    setCurrent({ ...options, id })
    const ms = Math.max(800, options.duration ?? 3000)
    timerRef.current = setTimeout(() => setCurrent(null), ms)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast portal — BottomNav 위 */}
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            variants={toastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed left-4 right-4 z-50 rounded-xl px-4 py-3 flex items-center gap-2"
            style={{
              bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {current.icon && (
              <span
                className="material-symbols-outlined text-lg flex-shrink-0"
                style={{ color: 'var(--color-accent)' }}
              >
                {current.icon}
              </span>
            )}
            <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
              {current.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  )
}
