// Admin GPU Worker Status API 클라이언트
//   /api/admin/gpu-worker/status — 큐 깊이 + 처리 중 + 최근 실패
//   /api/admin/gpu-worker/retry/:sessionId — 영구 failed 강제 재시도

import { apiFetch } from './client'

export interface WorkerQueue {
  pending: number
  noAudio: number
  running: number
  failed: number
  failedRetryEligible: number
  failedExhausted: number
  done: number
}

export interface WorkerStatus {
  voiceApiUrl: string
  pollIntervalMs: number
  concurrency: number
  retryConfig: { maxCount: number; delayMin: number; stuckMin: number }
  queue: WorkerQueue
  recentFailures: { id: string; gpu_last_error: string; gpu_retry_count: number; updated_at: string }[]
  oldestPending: { id: string; raw_audio_uploaded_at: string } | null
  currentRunning: { id: string; gpu_started_at: string } | null
}

export async function fetchGpuWorkerStatusApi() {
  return apiFetch<WorkerStatus>('/api/admin/gpu-worker/status')
}

export async function retryGpuWorkerSessionApi(sessionId: string) {
  return apiFetch<{
    sessionId: string
    previousStatus: string
    previousRetryCount: number
    message: string
  }>(`/api/admin/gpu-worker/retry/${encodeURIComponent(sessionId)}`, { method: 'POST' })
}
