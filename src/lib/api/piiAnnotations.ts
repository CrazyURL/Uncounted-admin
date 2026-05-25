// 확정 PII 라벨(pii_annotations) API 클라이언트 — 관리자 수동 등록(PR-P2B-B).
//
// GET  /api/admin/utterances/:id/raw-transcript — 수동 span 등록용 단일 발화 원문(PR-P2B-A)
// POST /api/admin/pii-annotations               — source=admin_manual 수동 등록
//
// 안전: 요청 body 에는 char offset + pii_type 만 보낸다. 선택한 원문 substring 은
//       절대 전송하지 않는다(서버가 raw transcript 에서 hash 를 산출). apiFetch 가
//       요청 암호화 + 응답 복호화 + 401 자동갱신을 처리한다.

import { apiFetch } from './client'
import type { PiiType } from '../pii/manualSpan'

export interface RawTranscript {
  utterance_id: string
  session_id: string
  transcript_text: string
  /** transcript_text.length (UTF-16 code unit) — offset 정합성 검증용. */
  length: number
}

export interface PiiAnnotation {
  id: string
  utterance_id: string
  session_id: string
  source: string
  candidate_id: string | null
  pii_type: string
  char_start: number | null
  char_end: number | null
  normalized_text_hash: string | null
  action_status: string
  reviewed_by: string | null
  reviewed_at: string | null
  note: string | null
  created_at: string
}

export interface ManualAnnotationInput {
  utterance_id: string
  char_start: number
  char_end: number
  pii_type: PiiType
  note?: string
}

export async function getRawTranscript(utteranceId: string) {
  return apiFetch<RawTranscript>(`/api/admin/utterances/${utteranceId}/raw-transcript`)
}

export async function createManualPiiAnnotation(input: ManualAnnotationInput) {
  return apiFetch<PiiAnnotation>('/api/admin/pii-annotations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
