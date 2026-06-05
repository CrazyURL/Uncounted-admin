// ── Admin Appeals & Reports Queue API ────────────────────────────────────
// 처리방침 v1.3 §14.5 자동화된 결정 거부 큐 + §13.3 처리 결과 신고 큐.

import { apiFetch } from './client'

export type QueueStatus = 'pending' | 'in_review' | 'resolved' | 'rejected'
export type AppealType = 'reject' | 'explain'
export type DecisionArea =
  | 'pii_masking'
  | 'speaker_diarization'
  | 'quality_grade'
  | 'dataset_eligibility'
export type ReportType = 'pii_not_masked' | 'wrong_speaker' | 'wrong_text' | 'other'

interface UserRef {
  id: string
  email: string | null
}

export interface AutomatedDecisionAppealRow {
  id: string
  user_id: string
  session_id: string | null
  appeal_type: AppealType
  decision_area: DecisionArea
  user_message: string | null
  status: QueueStatus
  admin_response: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
  users: UserRef | null
}

export interface ProcessingResultReportRow {
  id: string
  user_id: string
  session_id: string
  utterance_id: string | null
  report_type: ReportType
  user_message: string | null
  status: QueueStatus
  admin_response: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
  users: UserRef | null
}

// ── Automated Decision Appeals ────────────────────────────────────────

export async function fetchAutomatedDecisionAppeals(
  status: QueueStatus = 'pending',
  limit = 50,
): Promise<AutomatedDecisionAppealRow[]> {
  const { data, error } = await apiFetch<AutomatedDecisionAppealRow[]>(
    `/api/admin/automated-decision-appeals?status=${status}&limit=${limit}`,
  )
  if (error) {
    console.warn('[admin-appeals] fetch 실패:', error)
    return []
  }
  return data ?? []
}

export async function updateAutomatedDecisionAppeal(
  id: string,
  payload: { status: Exclude<QueueStatus, 'pending'>; admin_response?: string },
): Promise<AutomatedDecisionAppealRow | null> {
  const { data, error } = await apiFetch<AutomatedDecisionAppealRow>(
    `/api/admin/automated-decision-appeals/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  if (error) {
    console.error('[admin-appeals] update 실패:', error)
    return null
  }
  return data ?? null
}

// ── Processing Result Reports ─────────────────────────────────────────

export async function fetchProcessingResultReports(
  status: QueueStatus = 'pending',
  limit = 50,
): Promise<ProcessingResultReportRow[]> {
  const { data, error } = await apiFetch<ProcessingResultReportRow[]>(
    `/api/admin/processing-result-reports?status=${status}&limit=${limit}`,
  )
  if (error) {
    console.warn('[admin-reports] fetch 실패:', error)
    return []
  }
  return data ?? []
}

export async function updateProcessingResultReport(
  id: string,
  payload: { status: Exclude<QueueStatus, 'pending'>; admin_response?: string },
): Promise<ProcessingResultReportRow | null> {
  const { data, error } = await apiFetch<ProcessingResultReportRow>(
    `/api/admin/processing-result-reports/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  if (error) {
    console.error('[admin-reports] update 실패:', error)
    return null
  }
  return data ?? null
}

// ── 영업일 경과일 계산 (SLA 추적) ─────────────────────────────────────

export function businessDaysElapsed(createdAt: string): number {
  const created = new Date(createdAt)
  const now = new Date()
  let count = 0
  const cur = new Date(created)
  while (cur < now) {
    cur.setDate(cur.getDate() + 1)
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count += 1
  }
  return count
}
