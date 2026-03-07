import { useEffect } from 'react'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import routes from './routes'
import { applyTheme, loadThemeMode } from '../lib/theme'
import { AuthProvider } from '../lib/AuthContext'
import { ToastProvider } from '../lib/toastContext'
import { installGlobalErrorHandler, flushErrorLog } from '../lib/errorLogger'
import { flushFunnelEvents } from '../lib/funnelLogger'
import { onNetworkChange } from '../lib/network'

function AppRoutes() {
  return useRoutes(routes)
}

function ThemeInitializer() {
  useEffect(() => {
    applyTheme(loadThemeMode())
  }, [])
  return null
}

function ErrorLoggerInit() {
  useEffect(() => {
    installGlobalErrorHandler()
    // 네트워크 복구 시 미전송 에러 로그 + 퍼널 이벤트 플러시
    const unsub = onNetworkChange((online) => {
      if (online) {
        flushErrorLog().catch(() => {})
        flushFunnelEvents().catch(() => {})
      }
    })
    return unsub
  }, [])
  return null
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <ErrorLoggerInit />
            <ThemeInitializer />
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  )
}
