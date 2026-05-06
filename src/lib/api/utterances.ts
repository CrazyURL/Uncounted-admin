// Admin Utterances v2 API 클라이언트 (BM v10 발화 단위)

import { apiFetch } from './client'

export interface AdminUtterance {
  id: string
  session_id: string
  speaker_id: string | null
  start_ms: number
  end_ms: number
  duration_seconds: number
  text: string
  unit_price_krw: number
  settled_at: string | null
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
  sessionId?: string
  search?: string
  page?: number
  limit?: number
}) {
  const params = new URLSearchParams()
  if (opts.settled) params.set('settled', opts.settled)
  if (opts.sessionId) params.set('session_id', opts.sessionId)
  if (opts.search) params.set('q', opts.search)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.limit) params.set('limit', String(opts.limit))
  return apiFetch<UtteranceListResponse>(`/api/admin/utterances-v2?${params.toString()}`)
}

export async function fetchUtteranceStats() {
  return apiFetch<UtteranceStatsResponse>('/api/admin/utterances-v2/stats')
}
