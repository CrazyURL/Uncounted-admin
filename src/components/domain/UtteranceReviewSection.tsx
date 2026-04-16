import PiiMaskingEditor from './PiiMaskingEditor'
import UtteranceReviewGuide from './UtteranceReviewGuide'
import UtteranceReviewTable from './UtteranceReviewTable'
import UtteranceLabelingPanel from './UtteranceLabelingPanel'
import { type UseUtteranceReviewReturn } from '../../hooks/useUtteranceReview'
import { type ExportUtterance } from '../../types/export'

interface UtteranceReviewSectionProps {
  review: UseUtteranceReviewReturn
  skuId: string | null
  jobId: string | null
  onFinalize: () => void | Promise<void>
  showLabelingPanel?: boolean
}

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#6b7280' }

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}초`
}

function PiiEditorWithContext({
  utterance,
  piiEditId,
  jobId,
  onClose,
  onMaskApplied,
}: {
  utterance: ExportUtterance | undefined
  piiEditId: string
  jobId: string | null
  onClose: () => void
  onMaskApplied: () => void
}) {
  const gradeColor = utterance ? (GRADE_COLORS[utterance.qualityGrade] ?? '#6b7280') : '#6b7280'
  const speakerMeta = utterance
    ? [utterance.speakerGender, utterance.speakerAgeBand].filter(Boolean).join(' / ')
    : ''

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#ef4444' }}>security</span>
          <span className="text-sm font-medium text-white">PII 마스킹 편집</span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          닫기
        </button>
      </div>

      {/* Selected utterance summary card */}
      {utterance && (
        <div
          className="rounded-xl px-4 py-3"
          style={{ backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>선택된 발화</span>
              <span className="text-sm font-mono text-white truncate">{utterance.utteranceId.slice(0, 20)}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
              >
                {utterance.qualityGrade}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-md" style={{ backgroundColor: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                청크 #{utterance.sequenceInChunk ?? '—'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>
              pseudo: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{utterance.pseudoId?.slice(0, 10) ?? '—'}</span>
            </span>

            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>person</span>
              {utterance.speakerId ?? '—'}
              {speakerMeta && <span style={{ color: 'rgba(255,255,255,0.35)' }}>({speakerMeta})</span>}
            </span>

            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>schedule</span>
              {utterance.startSec.toFixed(1)}s ~ {utterance.endSec.toFixed(1)}s
              <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                ({formatDuration(utterance.durationSec)})
              </span>
            </span>

            <span>SNR {utterance.snrDb.toFixed(1)}dB</span>

            <span style={{ color: (utterance.beepMaskRatio ?? 0) >= 0.3 ? '#f97316' : undefined }}>
              beep {((utterance.beepMaskRatio ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      <PiiMaskingEditor
        utteranceId={piiEditId}
        jobId={jobId ?? undefined}
        onMaskApplied={onMaskApplied}
      />
    </div>
  )
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
        <PiiEditorWithContext
          utterance={utterances.find(u => u.utteranceId === piiEditId)}
          piiEditId={piiEditId}
          jobId={jobId}
          onClose={() => setPiiEditId(null)}
          onMaskApplied={handlePiiMaskApplied}
        />
      ) : (
        <div
          className="rounded-xl px-5 py-8 text-center"
          style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="material-symbols-outlined text-3xl mb-2 block" style={{ color: 'rgba(255,255,255,0.3)' }}>
            graphic_eq
          </span>
          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>PII 마스킹 에디터</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            아래 목록에서 발화의 PII 버튼을 클릭하면 여기에 파형 에디터가 표시됩니다.
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
        piiEditId={piiEditId}
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
