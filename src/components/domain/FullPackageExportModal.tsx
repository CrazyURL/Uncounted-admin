import { useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import {
  exportSessionV2,
  pollExportV2Job,
  isExportV2JobCreated,
  type AudioExportMode,
} from '../../lib/api/export'

interface FullPackageExportModalProps {
  open: boolean
  sessionId: string | null
  onClose: () => void
}

type Phase = 'select' | 'running' | 'done' | 'error'

const POLL_INTERVAL_MS = 2000

/**
 * Row 단건 풀 패키지 export 모달 (Phase 2B).
 * - reference_only(기본): 동기 → download_url 새 탭
 * - embedded WAV: 비동기 job → /export/jobs/:id 폴링 → ready 시 다운로드
 *
 * embedded 는 row 단건에서만 노출 (선택/전체/batch 미지원).
 */
export function FullPackageExportModal({ open, sessionId, onClose }: FullPackageExportModalProps) {
  const [mode, setMode] = useState<AudioExportMode>('reference_only')
  const [phase, setPhase] = useState<Phase>('select')
  const [stage, setStage] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  // 모달 열림/세션 변경 시 상태 초기화
  useEffect(() => {
    if (open) {
      setMode('reference_only')
      setPhase('select')
      setStage('')
      setErrorMsg('')
      cancelledRef.current = false
    }
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [open, sessionId])

  function triggerDownload(url: string) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      // 팝업 차단 시 클립보드 폴백
      navigator.clipboard?.writeText(url).catch(() => {})
    }
  }

  async function pollJob(jobId: string) {
    if (cancelledRef.current) return
    const res = await pollExportV2Job(jobId)
    if (cancelledRef.current) return
    if (res.error || !res.data) {
      setPhase('error')
      setErrorMsg(res.error ?? '작업 상태 조회 실패')
      return
    }
    const job = res.data
    setStage(job.packaging_stage ?? job.status)
    if (job.status === 'ready') {
      if (job.download_url) triggerDownload(job.download_url)
      setPhase('done')
      return
    }
    if (job.status === 'failed') {
      setPhase('error')
      setErrorMsg(job.error_message === 'export_ineligible' ? '판매 부적격 세션입니다' : job.error_message ?? '패키지 생성 실패')
      return
    }
    // queued / packaging → 계속 폴링
    timerRef.current = setTimeout(() => void pollJob(jobId), POLL_INTERVAL_MS)
  }

  async function handleStart() {
    if (!sessionId) return
    setPhase('running')
    setErrorMsg('')
    setStage(mode === 'embedded' ? '작업 생성 중' : '생성 중')

    const res = await exportSessionV2(sessionId, { audio_export_mode: mode })
    if (cancelledRef.current) return

    if (res.error || !res.data) {
      setPhase('error')
      setErrorMsg(res.error ?? '내보내기 실패')
      return
    }

    if (isExportV2JobCreated(res.data)) {
      // embedded → 폴링 시작
      void pollJob(res.data.job_id)
    } else {
      // reference_only → 즉시 다운로드
      triggerDownload(res.data.download_url)
      setPhase('done')
    }
  }

  const busy = phase === 'running'

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="풀 패키지 내보내기"
      size="sm"
      footer={
        phase === 'select' ? (
          <>
            <Button variant="ghost" onClick={onClose}>취소</Button>
            <Button variant="primary" onClick={handleStart}>생성</Button>
          </>
        ) : phase === 'done' ? (
          <Button variant="primary" onClick={onClose}>닫기</Button>
        ) : phase === 'error' ? (
          <>
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="primary" onClick={() => setPhase('select')}>다시 시도</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose} disabled>처리 중…</Button>
        )
      }
    >
      {phase === 'select' && (
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-txt-sub uppercase tracking-wide">오디오 포함</p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="audio_export_mode"
                checked={mode === 'reference_only'}
                onChange={() => setMode('reference_only')}
                className="mt-0.5"
              />
              <span>
                <span className="text-txt">참조만 (기본)</span>
                <span className="block text-xs text-txt-sub">전사·라벨·메타데이터 + audio_manifest. 음성(WAV) 미동봉, 즉시 다운로드.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="audio_export_mode"
                checked={mode === 'embedded'}
                onChange={() => setMode('embedded')}
                className="mt-0.5"
              />
              <span>
                <span className="text-txt">음성(WAV) 동봉</span>
                <span className="block text-xs text-txt-sub">발화별 WAV 포함. 용량·생성 시간이 늘어나며 백그라운드 작업으로 처리됩니다.</span>
              </span>
            </label>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <div className="flex items-center gap-3 text-sm text-txt-sub py-2">
          <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>{stage || '처리 중…'}</span>
        </div>
      )}

      {phase === 'done' && (
        <p className="text-sm text-txt py-2">다운로드가 시작되었습니다. 새 탭이 열리지 않았다면 링크가 클립보드에 복사되었습니다.</p>
      )}

      {phase === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 py-2">{errorMsg}</p>
      )}
    </Modal>
  )
}
