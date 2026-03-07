// ── Sessions API Client ────────────────────────────────────────────────
// 백엔드 Sessions API 호출 레이어

import { type Session } from '../../types/session'
import { apiFetch } from './client'

/**
 * GET /api/sessions
 * 세션 목록 조회
 */
export async function fetchSessions(page = 1, limit = 1000) {
  return apiFetch<Session[]>(`/api/sessions?page=${page}&limit=${limit}`)
}

/**
 * GET /api/sessions/:id
 * 세션 상세 조회
 */
export async function fetchSession(sessionId: string) {
  return apiFetch<Session>(`/api/sessions/${sessionId}`)
}

/**
 * POST /api/sessions/batch
 * 세션 배치 저장 (최대 500건)
 */
export async function saveSessions(sessions: Session[]) {
  return apiFetch<Session[]>('/api/sessions/batch', {
    method: 'POST',
    body: JSON.stringify({ sessions }),
  })
}

/**
 * PUT /api/sessions/:id/labels
 * 라벨 업데이트
 */
export async function updateSessionLabels(sessionId: string, labels: Session['labels']) {
  return apiFetch<Session>(`/api/sessions/${sessionId}/labels`, {
    method: 'PUT',
    body: JSON.stringify({ labels }),
  })
}

/**
 * PUT /api/sessions/:id/visibility
 * 공개 상태 업데이트
 */
export async function updateSessionVisibility(
  sessionId: string,
  visibility: {
    isPublic: boolean
    visibilityStatus: Session['visibilityStatus']
    visibilitySource: Session['visibilitySource']
    visibilityConsentVersion: string | null
    visibilityChangedAt: string | null
  }
) {
  return apiFetch<Session>(`/api/sessions/${sessionId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify(visibility),
  })
}

/**
 * PUT /api/sessions/:id/label-status
 * 라벨 상태 업데이트
 */
export async function updateSessionLabelStatus(
  sessionId: string,
  labelStatus: {
    label_status: string
    label_source?: string
    label_confidence?: number
  }
) {
  return apiFetch<Session>(`/api/sessions/${sessionId}/label-status`, {
    method: 'PUT',
    body: JSON.stringify(labelStatus),
  })
}

/**
 * POST /api/sessions/batch-update
 * 세션 배치 업데이트 (공개 상태, 라벨 등)
 */
export async function batchUpdateSessions(
  updates: Array<{ id: string; [key: string]: any }>
) {
  return apiFetch<{ updated: number }>('/api/sessions/batch-update', {
    method: 'POST',
    body: JSON.stringify({ updates }),
  })
}

/**
 * DELETE /api/sessions/:id
 * 세션 삭제
 */
export async function deleteSession(sessionId: string) {
  return apiFetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

/**
 * DELETE /api/sessions/batch
 * 세션 배치 삭제
 */
export async function deleteSessions(sessionIds: string[]) {
  return apiFetch<{ deleted: number }>('/api/sessions/batch', {
    method: 'DELETE',
    body: JSON.stringify({ ids: sessionIds }),
  })
}

/**
 * GET /api/admin/sessions
 * 전체 세션 조회 (어드민 전용, user_id 필터 없음)
 */
export async function fetchAllSessionsAdminApi(opts?: {
  limit?: number
  offset?: number
}) {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return apiFetch<Session[]>(`/api/admin/sessions${qs ? `?${qs}` : ''}`)
}
