import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ExportUtterance } from '../../types/export'
import { reviewExportUtterances, finalizeExportRequest, waitForExportJobReady } from '../../lib/adminStore'
import ExportDownloadCard from './ExportDownloadCard'
import UtteranceReviewSection from './UtteranceReviewSection'
import { useUtteranceReview } from '../../hooks/useUtteranceReview'
import LoadingOverlay from '../common/LoadingOverlay'
import PackagingStageChecklist from './PackagingStageChecklist'

// ── Props ──────────────────────────────────────────────────

interface AudioProcessingStepsProps {
  step: number
  reviewUtterances: ExportUtterance[]
  setReviewUtterances: (utts: ExportUtterance[] | ((prev: ExportUtterance[]) => ExportUtterance[])) => void
  processPhase: 'idle' | 'extracting' | 'analyzing' | 'splitting' | 'done'
  processProgress: number
  createdJobId: string | null
  selectedSkuId: string | null
  sampled: { id: string }[]
  requestedUnits: number
  onStartProcess: () => void
  onSetStep: (step: number | ((prev: number) => number)) => void
}

// ── Step 5: 처리 진행 ──────────────────────────────────────

export function AudioStepProcess({
  reviewUtterances,
  processPhase,
  processProgress,
  onStartProcess,
  onSetStep,
}: Pick<AudioProcessingStepsProps,
  'reviewUtterances' | 'processPhase' | 'processProgress' | 'onStartProcess' | 'onSetStep'
>) {
  return (
    <div className="space-y-4">
      {reviewUtterances.length > 0 && processPhase === 'idle' && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <span className="material-symbols-outlined text-lg" style={{ color: '#22c55e' }}>check_circle</span>
          <div>
            <p className="text-xs font-medium" style={{ color: '#22c55e' }}>클라이언트 발화 사용</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              이미 {reviewUtterances.length}건의 발화가 존재합니다. Segmentation을 건너뛰고 검수로 진행할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#1b1e2e' }}>
        {processPhase === 'idle' ? (
          <>
            <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: '#1337ec' }}>rocket_launch</span>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {reviewUtterances.length > 0
                ? '기존 발화를 사용하거나 다시 처리할 수 있습니다'
                : '처리를 시작하면 추출 → 분석 → 분할 순서로 진행됩니다'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={onStartProcess}
                className="text-xs px-6 py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: '#1337ec' }}
              >
                {reviewUtterances.length > 0 ? '다시 처리' : '처리 시작'}
              </button>
              {reviewUtterances.length > 0 && (
                <button
                  onClick={() => onSetStep(6)}
                  className="text-xs px-6 py-2 rounded-lg font-medium text-white"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  검수로 건너뛰기
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              {processPhase !== 'done' && (
                <span className="material-symbols-outlined text-xl animate-spin" style={{ color: '#1337ec' }}>progress_activity</span>
              )}
              {processPhase === 'done' && (
                <span className="material-symbols-outlined text-xl" style={{ color: '#22c55e' }}>check_circle</span>
              )}
              <span className="text-sm font-medium text-white">
                {processPhase === 'extracting' && '음성 추출 중...'}
                {processPhase === 'analyzing' && '품질 분석 중...'}
                {processPhase === 'splitting' && '발화 분할 중...'}
                {processPhase === 'done' && '처리 완료'}
              </span>
            </div>

            <div className="w-full h-2 rounded-full mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${processProgress}%`, backgroundColor: processPhase === 'done' ? '#22c55e' : '#1337ec' }}
              />
            </div>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{processProgress}%</p>

            <div className="flex justify-between mt-4 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {['추출', '분석', '분할'].map((label, i) => {
                const phases = ['extracting', 'analyzing', 'splitting']
                const phaseIdx = phases.indexOf(processPhase)
                const done = processPhase === 'done' || phaseIdx > i
                const active = phaseIdx === i
                return (
                  <span key={label} style={{ color: done ? '#22c55e' : active ? '#1337ec' : undefined }}>
                    {done ? '✓ ' : active ? '● ' : '○ '}{label}
                  </span>
                )
              })}
            </div>

            {processPhase === 'done' && (
              <button
                onClick={() => onSetStep(6)}
                className="mt-4 text-xs px-6 py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: '#1337ec' }}
              >
                검수 진행
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Step 6: 검수 ───────────────────────────────────────────

export function AudioStepReview({
  reviewUtterances,
  setReviewUtterances,
  requestedUnits,
  createdJobId,
  selectedSkuId,
  onSetStep,
}: Pick<AudioProcessingStepsProps,
  'reviewUtterances' | 'setReviewUtterances' | 'requestedUnits' | 'createdJobId' |
  'selectedSkuId' | 'onSetStep'
>) {
  const review = useUtteranceReview({
    jobId: createdJobId,
    utterances: reviewUtterances,
    setUtterances: setReviewUtterances,
  })

  const totalAvailableSec = reviewUtterances.reduce((acc, u) => acc + u.durationSec, 0)
  const totalAvailableMin = totalAvailableSec / 60

  const [finalizing, setFinalizing] = useState(false)
  const [finalizeStage, setFinalizeStage] = useState<string | null>(null)

  const handleFinalize = async () => {
    if (!createdJobId) return
    const includedSec = reviewUtterances.reduce((acc, u) => (u.isIncluded ? acc + u.durationSec : acc), 0)
    const includedMin = includedSec / 60
    if (includedMin < requestedUnits) {
      const ok = window.confirm(
        `선택된 발화 총량이 ${includedMin.toFixed(1)}분으로 요청 수량 ${requestedUnits}분에 미달합니다.\n그대로 패키징을 확정할까요?`,
      )
      if (!ok) return
    }
    setFinalizing(true)
    setFinalizeStage(null)
    try {
      const reviewResult = await reviewExportUtterances(
        createdJobId,
        reviewUtterances.map(u => ({ utteranceId: u.utteranceId, isIncluded: u.isIncluded, excludeReason: u.excludeReason })),
      )
      if (reviewResult.failed > 0) {
        const firstFailures = (reviewResult.failures ?? [])
          .slice(0, 3)
          .map(f => `  · ${f.utteranceId.slice(0, 8)}: ${f.reason}`)
          .join('\n')
        const ok = window.confirm(
          `검수 상태 저장 중 ${reviewResult.failed}/${reviewResult.total}건 실패했습니다.\n` +
          `v3Matched=${reviewResult.v3Matched ?? 0}, legacyMatched=${reviewResult.legacyMatched ?? 0}\n` +
          (firstFailures ? `\n실패 샘플:\n${firstFailures}\n` : '') +
          `\n그대로 패키징을 진행할까요? (취소 권장)`,
        )
        if (!ok) {
          setFinalizing(false)
          setFinalizeStage(null)
          return
        }
      }
      await finalizeExportRequest(createdJobId)
      await waitForExportJobReady(createdJobId, {
        onProgress: (job) => setFinalizeStage(job.packagingStage),
      })
      onSetStep(7)
    } catch (err) {
      const message = err instanceof Error ? err.message : '패키징 확정에 실패했습니다. 다시 시도해 주세요.'
      alert(message)
    } finally {
      setFinalizing(false)
      setFinalizeStage(null)
    }
  }

  return (
    <div className="space-y-3">
      <LoadingOverlay isVisible={finalizing} message="패키징 확정 중">
        <PackagingStageChecklist currentStage={finalizeStage} />
      </LoadingOverlay>
      {totalAvailableMin < requestedUnits && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <span className="material-symbols-outlined text-sm mt-0.5" style={{ color: '#f59e0b' }}>warning</span>
          <div>
            <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>발화량 부족 경고</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              전체 발화를 포함해도 <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{totalAvailableMin.toFixed(1)}분</strong>으로,
              요청 수량 <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{requestedUnits}분</strong>에 미달합니다. 그대로 확정하거나 수량 단계로 돌아가 조정할 수 있습니다.
            </p>
            <button
              onClick={() => onSetStep(2)}
              className="mt-2 text-[11px] px-3 py-1 rounded-lg font-medium"
              style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              수량 + 조건 단계로 돌아가기
            </button>
          </div>
        </div>
      )}
      <UtteranceReviewSection
        review={review}
        skuId={selectedSkuId}
        onFinalize={handleFinalize}
        showLabelingPanel={selectedSkuId !== 'U-A01'}
      />
    </div>
  )
}

// ── Step 7: 다운로드 ───────────────────────────────────────

export function AudioStepDownload({
  selectedSkuId,
  sampled,
  reviewUtterances,
  createdJobId,
}: Pick<AudioProcessingStepsProps,
  'selectedSkuId' | 'sampled' | 'reviewUtterances' | 'createdJobId'
>) {
  const navigate = useNavigate()

  if (!createdJobId || !selectedSkuId) return null

  return (
    <ExportDownloadCard
      jobId={createdJobId}
      skuId={selectedSkuId}
      utteranceCount={reviewUtterances.filter(u => u.isIncluded).length}
      estimatedSizeMb={sampled.length * 0.8}
      onNavigate={() => navigate('/admin/jobs')}
    />
  )
}
