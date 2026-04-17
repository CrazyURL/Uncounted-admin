import { useState, useMemo } from 'react'
import PiiMaskingEditor from './PiiMaskingEditor'
import UtteranceReviewGuide from './UtteranceReviewGuide'
import UtteranceReviewTable from './UtteranceReviewTable'
import UtteranceLabelingPanel from './UtteranceLabelingPanel'
import { UtteranceToolbar } from './UtteranceToolbar'
import { type UseUtteranceReviewReturn } from '../../hooks/useUtteranceReview'
import { useUtteranceFilters } from '../../hooks/useUtteranceFilters'
import { GRADE_COLORS, formatDuration } from '../../lib/utteranceUtils'
import { type ExportUtterance, type ViewMode } from '../../types/export'

interface UtteranceReviewSectionProps {
  review: UseUtteranceReviewReturn
  skuId: string | null
  jobId: string | null
  onFinalize: () => void | Promise<void>
  showLabelingPanel?: boolean
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
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#ef4444' }}>security</span>
          <span className="text-sm font-medium text-white">PII 마스킹 편집</span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10 text-white/60 bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          닫기
        </button>
      </div>

      {utterance && (
        <div
          className="rounded-xl px-4 py-3 bg-indigo-500/5 border border-indigo-500/15"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-white/40">선택된 발화</span>
              <span className="text-sm font-mono text-white truncate">{utterance.utteranceId.slice(0, 20)}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
              >
                {utterance.qualityGrade}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-300">
                청크 #{utterance.sequenceInChunk ?? '—'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap text-xs text-white/60">
            <span className="text-white/40">
              pseudo: <span className="text-white/60">{utterance.pseudoId?.slice(0, 10) ?? '—'}</span>
            </span>

            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-white/40 text-[14px]">person</span>
              {utterance.speakerId ?? '—'}
              {speakerMeta && <span className="text-white/35">({speakerMeta})</span>}
            </span>

            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-white/40 text-[14px]">schedule</span>
              {utterance.startSec.toFixed(1)}s ~ {utterance.endSec.toFixed(1)}s
              <span className="font-semibold text-white/80">
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
    reviewedCount,
    totalCount,
    initialSnapshotMap,
  } = review

  const [viewMode, setViewMode] = useState<ViewMode>('card')

  const {
    filterMode,
    setFilterMode,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    filteredUtterances,
    counts,
  } = useUtteranceFilters({ utterances, initialSnapshotMap })

  const labelingVisible = showLabelingPanel ?? (skuId ? SHOW_LABELING_SKUS.has(skuId) : false)

  const handleSelectAllFiltered = () => {
    const newSelected = new Set(selectedIds)
    filteredUtterances.forEach(u => newSelected.add(u.utteranceId))
    setSelectedIds(newSelected)
  }

  const handleBulkInclude = () => {
    const targets = filteredUtterances.filter(u => selectedIds.has(u.utteranceId) && !u.isIncluded)
    if (targets.length === 0) return
    Promise.all(targets.map(u => toggleReview(u.utteranceId, true)))
  }

  const handleBulkExclude = () => {
    const targets = filteredUtterances.filter(u => selectedIds.has(u.utteranceId) && u.isIncluded)
    if (targets.length === 0) return
    Promise.all(targets.map(u => toggleReview(u.utteranceId, false, 'manual')))
  }

  const selectedInFilteredCount = useMemo(() => {
    return filteredUtterances.filter(u => selectedIds.has(u.utteranceId)).length
  }, [filteredUtterances, selectedIds])

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
          className="rounded-xl px-5 py-8 text-center bg-[#1b1e2e] border border-white/5"
        >
          <span className="material-symbols-outlined text-3xl mb-2 block text-white/30">
            graphic_eq
          </span>
          <p className="text-sm font-medium text-white/60">PII 마스킹 에디터</p>
          <p className="text-xs mt-1 text-white/35">
            아래 목록에서 발화의 PII 버튼을 클릭하면 여기에 파형 에디터가 표시됩니다.
          </p>
        </div>
      )}

      <UtteranceToolbar
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        sortField={sortField}
        setSortField={setSortField}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        viewMode={viewMode}
        setViewMode={setViewMode}
        counts={counts}
        reviewedCount={reviewedCount}
        totalCount={totalCount}
        autoFilter={autoFilter}
        selectedCount={selectedInFilteredCount}
        onSelectAll={handleSelectAllFiltered}
        onBulkInclude={handleBulkInclude}
        onBulkExclude={handleBulkExclude}
      />

      <UtteranceReviewTable
        utterances={filteredUtterances}
        onToggle={toggleReview}
        onAutoFilter={autoFilter}
        onFinalize={onFinalize}
        onPiiEdit={setPiiEditId}
        onSelectionChange={setSelectedIds}
        skuId={skuId ?? undefined}
        piiEditId={piiEditId}
        viewMode={viewMode}
        onViewModeToggle={() => setViewMode(v => v === 'card' ? 'table' : 'card')}
      />

      <div className="flex items-center gap-4 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[11px] text-indigo-300/80">
        <span className="font-bold uppercase tracking-widest text-indigo-400">Shortcuts:</span>
        <span>↑↓ 이동</span>
        <span className="w-px h-3 bg-indigo-500/20" />
        <span>Space 포함/제외</span>
        <span className="w-px h-3 bg-indigo-500/20" />
        <span>Enter 재생/정지</span>
        <span className="w-px h-3 bg-indigo-500/20" />
        <span>P PII편집</span>
        <span className="w-px h-3 bg-indigo-500/20" />
        <span>X 선택</span>
        <span className="w-px h-3 bg-indigo-500/20" />
        <span>T 뷰전환</span>
      </div>

      {labelingVisible && (
        <UtteranceLabelingPanel
          utterances={filteredUtterances}
          selectedIds={selectedIds}
          skuId={skuId ?? undefined}
          onUpdateLabels={updateLabels}
        />
      )}
    </div>
  )
}
