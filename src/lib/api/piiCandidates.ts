// PII 후보(PII-1B) API 클라이언트.
//
// GET  /api/admin/pii-candidates              — 후보 큐(기본 needs_human_decision + pending)
// POST /api/admin/pii-candidates/:id/decision — 관리자 판정(confirmed/rejected/skipped)
//
// apiFetch 가 요청 암호화 + 응답 복호화 + 401 자동갱신을 처리한다.
// 백엔드는 { data: [...] } 봉투로 반환하므로 res.data 가 후보 배열이다.

import { apiFetch } from './client'
import type { PiiCandidate, PiiDecision } from '../../types/piiCandidate'

export interface PiiCandidateFilters {
  sessionId?: string
  tier?: string
  status?: string
  limit?: number
  offset?: number
}

export async function getPiiCandidates(filters: PiiCandidateFilters = {}) {
  const params = new URLSearchParams()
  if (filters.sessionId) params.set('session_id', filters.sessionId)
  if (filters.tier) params.set('tier', filters.tier)
  if (filters.status) params.set('status', filters.status)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))
  const qs = params.toString()
  return apiFetch<PiiCandidate[]>(`/api/admin/pii-candidates${qs ? `?${qs}` : ''}`)
}

export async function decidePiiCandidate(
  id: string,
  decision: PiiDecision,
  selectedType?: string,
) {
  return apiFetch<{ id: string; decision: PiiDecision; status: 'decided' }>(
    `/api/admin/pii-candidates/${id}/decision`,
    {
      method: 'POST',
      body: JSON.stringify({ decision, selected_type: selectedType }),
    },
  )
}
