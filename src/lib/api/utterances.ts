// Admin Utterances v2 API 클라이언트 (BM v10 발화 단위)

import { apiFetch } from './client'

export type UtteranceReviewStatus = 'pending' | 'excluded'
export type SessionReviewStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'needs_revision'

export interface AdminUtterance {
  id: string
  session_id: string
  session_title: string | null
  session_duration_sec: number | null
  session_review_status: SessionReviewStatus | string
  session_consent_status: string | null
  speaker_id: string | null
  start_ms: number
  end_ms: number
  duration_seconds: number
  text: string
  unit_price_krw: number
  settled_at: string | null
  review_status: UtteranceReviewStatus
  exclude_reason: string | null
  reviewed_at: string | null
}

export interface UtteranceListResponse {
  utterances: AdminUtterance[]
  total: number
  page: number
  limit: number
  constants: { hourlyRateKrw: number }
}

export interface UtteranceStatsResponse {
  total: number
  settledCount: number
  unsettledCount: number
  totalDurationSec: number
  estimatedRevenueKrw: number
}

export async function fetchUtterances(opts: {
  settled?: 'yes' | 'no'
  review?: UtteranceReviewStatus
  sessionId?: string
  search?: string
  page?: number
  limit?: number
}): Promise<{ data?: UtteranceListResponse; error?: string }> {
  const params = new URLSearchParams()
  if (opts.settled) params.set('settled', opts.settled)
  if (opts.review) params.set('review', opts.review)
  if (opts.sessionId) params.set('session_id', opts.sessionId)
  if (opts.search) params.set('q', opts.search)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.limit) params.set('limit', String(opts.limit))
  return apiFetch<UtteranceListResponse>(`/api/admin/utterances-v2?${params.toString()}`)
}

export async function fetchUtteranceStats() {
  return apiFetch<UtteranceStatsResponse>('/api/admin/utterances-v2/stats')
}

/**
 * 단건 검수 상태 토글 (approve = isIncluded:true → 'pending', reject = isIncluded:false → 'excluded').
 * 백엔드: admin-utterances.ts 의 PATCH /utterances/:id/review-status.
 */
export async function updateUtteranceReviewStatus(
  utteranceId: string,
  isIncluded: boolean,
  excludeReason?: string,
) {
  return apiFetch<{ ok: true; isIncluded: boolean }>(
    `/api/admin/utterances/${utteranceId}/review-status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isIncluded, excludeReason }),
    },
  )
}
