// Admin 전용 Session 확장 타입
//
// 마이그레이션 052에서 sessions 테이블에 추가된 처리 흐름·검수 컬럼.
// 기존 src/types/session.ts 의 Session 타입은 사용자 앱과 공유되므로
// admin 전용 확장 필드는 본 파일에서 분리 관리.

export type PipelineStatus = 'pending' | 'running' | 'done' | 'failed'

export type ReviewStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'needs_revision'

export interface SessionPipeline {
  upload_status?: PipelineStatus
  uploaded_at?: string | null

  stt_status?: PipelineStatus
  stt_at?: string | null

  diarize_status?: PipelineStatus
  diarize_at?: string | null

  pii_status?: PipelineStatus
  pii_at?: string | null

  quality_status?: PipelineStatus
  quality_at?: string | null

  review_status?: ReviewStatus
}

export interface AdminSession extends SessionPipeline {
  id: string
  user_id: string
  title?: string | null
  date: string
  duration_seconds: number
  consent_status: 'none' | 'user_only' | 'both_agreed' | 'user_withdrew' | 'peer_withdrew'
  consented_at?: string | null
  created_at: string
  pii_flag?: boolean
  pii_count?: number
  quality_grade_min?: 'A' | 'B' | 'C' | null
}

// 처리 흐름 모든 단계 완료 여부
export function isPipelineComplete(s: SessionPipeline): boolean {
  return (
    s.upload_status === 'done' &&
    s.stt_status === 'done' &&
    s.diarize_status === 'done' &&
    s.pii_status === 'done' &&
    s.quality_status === 'done'
  )
}

// 처리 흐름 진행도 (0~1)
export function pipelineProgress(s: SessionPipeline): number {
  const steps: Array<PipelineStatus | undefined> = [
    s.upload_status,
    s.stt_status,
    s.diarize_status,
    s.pii_status,
    s.quality_status,
  ]
  const done = steps.filter((x) => x === 'done').length
  return done / steps.length
}

export type PipelineStep = 'upload' | 'stt' | 'diarize' | 'pii' | 'quality'

// 실패한 단계 이름 (있으면)
export function firstFailedStep(s: SessionPipeline): PipelineStep | null {
  if (s.upload_status === 'failed') return 'upload'
  if (s.stt_status === 'failed') return 'stt'
  if (s.diarize_status === 'failed') return 'diarize'
  if (s.pii_status === 'failed') return 'pii'
  if (s.quality_status === 'failed') return 'quality'
  return null
}
