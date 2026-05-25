// PII 후보(PII-1B) API 클라이언트.
//
// GET  /api/admin/pii-candidates              — 후보 큐(기본 needs_human_decision + pending)
// POST /api/admin/pii-candidates/:id/decision — 후보 테이블에만 판정 기록(rejected/skipped)
// POST /api/admin/pii-candidates/:id/promote  — confirmed/corrected 후보를 pii_annotations 로 승격(PR-P2C)
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

// confirmed/corrected 후보를 pii_annotations 로 원자적 승격(서버 RPC).
// confirmed → annotation.pii_type 는 후보 predicted_type 을 따른다.
// corrected → selected_type 필수(서버가 검증) — 현재 후보 UI 에는 타입 수정 기능이 없어
//             confirmed 만 호출한다. selected_type 인자는 향후 corrected UI 대비.
export async function promotePiiCandidate(
  id: string,
  decision: 'confirmed' | 'corrected',
  selectedType?: string,
) {
  return apiFetch<{
    id: string
    decision: 'confirmed' | 'corrected'
    status: 'decided'
    pii_type: string
    annotation_id: string | null
  }>(`/api/admin/pii-candidates/${id}/promote`, {
    method: 'POST',
    body: JSON.stringify({ decision, selected_type: selectedType }),
  })
}
