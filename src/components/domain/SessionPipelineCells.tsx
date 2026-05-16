// 통화 처리 흐름 도트 + 실패 표시
//
// 사용처: AdminUtterancesPage, (legacy) AdminReviewQueuePage
// upload → STT → 화자 분리 → PII → 자동레이블 → 품질 6단계.

import { labels } from '../../lib/labels'
import {
  type AdminSession,
  firstFailedStep,
  getPipelineState,
} from '../../types/adminSession'

interface SessionPipelineCellsProps {
  session: AdminSession
}

export function SessionPipelineCells({ session }: SessionPipelineCellsProps) {
  // 업로드 실패: 나머지 단계는 실행 자체가 불가 — 업로드 도트만 표시
  if (session.upload_status === 'failed') {
    return (
      <div className="flex items-center gap-1.5">
        <div
          title={`${labels.pipeline.upload} — ${labels.status.failed}`}
          className="w-2.5 h-2.5 rounded-full bg-danger"
          aria-label="업로드 실패"
        />
        <span className="ml-1 text-xs text-danger">업로드 실패</span>
      </div>
    )
  }

  const steps: Array<{ key: keyof typeof labels.pipeline; status?: string }> = [
    { key: 'upload', status: session.upload_status },
    { key: 'stt', status: session.stt_status },
    { key: 'diarize', status: session.diarize_status },
    { key: 'pii', status: session.pii_status },
    { key: 'auto_label', status: session.auto_label_status },
    { key: 'quality', status: session.quality_status },
  ]
  const failed = firstFailedStep(session)
  const isReady = getPipelineState(session) === 'ready'

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step) => (
        <div
          key={step.key}
          title={`${labels.pipeline[step.key]} — ${
            step.status
              ? (labels.status as Record<string, string>)[step.status] ?? step.status
              : labels.status.pending
          }`}
          className={`w-2.5 h-2.5 rounded-full ${dotClass(step.status)}`}
          aria-label={`${labels.pipeline[step.key]} ${step.status ?? 'pending'}`}
        />
      ))}
      <div
        title={`${labels.pipeline.done} — ${isReady ? '전체 처리 완료' : '처리 중'}`}
        className={`w-2.5 h-2.5 rounded-full ${isReady ? 'bg-success' : 'bg-muted border border-border'}`}
        aria-label={`완료 ${isReady ? 'done' : 'pending'}`}
      />
      {failed && (
        <span className="ml-1 text-xs text-danger" title={`실패 단계: ${failed}`}>
          ⚠
        </span>
      )}
    </div>
  )
}

function dotClass(status: string | undefined): string {
  switch (status) {
    case 'done':
      return 'bg-success'
    case 'running':
      return 'bg-accent animate-pulse'
    case 'failed':
      return 'bg-danger'
    default:
      return 'bg-muted border border-border'
  }
}
