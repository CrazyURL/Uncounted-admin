// Deliveries API 클라이언트 (비배타적 라이선스)
//
// 마이그레이션 054 — deliveries 테이블 신설.
// 마이그레이션 060 — utterance_deliveries(utterance_id, client_id) UNIQUE — 발화 단위 중복 차단.
// 마이그레이션 061 — deliveries(session_id, client_id) UNIQUE 제거 — 발화 분할 납품 허용.
// 중복판매 차단 책임은 utterance_deliveries 가 단독으로 담당.

import { apiFetch } from './client'

export interface Delivery {
  id: string
  session_id: string
  client_id: string
  delivered_at: string
  price_krw: number
  delivered_by?: string | null
  notes?: string | null
  created_at: string
}

export interface DeliveryClient {
  id: string
  name: string
  active?: boolean
}

export interface DeliveryDuplicateCheckResult {
  duplicate: boolean         // (session_id, client_id) 이미 납품된 경우 true
  alreadyDeliveredToOthers: boolean  // 다른 client 에 납품된 적 있는 경우
  existingDeliveries: Array<{ client_id: string; client_name: string; delivered_at: string }>
}

export async function fetchClients() {
  return apiFetch<DeliveryClient[]>('/api/admin/clients')
}

export async function checkDeliveryDuplicate(sessionId: string, clientId: string) {
  const params = new URLSearchParams({ session_id: sessionId, client_id: clientId })
  return apiFetch<DeliveryDuplicateCheckResult>(`/api/admin/deliveries/check?${params.toString()}`)
}

export async function createDelivery(input: {
  session_id: string
  client_id: string
  price_krw: number
  notes?: string
  utterance_ids?: string[]
}) {
  return apiFetch<Delivery>('/api/admin/deliveries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * 발화 단위 중복판매 사전 검증 (마이그 060).
 * 같은 client 에 이미 납품된 utterance_ids 만 반환.
 * UNIQUE(utterance_id, client_id) 위반 사전 차단용.
 */
export interface UtteranceDuplicate {
  utterance_id: string
  delivery_id: string
  sold_at: string
}

export async function checkUtterancesDuplicate(clientId: string, utteranceIds: string[]) {
  if (utteranceIds.length === 0) {
    return { data: { duplicates: [] as UtteranceDuplicate[] }, error: null as string | null }
  }
  const params = new URLSearchParams({
    client_id: clientId,
    utterance_ids: utteranceIds.join(','),
  })
  return apiFetch<{ duplicates: UtteranceDuplicate[] }>(
    `/api/admin/deliveries/check-utterances?${params.toString()}`,
  )
}

export async function fetchApprovedSessions(search?: string) {
  const params = new URLSearchParams({ review_status: 'approved' })
  if (search) params.set('q', search)
  return apiFetch<Array<{ id: string; title: string | null; duration_seconds: number; consent_status: string }>>(
    `/api/admin/sessions?${params.toString()}`,
  )
}
