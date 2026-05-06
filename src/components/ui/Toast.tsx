// 본 파일은 어댑터다.
//
// 기존 toast 시스템: src/lib/toastContext.tsx (Framer Motion 기반, BottomNav 위 표시)
// 이미 App.tsx 에서 <ToastProvider> 마운트됨. 신규 페이지(STAGE 5)는 succe/error/warning
// 헬퍼를 기대하므로 기존 showToast 를 래핑하여 동일 API 노출.

import { useMemo } from 'react'
import { useToast as useLegacyToast } from '../../lib/toastContext'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

interface ToastApi {
  show: (message: string, tone?: ToastTone, durationMs?: number) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  warning: (message: string, durationMs?: number) => void
}

const ICON_MAP: Record<ToastTone, string> = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  danger: 'error',
}

export function useToast(): ToastApi {
  const { showToast } = useLegacyToast()
  return useMemo<ToastApi>(
    () => ({
      show: (message, tone = 'info', durationMs) =>
        showToast({ message, icon: ICON_MAP[tone], duration: durationMs }),
      success: (message, durationMs) =>
        showToast({ message, icon: ICON_MAP.success, duration: durationMs }),
      error: (message, durationMs) =>
        showToast({ message, icon: ICON_MAP.danger, duration: durationMs }),
      warning: (message, durationMs) =>
        showToast({ message, icon: ICON_MAP.warning, duration: durationMs }),
    }),
    [showToast],
  )
}

// ToastProvider 는 기존 lib/toastContext.tsx 의 것을 사용. 본 파일은 export 하지 않음.
// 신규 코드에서 import 시 기존 마운트된 Provider 가 그대로 동작.
export { ToastProvider } from '../../lib/toastContext'
