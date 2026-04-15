import PiiMaskingEditor from './PiiMaskingEditor'
import UtteranceReviewGuide from './UtteranceReviewGuide'
import UtteranceReviewTable from './UtteranceReviewTable'
import UtteranceLabelingPanel from './UtteranceLabelingPanel'
import { type UseUtteranceReviewReturn } from '../../hooks/useUtteranceReview'

interface UtteranceReviewSectionProps {
  review: UseUtteranceReviewReturn
  skuId: string | null
  jobId: string | null
  onFinalize: () => void | Promise<void>
  showLabelingPanel?: boolean
}

const SHOW_LABELING_SKUS = new Set(['U-A02', 'U-A03'])

export default function UtteranceReviewSection({
  review,
  skuId,
  jobId,
  onFinalize,
  showLabelingPanel,
}: UtteranceReviewSectionProps) {
  const {
    utterances,
    piiEditId,
    setPiiEditId,
    selectedIds,
    setSelectedIds,
    toggleReview,
    autoFilter,
    updateLabels,
    handlePiiMaskApplied,
  } = review

  const labelingVisible = showLabelingPanel ?? (skuId ? SHOW_LABELING_SKUS.has(skuId) : false)

  return (
    <div className="space-y-3">
      <UtteranceReviewGuide />

      {piiEditId ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-white">
              PII 마스킹 — {piiEditId.slice(0, 16)}
            </span>
            <button
              onClick={() => setPiiEditId(null)}
              className="text-[10px] px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            >
              닫기
            </button>
          </div>
          <PiiMaskingEditor
            utteranceId={piiEditId}
            jobId={jobId ?? undefined}
            onMaskApplied={handlePiiMaskApplied}
          />
        </div>
      ) : (
        <div
          className="rounded-xl px-4 py-6 text-center"
          style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="material-symbols-outlined text-2xl mb-2 block" style={{ color: 'rgba(255,255,255,0.3)' }}>
            graphic_eq
          </span>
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>PII 마스킹 에디터</p>
          <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            아래 표에서 발화를 선택하면 여기에 파형 에디터가 표시됩니다.
          </p>
        </div>
      )}

      <UtteranceReviewTable
        utterances={utterances}
        onToggle={toggleReview}
        onAutoFilter={autoFilter}
        onFinalize={onFinalize}
        onPiiEdit={setPiiEditId}
        onSelectionChange={setSelectedIds}
        skuId={skuId ?? undefined}
      />

      {labelingVisible && (
        <UtteranceLabelingPanel
          utterances={utterances}
          selectedIds={selectedIds}
          skuId={skuId ?? undefined}
          onUpdateLabels={updateLabels}
        />
      )}
    </div>
  )
}
