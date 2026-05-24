// Admin Utterances v2 API 클라이언트 (BM v10 발화 단위)

import { apiFetch } from './client'

export type UtteranceReviewStatus = 'pending' | 'excluded'

// 납품 품질 검수 상태 (일반 review_status 와 직교 — 납품 포함/제외 판단 전용)
export type QualityReviewStatus =
  | 'pending'
  | 'approved_exception'
  | 'excluded_low_quality'
  | 'needs_retranscription'
  | 'needs_pii_masking'
  | 'needs_transcript_edit'

export type QualityExclusionReason =
  | 'noisy'
  | 'too_short'
  | 'clipped'
  | 'unintelligible'
  | 'wrong_transcript'
  | 'pii_unresolved'
  | 'duplicate'
  | 'other'

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F'
export type SessionReviewStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'needs_revision'

export type LabelSource =
  | 'auto_confirmed'
  | 'auto_review'
  | 'needs_review'
  | 'admin_confirmed'
  | 'user_confirmed'
  | 'auto'
  | string

export interface AdminUtterance {
  id: string
  session_id: string
  session_title: string | null
  session_duration_sec: number | null
  session_review_status: SessionReviewStatus | string
  session_consent_status: string | null
  speaker_id: string | null
  session_speaker_id: string | null
  speaker_role: string | null
  speaker_gender: string | null
  speaker_voice_age_range: string | null
  segment_id: string | null
  segment_topic: string | null
  start_ms: number
  end_ms: number
  duration_seconds: number
  text: string
  unit_price_krw: number
  settled_at: string | null
  review_status: UtteranceReviewStatus
  exclude_reason: string | null
  reviewed_at: string | null
  // 납품 품질 검수 (migration 077 / PR1) — 서버 list select 에 포함 시 표시.
  // 미포함 시 undefined → 배지 미렌더, 액션 버튼은 optimistic 으로 동작.
  quality_grade?: QualityGrade | null
  quality_review_status?: QualityReviewStatus | null
  quality_exclusion_reason?: QualityExclusionReason | null
  // STAGE 14: auto-label fields
  emotion: string | null
  emotion_confidence: number | null
  dialog_act: string | null
  dialog_act_confidence: number | null
  label_source: LabelSource | null
  auto_label_model_version: string | null
  // 라벨 카테고리 (표시 전용)
  utterance_form: {
    utterance_type?: string
    turn_type?: string
    is_short_response?: boolean
    is_backchannel?: boolean
    is_greeting?: boolean
    is_closing?: boolean
  } | null
  honorific_level: string | null
  confidence_tier: string | null
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
  deliveredCount?: number
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
  orderBy?: string
}): Promise<{ data?: UtteranceListResponse; error?: string }> {
  const params = new URLSearchParams()
  if (opts.settled) params.set('settled', opts.settled)
  if (opts.review) params.set('review', opts.review)
  if (opts.sessionId) params.set('session_id', opts.sessionId)
  if (opts.search) params.set('q', opts.search)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.orderBy) params.set('order_by', opts.orderBy)
  return apiFetch<UtteranceListResponse>(`/api/admin/utterances-v2?${params.toString()}`)
}

export async function fetchUtteranceStats() {
  return apiFetch<UtteranceStatsResponse>('/api/admin/utterances-v2/stats')
}

export interface PatchUtteranceBody {
  emotion?: string
  dialog_act?: string
  label_source?: LabelSource
}

export async function patchUtterance(
  id: string,
  body: PatchUtteranceBody,
): Promise<{ data?: Pick<AdminUtterance, 'id' | 'emotion' | 'dialog_act' | 'label_source'>; error?: string }> {
  return apiFetch(`/api/admin/utterances-v2/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchUtteranceAudio(
  id: string,
): Promise<{ data?: { url: string }; error?: string }> {
  return apiFetch(`/api/admin/utterances-v2/${id}/audio`)
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

/**
 * 납품 품질 검수 판정 저장.
 * 백엔드: admin-utterances.ts 의 POST /utterances/:id/quality-review (PR1).
 * ⚠️ review_status(일반 검수)와 직교 — quality_review_status 만 변경한다.
 */
export async function updateUtteranceQualityReview(
  utteranceId: string,
  body: { status: QualityReviewStatus; reason?: QualityExclusionReason | null; note?: string | null },
) {
  return apiFetch<{ ok: true; status: QualityReviewStatus; reason: QualityExclusionReason | null }>(
    `/api/admin/utterances/${utteranceId}/quality-review`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export interface QualityReviewReport {
  scope: 'session' | 'quality_c'
  sessionId: string | null
  scopeTotalUtterances: number
  totalCUtterances: number
  excludedCount: number
  approvedExceptionCount: number
  transcriptEditCount: number
  piiMaskingCount: number
  retranscriptionCount: number
  pendingCount: number
  finalIncludedUtterances: number
  finalExcludedUtterances: number
}

/**
 * 저품질 검수 큐 리포트 집계.
 * 백엔드: admin-utterances.ts 의 GET /quality-review/report (PR2).
 */
export async function fetchQualityReviewReport(opts: {
  sessionId?: string
  filter?: 'quality_c'
}): Promise<{ data?: QualityReviewReport; error?: string }> {
  const params = new URLSearchParams()
  if (opts.sessionId) params.set('session_id', opts.sessionId)
  if (opts.filter) params.set('filter', opts.filter)
  return apiFetch<QualityReviewReport>(`/api/admin/quality-review/report?${params.toString()}`)
}
