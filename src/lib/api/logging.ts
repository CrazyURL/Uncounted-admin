// ── Logging API Client ─────────────────────────────────────────────────
// 백엔드 Logging API 호출 레이어

import { apiFetch } from './client'

// ── 퍼널 이벤트 타입 ────────────────────────────────────────────────────

export type FunnelEvent = {
  id: string
  step: string
  timestamp: string
  date_bucket: string
  user_id: string | null
  meta: Record<string, unknown> | null
}

/**
 * POST /api/logging/funnel
 * 퍼널 이벤트 배치 전송
 */
export async function flushFunnelEventsApi(events: FunnelEvent[]) {
  return apiFetch<{ count: number; success: boolean }>('/api/logging/funnel', {
    method: 'POST',
    body: JSON.stringify({ events }),
  })
}

// ── 에러 로그 타입 ──────────────────────────────────────────────────────

export type ErrorLogEntry = {
  id: string
  timestamp: string
  level: 'error' | 'warn'
  message: string
  stack?: string
  context?: string
  userId?: string | null
  deviceInfo?: string
}

/**
 * POST /api/logging/errors
 * 에러 로그 배치 전송
 */
export async function flushErrorLogsApi(logs: ErrorLogEntry[]) {
  return apiFetch<{ count: number; success: boolean }>('/api/logging/errors', {
    method: 'POST',
    body: JSON.stringify({ logs }),
  })
}
