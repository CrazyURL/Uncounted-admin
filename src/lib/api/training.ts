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

// PII 학습 데이터 진행도 (read-only). 원문/스니펫 미포함 — count/type/gate 만.
export interface PiiTrainingProgress {
  positive_annotations: number
  negative_candidates: number
  skipped_candidates: number
  pending_review: number
  by_type_positive: Record<string, number>
  by_type_negative: Record<string, number>
  gate: {
    current: string
    learning_eligible: boolean
    pilot_required_positive: number
    pilot_required_negative: number
    positive_remaining: number
    negative_remaining: number
    next: string | null
  }
}

export async function fetchPiiTrainingProgress(): Promise<{
  data?: PiiTrainingProgress
  error?: string
}> {
  return apiFetch<PiiTrainingProgress>('/api/admin/training/pii-progress')
}

// Emotion human-label 진행도 (read-only). utterances.emotion(모델 출력) 미포함 —
// utterance_human_labels 의 resolved/manual 게이트만. 설계: design_human_emotion_label_loop §11.
export type EmotionGate = 'E0' | 'E1' | 'E2' | 'E3' | 'E4'

export interface EmotionHumanLabelStats {
  resolvedTotal: number
  resolvedManual: number
  resolvedDerived: number
  pendingContext: number
  undecidable: number
  byCategory: { 긍정: number; 중립: number; 부정: number }
  byFineLabel: {
    기쁨: number
    놀람: number
    슬픔: number
    분노: number
    불안: number
    당황: number
    중립: number
  }
  lowConfidenceQueueCount: number
  gate: EmotionGate
  nextRequired: { metric: string; need: number } | null
  threshold: number
}

export async function fetchEmotionHumanLabelStats(): Promise<{
  data?: EmotionHumanLabelStats
  error?: string
}> {
  return apiFetch<EmotionHumanLabelStats>('/api/admin/emotion-labels/stats')
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
