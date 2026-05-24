// PII 후보(PII-1A) + 관리자 판정(PII-1B) 타입.
//
// 백엔드 GET /api/admin/pii-candidates 응답 항목 구조와 일치한다.
// 안전: 응답에는 전체 transcript_text 가 없고, 후보 주변 "최소 스니펫"만 온다
// (snippet + highlight_start/end + candidate_text/context_before/after).
// char_start/char_end(내부 포인터)는 응답에 포함되지 않는다.

export type PiiConfidenceTier = 'auto_confirmed' | 'needs_human_decision' | 'auto_rejected'
export type PiiCandidateStatus = 'pending' | 'decided'
export type PiiDecision = 'confirmed' | 'rejected' | 'skipped'

export interface PiiCandidate {
  id: string
  session_id: string
  utterance_id: string
  predicted_type: string // 이름 / 전화번호 / 계좌 등 (voice-api 가 부여)
  confidence: number
  confidence_tier: PiiConfidenceTier
  high_precision_pattern?: boolean
  status: PiiCandidateStatus
  admin_decision?: string | null
  admin_selected_type?: string | null
  // 최소 스니펫 (전체 transcript_text 아님)
  candidate_text: string | null
  context_before: string | null
  context_after: string | null
  snippet: string | null
  highlight_start: number | null
  highlight_end: number | null
  created_at?: string
}
