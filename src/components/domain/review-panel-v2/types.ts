// Review Panel v2 — 정본 데이터 모델 타입 (P1)
// Spec: docs/design_review_panel_redesign_20260603.md §3

export type ReviewPriorityTier = 'red' | 'yellow' | 'green'

export type DatasetTier = 'premium' | 'standard' | 'excluded'

export type GtSpeaker = '본인' | '상대' | 'unknown'

export type GtStatus = 'draft' | 'approved' | 'rejected' | 'deferred_split'

export type ReviewMethod = 'human' | 'auto_approve' | 'spot_check_passed'

export type ExcludeReason = '잡음' | '화자혼재' | '동의불완전' | 'PII우려' | '기타'

export type RevisionType =
  | 'text_correction'
  | 'speaker_relabel'
  | 'pii_addition'
  | 'pii_removal'
  | 'exclude'

export type PiiType = '이름' | '전화' | '주소' | '회사' | '기타'

export interface PiiInterval {
  start_char: number
  end_char: number
  pii_type: PiiType
  source: 'human' | 'auto'
  confidence?: number
}

// id, utterance_id, session_id: text 타입 (utterances.id = "utt_<sid>_<seq>", sessions.id = 16자 hex)
export interface UtteranceGT {
  id: string                     // uuid (utterance_gt.id 만 uuid)
  utterance_id: string           // text — utterances.id
  session_id: string             // text — sessions.id
  gt_transcript: string
  gt_speaker: GtSpeaker | null
  gt_pii_intervals: PiiInterval[]
  reviewer_user_id: string // uuid OR 'system_auto' OR 'spot_check_human'
  review_method: ReviewMethod
  reviewer_comment: string | null
  status: GtStatus
  exclude_reason: ExcludeReason | null
  exclude_reason_note: string | null
  auto_approve_run_id: string | null
  spot_checked: boolean
  spot_check_result: 'pass' | 'fail' | null
  created_at: string
  approved_at: string | null
  updated_at: string
}

export interface UtteranceRevision {
  id: string
  utterance_id: string | null
  session_id: string
  reviewer_user_id: string
  revision_type: RevisionType
  payload: Record<string, unknown>
  reason: string | null
  created_at: string
}

export interface ReviewQueueItem {
  // 통화 단위 큐 row
  session_id: string
  session_label: string // "통화 #192136"
  duration_seconds: number
  utterance_count: number
  call_review_score: number
  call_review_tier: ReviewPriorityTier
  red_count: number
  yellow_count: number
  green_count: number
  reasons: string[] // "화자불명 12, PII미정 4, 품질D 3"
  relation_estimated?: string // "직장동료" — 표시만, 수정 X
  relation_confidence?: number // 0.73 — 표시만
}

export interface UtteranceReviewItem {
  // 발화 단위 검수 row
  id: string
  sequence_order: number
  start_sec: number
  end_sec: number
  duration_sec: number
  speaker_id: string | null
  is_user: boolean | null
  auto_transcript: string
  quality_grade: string | null
  quality_score: number | null
  emotion: string | null
  emotion_confidence: number | null
  review_priority_score: number
  review_priority_tier: ReviewPriorityTier
  dataset_tier: DatasetTier | null
  existing_gt?: UtteranceGT // 이미 검수된 경우
}

export interface CallActionContext {
  session_id: string
  total_utterance_count: number // STT 시점 freeze 값
  reviewed_red_count: number
  reviewed_red_total: number
  revision_stats: {
    text_correction: number
    speaker_relabel: number
    pii_addition: number
    exclude: number
    deferred_split: number
  }
  hotword_candidates: HotwordCandidate[]
}

export interface HotwordCandidate {
  token: string
  frequency: number
  kiwi_pos: string // NNP / NNG / VV / ...
  is_recommended: boolean // 자동 ✓ / ✗
  rejection_reason?: string // 'len_1' | 'kiwi_general_word' | 'particle'
  sample_contexts: string[]
}
