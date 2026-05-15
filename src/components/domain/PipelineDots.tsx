import type { SessionPipeline, PipelineStatus } from '../../types/adminSession'

type StageStatus = 'pending' | 'running' | 'done' | 'failed'

function resolveStatus(
  stage_status: string | null | undefined,
  stage_started_at: string | null | undefined,
): StageStatus {
  if (!stage_status) return 'pending'
  if (stage_status === 'done') return 'done'
  if (stage_status === 'failed') return 'failed'
  if (stage_started_at) return 'running'
  return 'pending'
}

const BOTTLENECK_MS = 30 * 60 * 1000

export function isBottleneck(pipeline: SessionPipeline): boolean {
  const stages: Array<{ status: PipelineStatus | undefined; at: string | null | undefined }> = [
    { status: pipeline.upload_status,  at: pipeline.uploaded_at },
    { status: pipeline.diarize_status, at: pipeline.diarize_at },
    { status: pipeline.stt_status,     at: pipeline.stt_at },
    { status: pipeline.pii_status,     at: pipeline.pii_at },
    { status: pipeline.quality_status, at: pipeline.quality_at },
  ]
  const currentStage = stages.find(s => s.status !== 'done' && s.at)
  if (!currentStage?.at) return false
  if (currentStage.status === 'failed') return true
  return Date.now() - new Date(currentStage.at).getTime() > BOTTLENECK_MS
}

function allDone(pipeline: SessionPipeline): boolean {
  return (
    pipeline.upload_status === 'done' &&
    pipeline.diarize_status === 'done' &&
    pipeline.stt_status === 'done' &&
    pipeline.pii_status === 'done' &&
    pipeline.quality_status === 'done'
  )
}

const dotColor: Record<StageStatus, string> = {
  pending: 'bg-border',
  running: 'bg-accent animate-pulse',
  done: 'bg-success',
  failed: 'bg-danger',
}

interface DotProps {
  status: StageStatus
  label: string
  placeholder?: boolean
}

function Dot({ status, label, placeholder }: DotProps) {
  return (
    <div className="relative group" title={label}>
      <div
        className={`w-2.5 h-2.5 rounded-full ${placeholder ? 'bg-border opacity-40 cursor-not-allowed' : dotColor[status]}`}
      />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-txt text-bg text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {placeholder ? `${label} (STAGE 14 예정)` : label}
      </div>
    </div>
  )
}

interface PipelineDotsProps {
  pipeline: SessionPipeline
  className?: string
}

export function PipelineDots({ pipeline, className = '' }: PipelineDotsProps) {
  const upload  = resolveStatus(pipeline.upload_status,  pipeline.uploaded_at)
  const diarize = resolveStatus(pipeline.diarize_status, pipeline.diarize_at)
  const stt     = resolveStatus(pipeline.stt_status,     pipeline.stt_at)
  const pii     = resolveStatus(pipeline.pii_status,     pipeline.pii_at)
  const quality = resolveStatus(pipeline.quality_status, pipeline.quality_at)
  const done7   = allDone(pipeline) ? 'done' : 'pending'

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Dot status={upload}  label="업로드" />
      <Dot status={diarize} label="화자분리" />
      <Dot status={stt}     label="STT" />
      <Dot status={pii}     label="PII" />
      {/* dot 5: 자동라벨 — STAGE 14 미구현 placeholder */}
      <Dot status="pending" label="자동라벨" placeholder />
      <Dot status={quality} label="품질검증" />
      <Dot status={done7}   label="완료" />
    </div>
  )
}
