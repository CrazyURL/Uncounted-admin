import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { type ExportUtterance } from '../../types/export'

type Props = {
  utterances: ExportUtterance[]
  onToggle: (utteranceId: string, isIncluded: boolean, reason?: string) => void
  onAutoFilter: (type: 'short' | 'gradeC' | 'highBeep') => void
  onFinalize?: () => void
  requestedMinutes?: number
}

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#6b7280' }

const REASON_LABELS: Record<string, { text: string; color: string }> = {
  too_short: { text: '3초 미만', color: '#ef4444' },
  low_grade: { text: 'C등급', color: '#ef4444' },
  high_beep: { text: 'beep↑', color: '#ef4444' },
  manual: { text: '수동 제외', color: '#ef4444' },
}

export default function UtteranceReviewTable({ utterances, onToggle, onAutoFilter, onFinalize, requestedMinutes }: Props) {
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

  // Counts for auto-filter buttons
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

  const canFinalize = requestedMinutes != null
    ? summary.totalDurationSec / 60 >= requestedMinutes
    : summary.included > 0

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

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}초`
  }

  return (
    <div className="space-y-3">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onError={() => setPlayingId(null)}
      />

      {/* Auto Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>자동 필터:</span>
        <button
          onClick={() => onAutoFilter('short')}
          disabled={autoFilterCounts.short === 0}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
        >
          3초 미만 일괄 제외
          <span style={{ color: '#ef4444' }}>({autoFilterCounts.short}개)</span>
        </button>
        <button
          onClick={() => onAutoFilter('gradeC')}
          disabled={autoFilterCounts.gradeC === 0}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
        >
          Grade C 일괄 제외
          <span style={{ color: '#ef4444' }}>({autoFilterCounts.gradeC}개)</span>
        </button>
        <button
          onClick={() => onAutoFilter('highBeep')}
          disabled={autoFilterCounts.highBeep === 0}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
        >
          beep 30%+ 일괄 제외
          <span style={{ color: '#ef4444' }}>({autoFilterCounts.highBeep}개)</span>
        </button>
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-colors"
          style={{ backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)', color: '#a78bfa' }}
        >
          {selectedIds.size === utterances.length ? '전체 해제' : '전체 선택'}
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkExclude}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>remove_circle</span>
            선택 {selectedIds.size}건 제외
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
        {/* Header */}
        <div
          className="grid items-center gap-2 px-3 py-2 text-[10px] font-medium"
          style={{
            gridTemplateColumns: '28px 1fr 56px 56px 44px 40px 52px 52px 60px 32px',
            color: 'rgba(255,255,255,0.4)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span />
          <span>발화ID</span>
          <span>화자</span>
          <span>구간</span>
          <span>길이</span>
          <span>등급</span>
          <span>SNR</span>
          <span>beep%</span>
          <span>상태</span>
          <span>재생</span>
        </div>

        {/* Rows */}
        <div className="max-h-[480px] overflow-y-auto">
          {utterances.map(u => {
            const gradeColor = GRADE_COLORS[u.qualityGrade] ?? '#6b7280'
            const reasonInfo = u.excludeReason ? REASON_LABELS[u.excludeReason] : null
            const isSelected = selectedIds.has(u.utteranceId)

            return (
              <div
                key={u.utteranceId}
                className="grid items-center gap-2 px-3 py-1.5 transition-colors"
                style={{
                  gridTemplateColumns: '28px 1fr 56px 56px 44px 40px 52px 52px 60px 32px',
                  backgroundColor: !u.isIncluded ? 'rgba(239,68,68,0.04)' : isSelected ? 'rgba(139,92,246,0.06)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  opacity: u.isIncluded ? 1 : 0.4,
                }}
              >
                {/* Checkbox */}
                <button onClick={() => handleToggleSelect(u.utteranceId)} className="flex items-center justify-center">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.2)' }}>
                    {isSelected ? 'check_box' : 'check_box_outline_blank'}
                  </span>
                </button>

                {/* ID + pseudo */}
                <div className="min-w-0">
                  <p
                    className="text-[10px] text-white truncate"
                    style={{ textDecoration: u.isIncluded ? 'none' : 'line-through' }}
                  >
                    {u.utteranceId.slice(0, 12)}
                  </p>
                  <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{u.pseudoId.slice(0, 8)}</p>
                </div>

                {/* Speaker */}
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {u.pseudoId === 'self' ? '본인' : '상대'}
                </span>

                {/* Range */}
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {u.startSec.toFixed(1)}-{u.endSec.toFixed(1)}
                </span>

                {/* Duration */}
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {formatDuration(u.durationSec)}
                </span>

                {/* Grade badge */}
                <span
                  className="text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded"
                  style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
                >
                  {u.qualityGrade}
                </span>

                {/* SNR */}
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {u.snrDb.toFixed(1)}dB
                </span>

                {/* Beep */}
                <span
                  className="text-[10px]"
                  style={{ color: u.beepMaskRatio >= 0.3 ? '#f97316' : 'rgba(255,255,255,0.5)' }}
                >
                  {(u.beepMaskRatio * 100).toFixed(0)}%
                </span>

                {/* Status */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onToggle(u.utteranceId, !u.isIncluded, u.isIncluded ? 'manual' : undefined)}
                    className="material-symbols-outlined"
                    style={{ fontSize: '14px', color: u.isIncluded ? '#22c55e' : '#ef4444' }}
                  >
                    {u.isIncluded ? 'check_circle' : 'cancel'}
                  </button>
                  {reasonInfo && (
                    <span className="text-[8px] font-medium" style={{ color: reasonInfo.color }}>
                      {reasonInfo.text}
                    </span>
                  )}
                </div>

                {/* Play */}
                <button
                  onClick={() => handlePlay(u.utteranceId, u.audioUrl)}
                  disabled={!u.audioUrl}
                  className="flex items-center justify-center disabled:opacity-20"
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px', color: playingId === u.utteranceId ? '#8b5cf6' : 'rgba(255,255,255,0.4)' }}
                  >
                    {playingId === u.utteranceId ? 'pause_circle' : 'play_circle'}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary Bar (bottom) */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ backgroundColor: '#1b1e2e' }}
      >
        <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>총 <strong className="text-white">{summary.total}</strong>개 발화</span>
          <span className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>선택됨 <strong style={{ color: '#22c55e' }}>{summary.included}</strong>개</span>
          <span className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>제외 <strong style={{ color: '#ef4444' }}>{summary.excluded}</strong>개
            <span className="text-[10px]"> (자동 {summary.autoExcluded} + 수동 {summary.manualExcluded})</span>
          </span>
          <span className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span>합계 <strong style={{ color: '#8b5cf6' }}>{summary.totalDurationMin}분</strong></span>
        </div>

        {onFinalize && (
          <button
            onClick={onFinalize}
            disabled={!canFinalize}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-30"
            style={{ backgroundColor: '#8b5cf6' }}
          >
            <span className="material-symbols-outlined text-sm">package_2</span>
            패키징 확정
          </button>
        )}
      </div>
    </div>
  )
}
