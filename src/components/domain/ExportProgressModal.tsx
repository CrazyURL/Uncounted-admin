import { useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { pollExportJob } from '../../lib/api/delivery'
import type { ExportJobV2 } from '../../types/delivery'

interface ExportProgressModalProps {
  open: boolean
  job: ExportJobV2 | null
  onClose: () => void
}

const STATUS_LABEL: Record<ExportJobV2['status'], string> = {
  queued: '대기중',
  processing: '처리중',
  complete: '완료',
  failed: '실패',
}

export function ExportProgressModal({ open, job, onClose }: ExportProgressModalProps) {
  const [current, setCurrent] = useState<ExportJobV2 | null>(job)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setCurrent(job)
  }, [job])

  useEffect(() => {
    if (!open || !current) return
    if (current.status === 'complete' || current.status === 'failed') return

    intervalRef.current = setInterval(async () => {
      const res = await pollExportJob(current.id)
      if (res.data) {
        setCurrent(res.data)
        if (res.data.status === 'complete' || res.data.status === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      }
    }, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [open, current?.id, current?.status])

  if (!current) return null

  const isDone = current.status === 'complete'
  const isFailed = current.status === 'failed'
  const isFinished = isDone || isFailed

  return (
    <Modal
      open={open}
      onClose={isFinished ? onClose : () => {}}
      title="ZIP 내보내기"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          {isDone && current.download_url && (
            <Button
              size="sm"
              onClick={() => {
                window.open(current.download_url!, '_blank', 'noopener,noreferrer')
                onClose()
              }}
            >
              다운로드
            </Button>
          )}
          {isFinished && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              닫기
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-txt-sub">상태</span>
          <span
            className="font-medium"
            style={{
              color: isFailed
                ? 'var(--color-danger)'
                : isDone
                  ? 'var(--color-success)'
                  : 'var(--color-txt)',
            }}
          >
            {STATUS_LABEL[current.status]}
          </span>
        </div>

        <div>
          <div className="flex justify-between text-xs text-txt-sub mb-1">
            <span>진행률</span>
            <span className="tabular-nums">{current.progress}%</span>
          </div>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 6, backgroundColor: 'var(--color-border-light)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${current.progress}%`,
                backgroundColor: isFailed
                  ? 'var(--color-danger)'
                  : 'var(--color-accent)',
              }}
            />
          </div>
        </div>

        {isFailed && current.error_message && (
          <p className="text-xs text-danger">{current.error_message}</p>
        )}

        {!isFinished && (
          <p className="text-xs text-txt-sub text-center">잠시 기다려 주세요…</p>
        )}
      </div>
    </Modal>
  )
}
