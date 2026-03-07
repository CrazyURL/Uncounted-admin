// ── Transcripts API Client ─────────────────────────────────────────────
// 백엔드 Transcripts API 호출 레이어

import { apiFetch } from './client'

export type TranscriptWord = {
  word: string
  start: number
  end: number
  probability: number
}

export type TranscriptEntry = {
  text: string
  summary?: string
  words?: TranscriptWord[]
  source?: 'device' | 'server'
  createdAt?: string
}

/**
 * POST /api/transcripts/:sessionId
 * 전사 데이터 저장/업데이트
 */
export async function saveTranscriptApi(
  sessionId: string,
  text: string,
  opts?: {
    words?: TranscriptWord[]
    summary?: string
    source?: 'device' | 'server'
  }
) {
  return apiFetch<TranscriptEntry>(`/api/transcripts/${sessionId}`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      summary: opts?.summary,
      words: opts?.words,
      source: opts?.source,
    }),
  })
}

/**
 * GET /api/transcripts/:sessionId
 * 전사 데이터 조회 (전체 정보)
 */
export async function loadTranscriptApi(sessionId: string) {
  return apiFetch<TranscriptEntry | null>(`/api/transcripts/${sessionId}`)
}

/**
 * GET /api/transcripts
 * 모든 전사 데이터 조회
 */
export async function loadAllTranscriptsApi() {
  return apiFetch<Array<TranscriptEntry & { sessionId: string }>>('/api/transcripts')
}

export type AdminTranscriptEntry = TranscriptEntry & {
  sessionId: string
  userId: string
}

/**
 * GET /api/admin/transcripts
 * 전체 전사 데이터 조회 (어드민 전용)
 */
export async function loadAllTranscriptsAdminApi(opts?: {
  limit?: number
  offset?: number
}) {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return apiFetch<AdminTranscriptEntry[]>(
    `/api/admin/transcripts${qs ? `?${qs}` : ''}`
  )
}

/**
 * DELETE /api/transcripts/:sessionId
 * 전사 데이터 삭제
 */
export async function deleteTranscriptApi(sessionId: string) {
  return apiFetch(`/api/transcripts/${sessionId}`, {
    method: 'DELETE',
  })
}
