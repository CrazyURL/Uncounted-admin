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

// 발화 목록에 실려 오는 사람 emotion 라벨(최신 1행, PR-H2b-api).
// POST 응답 UtteranceHumanLabel 과 달리 labeler_id/labeler_email 는 의도적으로 미포함.
export interface EmbeddedHumanLabel {
  fine_label: EmotionFineLabel | null
  emotion_category: EmotionCategory | null
  category_decision: HumanLabelDecision
  category_source: 'derived' | 'manual' | null
  updated_at: string | null
}

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
  speaker_age_band: string | null
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
  // 사람 emotion 라벨 (PR-H2b-api). 없으면 null/undefined → 사람 배지 미렌더.
  // 저장 후 새로고침해도 이 값으로 배지를 재구성한다.
  human_label?: EmbeddedHumanLabel | null
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

// ── 사람 emotion 라벨 (학습용, PR-H2a) ─────────────────────────────────────
// utterances.emotion(모델 출력)과 분리된 utterance_human_labels 테이블에 누적한다.
// 백엔드: POST /api/admin/utterances/:id/human-label (PR-H2a-api). 성공 시 200 { data: record }.
// 서버가 labeler_id / labeler_email / session_id 를 인증 컨텍스트에서 도출하고,
// resolved 인 경우 category_source 를 'manual' 로 강제한다(클라이언트는 전송하지 않는다).
// 검증: resolved ⇒ fine_label·emotion_category 필수(누락 시 400), undecidable ⇒ 둘 다 null 허용.
export type EmotionCategory = '긍정' | '중립' | '부정'
export type EmotionFineLabel = '기쁨' | '놀람' | '슬픔' | '분노' | '불안' | '당황' | '중립'
export type HumanLabelDecision = 'resolved' | 'pending_context' | 'undecidable'
export type HumanLabelConfidence = 'high' | 'medium' | 'low'

export interface SaveHumanLabelBody {
  category_decision: HumanLabelDecision
  emotion_category?: EmotionCategory | null
  fine_label?: EmotionFineLabel | null
  label_confidence?: HumanLabelConfidence
  note?: string
}

export interface UtteranceHumanLabel {
  id: string
  utterance_id: string
  session_id: string | null
  label_type: string
  fine_label: EmotionFineLabel | null
  emotion_category: EmotionCategory | null
  category_decision: HumanLabelDecision
  category_source: 'derived' | 'manual' | null
  label_confidence: HumanLabelConfidence | null
  note: string | null
  labeler_id: string
  labeler_email: string | null
  created_at: string
  updated_at: string
}

/**
 * 사람 emotion 라벨 저장(upsert). 모델값 utterances.emotion 은 변경하지 않는다.
 * 백엔드: admin-utterances.ts 의 POST /utterances/:id/human-label.
 * UNIQUE(utterance_id, label_type, labeler_id) — 같은 검수자가 다시 저장하면 갱신된다.
 */
export async function saveUtteranceHumanLabel(
  utteranceId: string,
  body: SaveHumanLabelBody,
): Promise<{ data?: UtteranceHumanLabel; error?: string }> {
  return apiFetch<UtteranceHumanLabel>(`/api/admin/utterances/${utteranceId}/human-label`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
