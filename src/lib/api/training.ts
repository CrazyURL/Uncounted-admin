// Admin Training API 클라이언트 (STAGE 14 — 자동라벨링 모델 학습)

import { apiFetch } from './client'

export interface TrainingStats {
  totalConfirmed: number
  autoConfirmedCount: number
  adminConfirmedCount: number
  needsMoreCount: number
  canTrigger: boolean
  emotionDistribution: {
    긍정: number
    중립: number
    부정: number
  }
  lastRetrainAt: string | null
}

export interface TrainingJob {
  jobId: string
  status: 'running' | 'completed' | 'failed'
  progress: number
  currentEpoch: number
  totalEpochs: number
  valLoss: number | null
  modelVersion: string | null
  message: string | null
  startedAt: string
  completedAt: string | null
}

export async function fetchTrainingStats(): Promise<{ data?: TrainingStats; error?: string }> {
  return apiFetch<TrainingStats>('/api/admin/training/stats')
}

export async function triggerTraining(): Promise<{ data?: { jobId: string }; error?: string }> {
  return apiFetch<{ jobId: string }>('/api/admin/training/trigger', { method: 'POST' })
}

export async function fetchTrainingStatus(
  jobId: string,
): Promise<{ data?: TrainingJob; error?: string }> {
  return apiFetch<TrainingJob>(`/api/admin/training/status/${jobId}`)
}

export async function exportTrainingData(): Promise<void> {
  const token = localStorage.getItem('uncounted_access_token')
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
  const url = `${apiBase}/api/admin/training/export`
  const a = document.createElement('a')
  a.href = url
  if (token) {
    // TSV download: open with auth header via fetch + blob
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
    if (!res.ok) throw new Error('다운로드 실패')
    const blob = await res.blob()
    a.href = URL.createObjectURL(blob)
    a.download = 'training_data.tsv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }
}
