// 통화 처리 흐름 도트 + 실패 표시
//
// 사용처: AdminUtterancesPage, (legacy) AdminReviewQueuePage
// upload → STT → 화자 분리 → PII → 자동레이블 → 품질 6단계.

import { labels } from '../../lib/labels'
import {
  type AdminSession,
  type PipelineFailureInfo,
  MAX_PIPELINE_RETRY,
  describePipelineFailure,
  firstFailedStep,
  getPipelineState,
} from '../../types/adminSession'

interface SessionPipelineCellsProps {
  session: AdminSession
}

/** 재시도 횟수 배지 텍스트 (모르면 null). */
function retryText(info: PipelineFailureInfo): string | null {
  if (info.retryCount == null) return null
  return info.retryExhausted
    ? `재시도 소진(${info.retryCount}/${MAX_PIPELINE_RETRY})`
    : `재시도 ${info.retryCount}/${MAX_PIPELINE_RETRY}`
}

/** 실패 사유 + 다음 액션을 합친 hover 툴팁. */
function failureTitle(info: PipelineFailureInfo): string {
  const detail = info.detail ? ` (${info.detail.slice(0, 160)})` : ''
  return `${info.stageLabel} — ${info.reasonLabel}${detail} · 다음 액션: ${info.nextAction}`
}

export function SessionPipelineCells({ session }: SessionPipelineCellsProps) {
  // 업로드 단계 실패는 단계 도트 대신 사유·다음 액션을 노출 (운영자가 화면에서 바로 판단).
  if (session.upload_status === 'failed') {
    const info = describePipelineFailure(session)!
    const retry = retryText(info)
    return (
      <div className="flex flex-col gap-0.5" title={failureTitle(info)}>
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full bg-danger"
            aria-label={info.reasonLabel}
          />
          <span className="ml-1 text-xs text-danger">{info.reasonLabel}</span>
          {retry && <span className="text-[10px] text-muted-foreground">{retry}</span>}
        </div>
        <span className="text-[10px] text-muted-foreground">{info.nextAction}</span>
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
  // 비-업로드 단계 실패 — 사유/다음 액션 노출용 (gpu_last_error 가 화면에 안 보이던 갭 해소)
  const info = failed ? describePipelineFailure(session) : null

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
      {failed && info && (
        <>
          <span className="ml-1 text-xs text-danger" title={failureTitle(info)}>
            ⚠
          </span>
          <span className="text-[10px] text-muted-foreground" title={failureTitle(info)}>
            {info.stageLabel} {info.reasonLabel} · {info.nextAction}
          </span>
        </>
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
