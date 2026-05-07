// Deliveries API 클라이언트 (비배타적 라이선스)
//
// 마이그레이션 054 — deliveries 테이블 (UNIQUE(session_id, client_id))
// 백엔드 미구현 단계 — 호출 인터페이스만 우선 정의.

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
}) {
  return apiFetch<Delivery>('/api/admin/deliveries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchApprovedSessions(search?: string) {
  const params = new URLSearchParams({ review_status: 'approved' })
  if (search) params.set('q', search)
  return apiFetch<Array<{ id: string; title: string | null; duration_seconds: number; consent_status: string }>>(
    `/api/admin/sessions?${params.toString()}`,
  )
}
