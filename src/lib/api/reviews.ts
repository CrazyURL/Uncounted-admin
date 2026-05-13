// 검수 API 클라이언트
//
// 백엔드 미구현 단계 — 호출 인터페이스만 우선 정의.
// 백엔드 구현 시 endpoint path 와 body 구조 정합 확인 필요.

import { apiFetch } from './client'
import type { AdminSession, ReviewStatus } from '../../types/adminSession'

export interface ReviewQueueFilters {
  reviewStatus?: ReviewStatus | 'all'
  consentStatus?: 'both_agreed' | 'user_only' | 'all'
  qualityLow?: boolean  // 저품질 우선 정렬 (quality_status='failed' 만)
  pipelineFailed?: boolean  // 처리 흐름 5단계 중 어느 하나라도 failed
  search?: string
  page?: number
  limit?: number
}

export interface ReviewQueueResponse {
  sessions: AdminSession[]
  total: number
  filteredDurationSec: number  // 페이지네이션 무관, 현재 필터에 맞는 sessions 전체 duration 합산
  pendingCount: number
  inReviewCount: number
  approvedCount: number
  rejectedCount: number
  needsRevisionCount: number
}

export async function fetchReviewQueue(filters: ReviewQueueFilters = {}) {
  const params = new URLSearchParams()
  if (filters.reviewStatus && filters.reviewStatus !== 'all') params.set('review_status', filters.reviewStatus)
  if (filters.consentStatus && filters.consentStatus !== 'all') params.set('consent_status', filters.consentStatus)
  if (filters.qualityLow) params.set('quality_low', '1')
  if (filters.pipelineFailed) params.set('pipeline_failed', '1')
  if (filters.search) params.set('q', filters.search)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))
  return apiFetch<ReviewQueueResponse>(`/api/admin/reviews?${params.toString()}`)
}

export async function updateReviewStatus(sessionId: string, status: ReviewStatus, note?: string) {
  return apiFetch<{ ok: true }>(`/api/admin/reviews/${sessionId}`, {
    method: 'POST',
    body: JSON.stringify({ status, note }),
  })
}

export async function fetchSessionDetail(sessionId: string) {
  return apiFetch<AdminSession>(`/api/admin/sessions/${sessionId}`)
}

// ── 조건부 일괄 자동 승인 (STAGE 12) ────────────────────────────────────
export interface BulkAutoApproveResponse {
  approved: number
  skipped: number
  eligibleCount?: number
  details: Array<{ sessionId: string; eligible: boolean; reasons: string[] }>
}

export async function bulkAutoApprove(opts: { dryRun?: boolean; sessionIds?: string[] } = {}) {
  return apiFetch<BulkAutoApproveResponse>('/api/admin/reviews/bulk-auto-approve', {
    method: 'POST',
    body: JSON.stringify({
      dryRun: opts.dryRun ?? false,
      sessionIds: opts.sessionIds,
    }),
  })
}
