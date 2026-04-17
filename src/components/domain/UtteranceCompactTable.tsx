import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type ExportUtterance } from '../../types/export'
import { GRADE_COLORS, formatDuration } from '../../lib/utteranceUtils'

interface UtteranceCompactTableProps {
  utterances: ExportUtterance[]
  selectedIds: Set<string>
  playingId: string | null
  focusedIndex?: number
  onToggleSelect: (id: string) => void
  onToggleReview: (id: string, isIncluded: boolean, reason?: string) => void
  onPlay: (id: string, audioUrl?: string) => void
  onPiiEdit: (id: string) => void
  parentRef: React.RefObject<HTMLDivElement | null>
}

export const UtteranceCompactTable: React.FC<UtteranceCompactTableProps> = ({
  utterances,
  selectedIds,
  playingId,
  focusedIndex,
  onToggleSelect,
  onToggleReview,
  onPlay,
  onPiiEdit,
  parentRef,
}) => {
  const rowVirtualizer = useVirtualizer({
    count: utterances.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // height (32px) + gap/border
    overscan: 20,
  })

  return (
    <div className="flex flex-col bg-[#1b1e2e] rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white/5 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5">
        <div className="w-8 flex-shrink-0">Sel</div>
        <div className="w-10 flex-shrink-0">Grade</div>
        <div className="w-24 flex-shrink-0">ID</div>
        <div className="w-16 flex-shrink-0 text-right">Dur</div>
        <div className="w-16 flex-shrink-0 text-right">SNR</div>
        <div className="w-16 flex-shrink-0 text-right">Beep</div>
        <div className="w-12 flex-shrink-0 text-center">PII</div>
        <div className="flex-1">Status / Actions</div>
      </div>

      {/* Body */}
      <div
        ref={parentRef}
        className="overflow-y-auto"
        style={{ height: '600px' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const u = utterances[virtualItem.index]
            const isSelected = selectedIds.has(u.utteranceId)
            const isPlaying = playingId === u.utteranceId
            const isFocused = focusedIndex === virtualItem.index
            const gradeColor = GRADE_COLORS[u.qualityGrade] ?? '#6b7280'

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '32px',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex items-center gap-2 px-4 border-b border-white/5 transition-colors text-xs
                  ${isFocused ? 'bg-indigo-500/20' : isSelected ? 'bg-indigo-500/5' : 'hover:bg-white/5'}
                  ${!u.isIncluded ? 'opacity-50' : ''}
                `}
              >
                {/* Selection */}
                <div className="w-8 flex-shrink-0">
                  <button
                    onClick={() => onToggleSelect(u.utteranceId)}
                    className="p-1 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ color: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.2)' }}>
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                  </button>
                </div>

                {/* Grade */}
                <div className="w-10 flex-shrink-0">
                  <span
                    className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                    style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
                  >
                    {u.qualityGrade}
                  </span>
                </div>

                {/* ID */}
                <div className="w-24 flex-shrink-0 font-mono text-[10px] text-gray-400 truncate">
                  {u.utteranceId.slice(0, 10)}
                </div>

                {/* Metrics */}
                <div className="w-16 flex-shrink-0 text-right text-gray-300">
                  {formatDuration(u.durationSec)}
                </div>
                <div className="w-16 flex-shrink-0 text-right text-gray-300">
                  {u.snrDb.toFixed(0)}dB
                </div>
                <div className="w-16 flex-shrink-0 text-right">
                  <span style={{ color: (u.beepMaskRatio ?? 0) >= 0.3 ? '#f97316' : '#9ca3af' }}>
                    {((u.beepMaskRatio ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>

                {/* PII */}
                <div className="w-12 flex-shrink-0 text-center">
                  <button
                    onClick={() => onPiiEdit(u.utteranceId)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{
                      color: u.piiMasked ? '#22c55e' : (u.piiIntervals?.length ?? 0) > 0 ? '#eab308' : 'rgba(255,255,255,0.2)'
                    }}>
                      {u.piiMasked ? 'verified_user' : (u.piiIntervals?.length ?? 0) > 0 ? 'edit_note' : 'shield'}
                    </span>
                  </button>
                </div>

                {/* Actions */}
                <div className="flex-1 flex items-center gap-2">
                  <button
                    onClick={() => onPlay(u.utteranceId, u.audioUrl)}
                    disabled={!u.audioUrl}
                    className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-20"
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{ color: isPlaying ? '#8b5cf6' : 'rgba(255,255,255,0.4)' }}>
                      {isPlaying ? 'pause_circle' : 'play_circle'}
                    </span>
                  </button>

                  <button
                    onClick={() => onToggleReview(u.utteranceId, !u.isIncluded, u.isIncluded ? 'manual' : undefined)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{ color: u.isIncluded ? '#22c55e' : '#ef4444' }}>
                      {u.isIncluded ? 'check_circle' : 'cancel'}
                    </span>
                  </button>

                  {u.excludeReason && u.excludeReason !== 'manual' && (
                    <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                      Auto
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
