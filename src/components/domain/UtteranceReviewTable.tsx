import { useRef, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type ExportUtterance, type ViewMode, type PlaybackState } from '../../types/export'
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation'
import { GRADE_COLORS, formatDuration } from '../../lib/utteranceUtils'
import { UtteranceCompactTable } from './UtteranceCompactTable'

type Props = {
  utterances: ExportUtterance[]
  onToggle: (utteranceId: string, isIncluded: boolean, reason?: string) => void
  onFinalize?: () => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  skuId?: string
  onPiiEdit?: (utteranceId: string) => void
  piiEditId?: string | null
  viewMode?: ViewMode
  onViewModeToggle?: () => void
  playback: PlaybackState
  onPlay: (id: string, audioUrl?: string) => void
  onStartContinuous: (startId?: string) => void
  onStop: () => void
  onTogglePause: () => void
}

const REASON_LABELS: Record<string, { text: string; color: string }> = {
  too_short: { text: '3초 미만', color: '#ef4444' },
  low_grade: { text: 'C등급', color: '#ef4444' },
  high_beep: { text: 'beep↑', color: '#ef4444' },
  manual: { text: '수동 제외', color: '#ef4444' },
}

const LABEL_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'tone', label: '어조' },
  { key: 'domain', label: '도메인' },
  { key: 'purpose', label: '목적' },
  { key: 'relationship', label: '관계' },
  { key: 'noise', label: '소음' },
  { key: 'dialogAct', label: '대화행위' },
  { key: 'dialogIntensity', label: '강도' },
]

function PiiButton({ utterance, onPiiEdit }: { utterance: ExportUtterance; onPiiEdit: (id: string) => void }) {
  const intervalCount = utterance.piiIntervals?.length ?? 0
  const masked = utterance.piiMasked === true
  const version = utterance.piiMaskVersion ?? 0

  let icon = 'shield'
  let color = 'rgba(255,255,255,0.35)'
  let tooltip = 'PII 구간 없음'
  if (masked) {
    icon = 'verified_user'
    color = '#22c55e'
    const who = utterance.piiMaskedByEmail ?? utterance.piiMaskedBy ?? 'unknown'
    const when = utterance.piiMaskedAt ? new Date(utterance.piiMaskedAt).toLocaleString('ko-KR', { hour12: false }) : ''
    tooltip = version >= 2
      ? `재적용 v${version} — ${who} · ${when}`
      : `마스킹 완료 — ${who} · ${when}`
  } else if (intervalCount > 0) {
    icon = 'edit_note'
    color = '#eab308'
    tooltip = `구간 ${intervalCount}건 (마스킹 미적용)`
  }

  return (
    <button
      onClick={() => onPiiEdit(utterance.utteranceId)}
      className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer relative"
      title={tooltip}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '22px', color }}>
        {icon}
      </span>
      {masked && version >= 2 && (
        <span
          className="absolute -top-0.5 -right-0.5 text-[9px] font-bold rounded-full px-1.5"
          style={{ backgroundColor: '#22c55e', color: '#000', lineHeight: 1.3 }}
        >
          v{version}
        </span>
      )}
    </button>
  )
}

function UtteranceCard({
  utterance,
  isSelected,
  isPiiEditing,
  showLabels,
  playingId,
  isFocused,
  onToggleSelect,
  onToggle,
  onPlay,
  onPiiEdit,
  onFocus,
}: {
  utterance: ExportUtterance
  isSelected: boolean
  isPiiEditing: boolean
  showLabels: boolean
  playingId: string | null
  isFocused: boolean
  onToggleSelect: (id: string) => void
  onToggle: (id: string, isIncluded: boolean, reason?: string) => void
  onPlay: (id: string, audioUrl?: string) => void
  onPiiEdit?: (id: string) => void
  onFocus: () => void
}) {
  const u = utterance
  const gradeColor = GRADE_COLORS[u.qualityGrade] ?? '#6b7280'
  const reasonInfo = u.excludeReason ? REASON_LABELS[u.excludeReason] : null
  const isPlaying = playingId === u.utteranceId

  const speakerMeta = [u.speakerGender, u.speakerAgeBand].filter(Boolean).join(' / ')

  return (
    <div
      onClick={onFocus}
      className="rounded-xl p-4 transition-all relative overflow-hidden cursor-pointer"
      style={{
        backgroundColor: isPiiEditing
          ? 'rgba(239,68,68,0.12)'
          : isPlaying
            ? 'rgba(99,102,241,0.15)'
            : !u.isIncluded
              ? 'rgba(239,68,68,0.06)'
              : isSelected
                ? 'rgba(139,92,246,0.08)'
                : '#1b1e2e',
        border: isPiiEditing
          ? '3px solid rgba(239,68,68,0.7)'
          : isPlaying
            ? '2px solid #818cf8'
            : isFocused
              ? '1px solid #8b5cf6'
              : isSelected
                ? '1px solid rgba(139,92,246,0.3)'
                : '1px solid rgba(255,255,255,0.06)',
        opacity: u.isIncluded ? 1 : 0.5,
        boxShadow: isPlaying ? '0 0 12px rgba(99,102,241,0.3)' : undefined,
      }}
    >
      {isPlaying && (
        <div className="absolute top-0 left-0 bottom-0 w-1 bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
      )}
      {!isPlaying && isFocused && (
        <div className="absolute top-0 left-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
      )}

      <div className="flex items-center justify-between gap-3 mb-3 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onToggleSelect(u.utteranceId)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '24px', color: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.3)' }}
            >
              {isSelected ? 'check_box' : 'check_box_outline_blank'}
            </span>
          </button>

          <div className="min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ textDecoration: u.isIncluded ? 'none' : 'line-through' }}
            >
              {u.utteranceId.slice(0, 16)}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {u.pseudoId?.slice(0, 10) ?? '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
          >
            {u.qualityGrade}
          </span>

          <button
            onClick={() => onPlay(u.utteranceId, u.audioUrl)}
            disabled={!u.audioUrl}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors disabled:opacity-20"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '24px', color: isPlaying ? '#8b5cf6' : 'rgba(255,255,255,0.5)' }}
            >
              {isPlaying ? 'pause_circle' : 'play_circle'}
            </span>
          </button>

          <button
            onClick={() => onToggle(u.utteranceId, !u.isIncluded, u.isIncluded ? 'manual' : undefined)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '24px', color: u.isIncluded ? '#22c55e' : '#ef4444' }}
            >
              {u.isIncluded ? 'check_circle' : 'cancel'}
            </span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <span className="text-xs px-2.5 py-1 rounded-md" style={{ backgroundColor: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
          청크 #{u.sequenceInChunk ?? '—'}
        </span>

        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)' }}>person</span>
          <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {u.speakerId ?? '—'}
          </span>
          {speakerMeta && (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              ({speakerMeta})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)' }}>schedule</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {u.startSec.toFixed(1)}s ~ {u.endSec.toFixed(1)}s
          </span>
          <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
            ({formatDuration(u.durationSec)})
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs px-2.5 py-1 rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
          SNR {u.snrDb.toFixed(1)}dB
        </span>

        <span
          className="text-xs px-2.5 py-1 rounded-md"
          style={{
            backgroundColor: (u.beepMaskRatio ?? 0) >= 0.3 ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)',
            color: (u.beepMaskRatio ?? 0) >= 0.3 ? '#f97316' : 'rgba(255,255,255,0.6)',
          }}
        >
          beep {((u.beepMaskRatio ?? 0) * 100).toFixed(0)}%
        </span>

        {onPiiEdit && <PiiButton utterance={u} onPiiEdit={onPiiEdit} />}

        {reasonInfo && (
          <span
            className="text-xs px-2.5 py-1 rounded-md font-medium"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: reasonInfo.color }}
          >
            {reasonInfo.text}
          </span>
        )}
      </div>

      {showLabels && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {u.labels && LABEL_FIELDS.some(f => (u.labels as Record<string, unknown>)?.[f.key] != null) ? (
            LABEL_FIELDS.map(({ key, label }) => {
              const val = (u.labels as Record<string, unknown>)?.[key]
              if (val == null) return null
              return (
                <span
                  key={key}
                  className="text-xs px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
                >
                  {label}: {String(val)}
                </span>
              )
            })
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>라벨 없음</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function UtteranceReviewTable({
  utterances,
  onToggle,
  onFinalize,
  selectedIds,
  onToggleSelect,
  skuId,
  onPiiEdit,
  piiEditId,
  viewMode = 'card',
  onViewModeToggle,
  playback,
  onPlay,
  onStartContinuous,
  onStop,
  onTogglePause,
}: Props) {
  const showLabels = skuId === 'U-A02' || skuId === 'U-A03'
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: utterances.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (viewMode === 'card' ? 180 : 36),
    overscan: 10,
  })

  const summary = useMemo(() => {
    const included = utterances.filter(u => u.isIncluded)
    const totalDurationSec = included.reduce((acc, u) => acc + u.durationSec, 0)
    const excludedCount = utterances.length - included.length
    return {
      total: utterances.length,
      included: included.length,
      excluded: excludedCount,
      totalDurationMin: (totalDurationSec / 60).toFixed(1),
    }
  }, [utterances])

  const { focusedIndex, setFocusedIndex } = useKeyboardNavigation({
    itemCount: utterances.length,
    onToggleReview: (idx) => {
      const u = utterances[idx]
      onToggle(u.utteranceId, !u.isIncluded, u.isIncluded ? 'manual' : undefined)
    },
    onPlay: (idx) => {
      const u = utterances[idx]
      onPlay(u.utteranceId, u.audioUrl)
    },
    onToggleSelection: (idx) => {
      const u = utterances[idx]
      onToggleSelect(u.utteranceId)
    },
    onPiiEdit: (idx) => {
      if (onPiiEdit) onPiiEdit(utterances[idx].utteranceId)
    },
    onToggleViewMode: () => {
      if (onViewModeToggle) onViewModeToggle()
    },
    scrollToIndex: (idx) => rowVirtualizer.scrollToIndex(idx, { align: 'center' }),
    disabled: piiEditId !== null,
  })

  // 순차 재생 시 현재 재생 중인 발화로 자동 스크롤
  useEffect(() => {
    if (playback.mode === 'continuous' && playback.currentId) {
      const idx = utterances.findIndex(u => u.utteranceId === playback.currentId)
      if (idx !== -1) {
        rowVirtualizer.scrollToIndex(idx, { align: 'center' })
      }
    }
  }, [playback.currentId, playback.mode, utterances, rowVirtualizer])

  const currentUtterance = playback.currentId
    ? utterances.find(u => u.utteranceId === playback.currentId)
    : null

  return (
    <div className="space-y-4">
      {playback.mode === 'continuous' && (
        <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined${playback.status === 'playing' ? ' animate-pulse' : ''}`}>autoplay</span>
              <span className="text-sm font-bold">
                {playback.status === 'paused' ? '일시정지' : '순차 재생 중...'} ({playback.currentIndex + 1}/{playback.queue.length})
              </span>
              {currentUtterance?.chunkIndex != null && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-white/20 font-medium">
                  청크 #{currentUtterance.chunkIndex}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onTogglePause} className="p-1 hover:bg-white/20 rounded" title={playback.status === 'paused' ? '재생' : '일시정지'}>
                <span className="material-symbols-outlined">
                  {playback.status === 'paused' ? 'play_circle' : 'pause_circle'}
                </span>
              </button>
              <button onClick={onStop} className="p-1 hover:bg-white/20 rounded" title="정지">
                <span className="material-symbols-outlined">stop_circle</span>
              </button>
            </div>
          </div>
          {currentUtterance && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-indigo-100 flex-wrap">
              <span className="font-mono opacity-70">{currentUtterance.utteranceId.slice(0, 16)}</span>
              <span className="w-px h-3 bg-white/20" />
              {currentUtterance.speakerId && (
                <span>화자: {currentUtterance.speakerId}</span>
              )}
              {(currentUtterance.speakerGender || currentUtterance.speakerAgeBand) && (
                <span className="opacity-70">
                  ({[currentUtterance.speakerGender, currentUtterance.speakerAgeBand].filter(Boolean).join(' / ')})
                </span>
              )}
              <span className="w-px h-3 bg-white/20" />
              <span>등급 <strong>{currentUtterance.qualityGrade}</strong></span>
              <span className="w-px h-3 bg-white/20" />
              <span>{formatDuration(currentUtterance.durationSec)}</span>
              <span className="opacity-70">SNR {currentUtterance.snrDb.toFixed(1)}dB</span>
            </div>
          )}
        </div>
      )}

      {viewMode === 'table' ? (
        <UtteranceCompactTable
          utterances={utterances}
          selectedIds={selectedIds}
          playingId={playback.currentId}
          focusedIndex={focusedIndex}
          onToggleSelect={onToggleSelect}
          onToggleReview={onToggle}
          onPlay={onPlay}
          onPiiEdit={onPiiEdit || (() => {})}
          onFocus={setFocusedIndex}
          parentRef={parentRef}
        />
      ) : (
        <div
          ref={parentRef}
          className="overflow-y-auto pr-1"
          style={{ height: '640px' }}
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
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: '8px',
                  }}
                >
                  <UtteranceCard
                    utterance={u}
                    isSelected={selectedIds.has(u.utteranceId)}
                    isPiiEditing={piiEditId === u.utteranceId}
                    showLabels={showLabels}
                    playingId={playback.currentId}
                    isFocused={focusedIndex === virtualItem.index}
                    onToggleSelect={onToggleSelect}
                    onToggle={onToggle}
                    onPlay={onPlay}
                    onPiiEdit={onPiiEdit}
                    onFocus={() => setFocusedIndex(virtualItem.index)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Summary Bar */}
      <div className="flex items-center justify-between rounded-xl px-5 py-4 bg-[#1b1e2e]">
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>총 <strong className="text-white">{summary.total}</strong>개 발화</span>
          <span className="w-px h-4 bg-white/10" />
          <span>선택됨 <strong className="text-green-500">{summary.included}</strong>개</span>
          <span className="w-px h-4 bg-white/10" />
          <span>합계 <strong className="text-indigo-400">{summary.totalDurationMin}분</strong></span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onStartContinuous()}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <span className="material-symbols-outlined">play_arrow</span>
            순차 재생
          </button>

          {onFinalize && (
            <button
              onClick={onFinalize}
              disabled={summary.included === 0}
              className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-30 bg-indigo-600 hover:bg-indigo-700"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>package_2</span>
              패키징 확정
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
