import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { type ExportUtterance } from '../../types/export'

type Props = {
  utterances: ExportUtterance[]
  onToggle: (utteranceId: string, isIncluded: boolean, reason?: string) => void
  onAutoFilter: (type: 'short' | 'gradeC' | 'highBeep') => void
  onFinalize?: () => void
  onSelectionChange?: (selectedIds: Set<string>) => void
  skuId?: string
  onPiiEdit?: (utteranceId: string) => void
  piiEditId?: string | null
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

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#6b7280' }

const REASON_LABELS: Record<string, { text: string; color: string }> = {
  too_short: { text: '3초 미만', color: '#ef4444' },
  low_grade: { text: 'C등급', color: '#ef4444' },
  high_beep: { text: 'beep↑', color: '#ef4444' },
  manual: { text: '수동 제외', color: '#ef4444' },
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}초`
}

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
  onToggleSelect,
  onToggle,
  onPlay,
  onPiiEdit,
}: {
  utterance: ExportUtterance
  isSelected: boolean
  isPiiEditing: boolean
  showLabels: boolean
  playingId: string | null
  onToggleSelect: (id: string) => void
  onToggle: (id: string, isIncluded: boolean, reason?: string) => void
  onPlay: (id: string, audioUrl?: string) => void
  onPiiEdit?: (id: string) => void
}) {
  const u = utterance
  const gradeColor = GRADE_COLORS[u.qualityGrade] ?? '#6b7280'
  const reasonInfo = u.excludeReason ? REASON_LABELS[u.excludeReason] : null
  const isPlaying = playingId === u.utteranceId

  const speakerMeta = [u.speakerGender, u.speakerAgeBand].filter(Boolean).join(' / ')

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        backgroundColor: isPiiEditing
          ? 'rgba(239,68,68,0.12)'
          : !u.isIncluded
            ? 'rgba(239,68,68,0.06)'
            : isSelected
              ? 'rgba(139,92,246,0.08)'
              : '#1b1e2e',
        border: isPiiEditing
          ? '3px solid rgba(239,68,68,0.7)'
          : isSelected
            ? '1px solid rgba(139,92,246,0.3)'
            : '1px solid rgba(255,255,255,0.06)',
        opacity: u.isIncluded ? 1 : 0.5,
      }}
    >
      {/* Row 1: Header — checkbox, ID, grade, actions */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Checkbox */}
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

          {/* ID */}
          <div className="min-w-0">
            <p
              className="text-sm text-white font-medium truncate"
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
          {/* Grade badge */}
          <span
            className="text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
          >
            {u.qualityGrade}
          </span>

          {/* Play */}
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

          {/* Status toggle */}
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

      {/* Row 2: Meta info — chunk, speaker, range */}
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

      {/* Row 3: Quality metrics — SNR, beep, PII, exclude reason */}
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

      {/* Row 4: Labels (only for U-A02 / U-A03) */}
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

export default function UtteranceReviewTable({ utterances, onToggle, onAutoFilter, onFinalize, onSelectionChange, skuId, onPiiEdit, piiEditId }: Props) {
  const showLabels = skuId === 'U-A02' || skuId === 'U-A03'
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  useEffect(() => {
    onSelectionChange?.(selectedIds)
  }, [selectedIds, onSelectionChange])

  const autoFilterCounts = useMemo(() => ({
    short: utterances.filter(u => u.isIncluded && u.durationSec < 3).length,
    gradeC: utterances.filter(u => u.isIncluded && u.qualityGrade === 'C').length,
    highBeep: utterances.filter(u => u.isIncluded && u.beepMaskRatio >= 0.3).length,
  }), [utterances])

  const summary = useMemo(() => {
    const included = utterances.filter(u => u.isIncluded)
    const excluded = utterances.filter(u => !u.isIncluded)
    const autoExcluded = excluded.filter(u => u.excludeReason && u.excludeReason !== 'manual').length
    const manualExcluded = excluded.length - autoExcluded
    const totalDurationSec = included.reduce((acc, u) => acc + u.durationSec, 0)
    return {
      total: utterances.length,
      included: included.length,
      excluded: excluded.length,
      autoExcluded,
      manualExcluded,
      totalDurationMin: (totalDurationSec / 60).toFixed(1),
      totalDurationSec,
    }
  }, [utterances])

  const canFinalize = summary.included > 0

  const handleToggleSelect = useCallback((utteranceId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(utteranceId)) next.delete(utteranceId)
      else next.add(utteranceId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === utterances.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(utterances.map(u => u.utteranceId)))
    }
  }, [utterances, selectedIds.size])

  const handleBulkExclude = useCallback(() => {
    if (selectedIds.size === 0) return
    for (const id of selectedIds) {
      onToggle(id, false, 'manual')
    }
    setSelectedIds(new Set())
  }, [selectedIds, onToggle])

  const handleBulkInclude = useCallback(() => {
    if (selectedIds.size === 0) return
    for (const id of selectedIds) {
      onToggle(id, true)
    }
    setSelectedIds(new Set())
  }, [selectedIds, onToggle])

  const handlePlay = useCallback((utteranceId: string, audioUrl?: string) => {
    if (!audioUrl) return
    if (playingId === utteranceId) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.src = audioUrl
      audioRef.current.play().catch(() => {})
      setPlayingId(utteranceId)
    }
  }, [playingId])

  return (
    <div className="space-y-4">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onError={() => setPlayingId(null)}
      />

      {/* Auto Filter & Bulk Action Buttons */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>자동 필터:</span>
        <button
          onClick={() => onAutoFilter('short')}
          disabled={autoFilterCounts.short === 0}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
        >
          3초 미만 일괄 제외
          <span style={{ color: '#ef4444' }}>({autoFilterCounts.short})</span>
        </button>
        <button
          onClick={() => onAutoFilter('gradeC')}
          disabled={autoFilterCounts.gradeC === 0}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
        >
          Grade C 일괄 제외
          <span style={{ color: '#ef4444' }}>({autoFilterCounts.gradeC})</span>
        </button>
        <button
          onClick={() => onAutoFilter('highBeep')}
          disabled={autoFilterCounts.highBeep === 0}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
        >
          beep 30%+ 일괄 제외
          <span style={{ color: '#ef4444' }}>({autoFilterCounts.highBeep})</span>
        </button>

        <div className="w-px h-5" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />

        <button
          onClick={handleSelectAll}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)', color: '#a78bfa' }}
        >
          {selectedIds.size === utterances.length ? '전체 해제' : '전체 선택'}
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkExclude}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>remove_circle</span>
            선택 {selectedIds.size}건 제외
          </button>
        )}
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkInclude}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.15)', color: '#22c55e' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_circle</span>
            선택 {selectedIds.size}건 활성화
          </button>
        )}
      </div>

      {/* Card List */}
      <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
        {utterances.map(u => (
          <UtteranceCard
            key={u.utteranceId}
            utterance={u}
            isSelected={selectedIds.has(u.utteranceId)}
            isPiiEditing={piiEditId === u.utteranceId}
            showLabels={showLabels}
            playingId={playingId}
            onToggleSelect={handleToggleSelect}
            onToggle={onToggle}
            onPlay={handlePlay}
            onPiiEdit={onPiiEdit}
          />
        ))}
      </div>

      {/* Summary Bar */}
      <div
        className="flex items-center justify-between rounded-xl px-5 py-4"
        style={{ backgroundColor: '#1b1e2e' }}
      >
        <div className="flex items-center gap-4 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>총 <strong className="text-white">{summary.total}</strong>개 발화</span>
          <span className="w-px h-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>선택됨 <strong style={{ color: '#22c55e' }}>{summary.included}</strong>개</span>
          <span className="w-px h-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>제외 <strong style={{ color: '#ef4444' }}>{summary.excluded}</strong>개
            <span className="text-xs ml-1">(자동 {summary.autoExcluded} + 수동 {summary.manualExcluded})</span>
          </span>
          <span className="w-px h-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>합계 <strong style={{ color: '#8b5cf6' }}>{summary.totalDurationMin}분</strong></span>
        </div>

        {onFinalize && (
          <button
            onClick={onFinalize}
            disabled={!canFinalize}
            className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-30"
            style={{ backgroundColor: '#8b5cf6' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>package_2</span>
            패키징 확정
          </button>
        )}
      </div>
    </div>
  )
}
