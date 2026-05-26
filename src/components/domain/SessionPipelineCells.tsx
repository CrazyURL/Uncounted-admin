// 통화 처리 흐름 도트 + 실패 표시
//
// 사용처: AdminUtterancesPage, (legacy) AdminReviewQueuePage
// upload → STT → 화자 분리 → PII → 자동레이블 → 품질 6단계.

import { labels, classifyPipelineFailureLabel } from '../../lib/labels'
import {
  type AdminSession,
  getPipelineState,
} from '../../types/adminSession'

interface SessionPipelineCellsProps {
  session: AdminSession
}

export function SessionPipelineCells({ session }: SessionPipelineCellsProps) {
  const steps: Array<{ key: keyof typeof labels.pipeline; status?: string }> = [
    { key: 'upload', status: session.upload_status },
    { key: 'stt', status: session.stt_status },
    { key: 'diarize', status: session.diarize_status },
    { key: 'pii', status: session.pii_status },
    { key: 'auto_label', status: session.auto_label_status },
    { key: 'quality', status: session.quality_status },
  ]
  const failure = classifyPipelineFailureLabel(session)
  const isReady = getPipelineState(session) === 'ready'

  // 실패 행 툴팁: 단계 · 사유 · (재시도) · 다음 액션 (+ 업로드 단계 원문)
  const failureTitle = failure
    ? `${failure.stageLabel} — ${failure.reasonLabel}` +
      (failure.retryText ? ` · ${failure.retryText}` : '') +
      ` · ${failure.nextAction}` +
      (failure.errorDetail ? `\n${failure.errorDetail.slice(0, 200)}` : '')
    : ''

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
      {failure && (
        <span
          className="ml-1 flex flex-wrap items-center gap-x-1 text-xs text-danger"
          title={failureTitle}
        >
          <span aria-hidden>⚠</span>
          <span>
            {failure.stageLabel} · {failure.reasonLabel}
          </span>
          {failure.retryText && <span>· {failure.retryText}</span>}
          <span>· {failure.nextAction}</span>
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
