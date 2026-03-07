// ── 에러 로거 — 로컬 큐 + 백엔드 API 전송 ──────────────────────────────────────
// 파일럿 20명 환경에서 원격 에러 추적용.
// localStorage 큐에 저장 후, 네트워크 연결 시 백엔드 API로 전송.

import { getEffectiveUserId } from './auth'
import { isOnline } from './network'
import { generateUUID } from './uuid'

type ErrorEntry = {
  id: string
  timestamp: string
  level: 'error' | 'warn'
  message: string
  stack?: string
  context?: string        // 발생 위치 (페이지/함수명)
  userId?: string | null
  deviceInfo?: string
}

const LOG_KEY = 'uncounted_error_log'
const MAX_LOCAL = 100     // 로컬 최대 보관 수

function loadLog(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as ErrorEntry[]
  } catch {
    return []
  }
}

function saveLog(entries: ErrorEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_LOCAL)))
  } catch { /* ignore */ }
}

function getDeviceInfo(): string {
  try {
    return `${navigator.userAgent.slice(0, 120)}`
  } catch {
    return 'unknown'
  }
}

/** 에러 기록 (로컬 큐에 추가 + 온라인이면 즉시 전송 시도) */
export function logError(
  message: string,
  opts: { stack?: string; context?: string; level?: 'error' | 'warn' } = {},
): void {
  const entry: ErrorEntry = {
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    level: opts.level ?? 'error',
    message: message.slice(0, 500),
    stack: opts.stack?.slice(0, 1000),
    context: opts.context,
    userId: getEffectiveUserId(),
    deviceInfo: getDeviceInfo(),
  }

  const log = loadLog()
  log.push(entry)
  saveLog(log)

  // 온라인이면 비동기 전송 시도
  if (isOnline()) {
    flushErrorLog().catch(() => {})
  }
}

/** 로컬 큐의 에러를 백엔드 API로 전송 */
export async function flushErrorLog(): Promise<number> {
  if (!import.meta.env.VITE_API_URL) return 0
  if (!isOnline()) return 0

  const log = loadLog()
  if (log.length === 0) return 0

  try {
    const { flushErrorLogsApi } = await import('./api/logging')
    const { data, error } = await flushErrorLogsApi(log)

    if (error) {
      // 테이블 미존재 등 — 로컬에 보관 유지
      console.warn('[errorLogger] flush failed:', error)
      return 0
    }

    // 전송 성공 → 로컬 큐 비우기
    saveLog([])
    return data?.count ?? 0
  } catch (err: any) {
    console.warn('[errorLogger] flush error:', err.message)
    return 0
  }
}

/** 글로벌 에러 핸들러 등록 (App.tsx에서 1회 호출) */
export function installGlobalErrorHandler(): void {
  window.addEventListener('error', (event) => {
    logError(event.message ?? 'Unknown error', {
      stack: event.error?.stack,
      context: `${event.filename}:${event.lineno}`,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    logError(message, { stack, context: 'unhandledrejection' })
  })
}
