// Admin Dashboard Stats API 클라이언트

import { apiFetch } from './client'

export interface PipelineDistribution {
  pending: number
  running: number
  done: number
  failed: number
}

export interface DashboardStats {
  consent: {
    bothAgreedCount: number
    bothAgreed24h: number
    totalDurationSec: number
  }
  pipeline: {
    upload: PipelineDistribution
    stt: PipelineDistribution
    diarize: PipelineDistribution
    pii: PipelineDistribution
    quality: PipelineDistribution
  }
  review: {
    pending: number
    in_review: number
    approved: number
    rejected: number
    needs_revision: number
  }
  delivery: {
    total: number
    recentRevenue: number
    recent: Array<{
      id: string
      session_id: string
      client_id: string
      delivered_at: string
      price_krw: number
    }>
  }
  alerts: {
    pipelineFailedCount: number
    rejectedCount: number
  }
}

export async function fetchDashboardStats() {
  return apiFetch<DashboardStats>('/api/admin/dashboard-stats')
}
