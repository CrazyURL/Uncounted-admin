// 사람 emotion 라벨 검수 큐 API 클라이언트 (PR-H2b-queue).
// 백엔드: admin-emotion-labels.ts (GET /emotion-labels/queue, GET /emotion-labels/stats).
// 저장은 utterances.ts 의 saveUtteranceHumanLabel 을 그대로 재사용한다(중복 정의 금지).

import { apiFetch } from './client'
import type { HumanLabelDecision } from './utterances'

// 검수 큐 한 건(source=human_pending). 발화 원문은 서버에서 maskKnownNames + 200자 슬라이스됨.
// labeler_id/labeler_email/offset 등 식별 정보는 포함되지 않는다.
export interface EmotionQueueItem {
  utterance_id: string
  session_id: string
  text: string
  human_fine_label: string | null
  human_emotion_category: string | null
  category_decision: HumanLabelDecision | string
  queue_reason: string
}

export interface EmotionQueueMeta {
  source: 'human_pending' | 'low_confidence' | string
  total: number
  limit: number
  offset: number
  threshold: number
}

// 진행도 stats — 이 화면에서는 low_confidence 후보 카운트만 표시한다(25k 목록은 노출하지 않음).
// summarizeHumanLabelStats 의 나머지 필드는 H5(training 진행도 카드)에서 사용 예정.
export interface EmotionLabelStats {
  lowConfidenceQueueCount: number
  gate?: string
  nextRequired?: number
  threshold?: number
  [key: string]: unknown
}

// 사람 라벨 검수 큐 조회. 기본 source=human_pending (low_confidence 25k 는 호출하지 않는다).
export async function fetchEmotionQueue(opts: {
  source?: 'human_pending'
  limit?: number
  offset?: number
}): Promise<{ data?: EmotionQueueItem[]; meta?: EmotionQueueMeta; error?: string }> {
  const params = new URLSearchParams()
  params.set('source', opts.source ?? 'human_pending')
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  const res = await apiFetch<EmotionQueueItem[]>(
    `/api/admin/emotion-labels/queue?${params.toString()}`,
  )
  // apiFetch 는 서버 envelope({success,data,meta})를 그대로 통과시킨다 — meta 는 타입 외 필드라 캐스트로 읽는다.
  const meta = (res as { meta?: EmotionQueueMeta }).meta
  return { data: res.data, meta, error: res.error }
}

// 진행도 stats(저신뢰 큐 카운트 등). human_pending 대기 건수는 큐 meta.total 로 충분하므로 보조 정보용.
export async function fetchEmotionLabelStats(): Promise<{
  data?: EmotionLabelStats
  error?: string
}> {
  return apiFetch<EmotionLabelStats>('/api/admin/emotion-labels/stats')
}
