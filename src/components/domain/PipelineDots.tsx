import type { SessionPipeline } from '../../types/adminSession'

type DotStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

function resolveStatus(
  stage_status: string | null | undefined,
  stage_at: string | null | undefined,
): DotStatus {
  if (stage_status === 'done') return 'done'
  if (stage_status === 'failed') return 'failed'
  if (stage_status === 'skipped') return 'skipped'
  if (stage_status === 'running' || stage_at) return 'running'
  return 'pending'
}

const dotClass: Record<DotStatus, string> = {
  pending: 'bg-border',
  running: 'bg-accent animate-pulse',
  done:    'bg-success',
  failed:  'bg-danger',
  skipped: 'bg-muted',
}

function Dot({ status, label }: { status: DotStatus; label: string }) {
  return (
    <div className="relative group" title={label}>
      <div className={`w-2.5 h-2.5 rounded-full ${dotClass[status]}`} />
      {status === 'skipped' && (
        <svg
          className="absolute inset-0 w-2.5 h-2.5 text-txt-tertiary"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <polyline points="2,5 4.5,7.5 8,3" />
        </svg>
      )}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-txt text-bg text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {label}{status === 'skipped' ? ' (건너뜀)' : ''}
      </div>
    </div>
  )
}

interface PipelineDotsProps {
  pipeline: SessionPipeline
  className?: string
}

// 실제 처리 순서: 업로드 → STT → 화자분리 → 개인정보 → 자동 라벨링 → 품질 처리
export function PipelineDots({ pipeline, className = '' }: PipelineDotsProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Dot status={resolveStatus(pipeline.upload_status,     pipeline.uploaded_at)} label="업로드" />
      <Dot status={resolveStatus(pipeline.stt_status,        pipeline.stt_at)}      label="STT" />
      <Dot status={resolveStatus(pipeline.diarize_status,    pipeline.diarize_at)}  label="화자분리" />
      <Dot status={resolveStatus(pipeline.pii_status,        pipeline.pii_at)}      label="개인정보" />
      <Dot status={resolveStatus(pipeline.auto_label_status, pipeline.label_at)}    label="자동 라벨링" />
      <Dot status={resolveStatus(pipeline.quality_status,    pipeline.quality_at)}  label="품질 처리" />
    </div>
  )
}
