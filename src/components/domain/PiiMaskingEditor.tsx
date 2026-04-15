import { useState, useEffect, useRef, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.js'
import {
  type PiiInterval,
  loadUtterancePiiApi,
  saveUtterancePiiApi,
  applyUtteranceMaskApi,
  loadUtteranceAudioBlobApi,
  previewUtteranceMaskApi,
  checkUtteranceOriginalBackupApi,
  restoreUtteranceOriginalApi,
} from '../../lib/api/admin'

type Props = {
  utteranceId: string
  jobId?: string
  onMaskApplied?: () => void
}

interface MaskAuditInfo {
  piiMasked: boolean
  piiMaskedAt: string | null
  piiMaskedBy: string | null
  piiMaskedByEmail: string | null
  piiMaskVersion: number
}

const PII_TYPES = ['이름', '전화번호', '주소', '계좌번호', '주민번호', '기타'] as const
const MASK_TYPES = [
  { value: 'beep' as const, label: 'Beep' },
  { value: 'silence' as const, label: '무음' },
]

const PII_COLORS: Record<string, string> = {
  이름: 'rgba(239,68,68,0.3)',
  전화번호: 'rgba(245,158,11,0.3)',
  주소: 'rgba(59,130,246,0.3)',
  계좌번호: 'rgba(168,85,247,0.3)',
  주민번호: 'rgba(236,72,153,0.3)',
  기타: 'rgba(107,114,128,0.3)',
}

function generateId(): string {
  return `pii_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function PiiMaskingEditor({ utteranceId, jobId, onMaskApplied }: Props) {
  const [maskAudit, setMaskAudit] = useState<MaskAuditInfo | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)

  const [intervals, setIntervals] = useState<PiiInterval[]>([])
  const [selectedIntervalId, setSelectedIntervalId] = useState<string | null>(null)
  const [newPiiType, setNewPiiType] = useState<string>('이름')
  const [newMaskType, setNewMaskType] = useState<'beep' | 'silence'>('beep')
  const newPiiTypeRef = useRef(newPiiType)
  useEffect(() => { newPiiTypeRef.current = newPiiType }, [newPiiType])
  const newMaskTypeRef = useRef(newMaskType)
  useEffect(() => { newMaskTypeRef.current = newMaskType }, [newMaskType])

  const handleMaskTypeChange = useCallback((maskType: 'beep' | 'silence') => {
    setNewMaskType(maskType)
    newMaskTypeRef.current = maskType
    // 기존 intervals의 maskType 전체 변경 (신규 기본값 변경이 전체 적용)
    setIntervals(prev => prev.map(i => ({ ...i, maskType })))
  }, [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPreviewActive, setIsPreviewActive] = useState(false)

  // Load audio + PII data
  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController

    async function init() {
      setLoading(true)
      setError(null)
      try {
        const [audioBlob, piiResult, backupResult] = await Promise.all([
          loadUtteranceAudioBlobApi(utteranceId, signal),
          loadUtterancePiiApi(utteranceId, signal),
          checkUtteranceOriginalBackupApi(utteranceId, signal),
        ])
        if (!signal.aborted) setHasBackup(backupResult.data?.hasBackup ?? false)

        if (signal.aborted) return

        if (!audioBlob || audioBlob.size === 0) {
          setError('오디오를 가져올 수 없습니다')
          setLoading(false)
          return
        }

        const piiData = piiResult.data?.piiIntervals ?? []
        setIntervals(piiData)
        if (piiResult.data) {
          setMaskAudit({
            piiMasked: piiResult.data.piiMasked ?? false,
            piiMaskedAt: piiResult.data.piiMaskedAt ?? null,
            piiMaskedBy: piiResult.data.piiMaskedBy ?? null,
            piiMaskedByEmail: piiResult.data.piiMaskedByEmail ?? null,
            piiMaskVersion: piiResult.data.piiMaskVersion ?? 0,
          })
        }
        // 로드된 intervals의 첫 번째 maskType으로 전역 기본값 동기화 (intervals는 건드리지 않음)
        if (piiData.length > 0 && piiData[0].maskType) {
          newMaskTypeRef.current = piiData[0].maskType
          setNewMaskType(piiData[0].maskType)
        }

        // Init wavesurfer
        if (containerRef.current) {
          const regions = RegionsPlugin.create()
          regionsRef.current = regions

          const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(139,92,246,0.4)',
            progressColor: '#8b5cf6',
            cursorColor: '#a78bfa',
            height: 120,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            plugins: [regions],
          })

          // Blob으로 로드 (CORS 우회)
          ws.loadBlob(audioBlob)

          wavesurferRef.current = ws

          ws.on('play', () => setIsPlaying(true))
          ws.on('pause', () => setIsPlaying(false))
          ws.on('finish', () => setIsPlaying(false))

          // 초기 1회만 fire — handleSave/loadBlob 재호출 시 regions 중복 추가 방지
          ws.once('ready', () => {
            // Add existing PII regions
            for (const interval of piiData) {
              regions.addRegion({
                id: interval.id,
                start: interval.startSec,
                end: interval.endSec,
                color: PII_COLORS[interval.piiType] ?? PII_COLORS['기타'],
                content: interval.piiType,
                drag: true,
                resize: true,
              })
            }
            setLoading(false)
          })

          // Handle region creation via drag
          regions.enableDragSelection({
            color: 'rgba(139,92,246,0.2)',
          })

          regions.on('region-created', (region: Region) => {
            // Skip if it's a region we added programmatically
            const exists = piiData.some(i => i.id === region.id)
            if (exists) return

            const currentPiiType = newPiiTypeRef.current
            const currentMaskType = newMaskTypeRef.current

            const newInterval: PiiInterval = {
              id: region.id || generateId(),
              startSec: region.start,
              endSec: region.end,
              piiType: currentPiiType,
              maskType: currentMaskType,
              source: 'manual',
            }

            region.setOptions({
              color: PII_COLORS[currentPiiType] ?? PII_COLORS['기타'],
              content: currentPiiType,
            })

            setIntervals(prev => [...prev, newInterval])
          })

          regions.on('region-updated', (region: Region) => {
            setIntervals(prev =>
              prev.map(i =>
                i.id === region.id
                  ? { ...i, startSec: region.start, endSec: region.end }
                  : i
              )
            )
          })

          regions.on('region-clicked', (region: Region) => {
            setSelectedIntervalId(region.id)
          })
        }
      } catch (err) {
        if (!signal.aborted) {
          const message = err instanceof Error ? err.message : '초기화 실패'
          setError(message)
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      abortController.abort()
      wavesurferRef.current?.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
      // wavesurfer.destroy()가 남기는 DOM 잔존 제거 (resetKey 재마운트 시 라벨 중첩 방지)
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [utteranceId, resetKey])

  const handlePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause()
  }, [])

  const handleDeleteInterval = useCallback((intervalId: string) => {
    setIntervals(prev => prev.filter(i => i.id !== intervalId))
    const regions = regionsRef.current
    if (regions) {
      const allRegions = regions.getRegions()
      const target = allRegions.find(r => r.id === intervalId)
      target?.remove()
    }
    if (selectedIntervalId === intervalId) {
      setSelectedIntervalId(null)
    }
  }, [selectedIntervalId])

  const handleUpdateInterval = useCallback((intervalId: string, updates: Partial<PiiInterval>) => {
    setIntervals(prev =>
      prev.map(i => (i.id === intervalId ? { ...i, ...updates } : i))
    )
    // Update region color if piiType changed
    if (updates.piiType && regionsRef.current) {
      const allRegions = regionsRef.current.getRegions()
      const target = allRegions.find(r => r.id === intervalId)
      if (target) {
        target.setOptions({
          color: PII_COLORS[updates.piiType] ?? PII_COLORS['기타'],
          content: updates.piiType,
        })
      }
    }
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveUtterancePiiApi(utteranceId, intervals)
      if (result.error) throw new Error(result.error)

      if (intervals.length > 0) {
        const previewBlob = await previewUtteranceMaskApi(utteranceId)
        await wavesurferRef.current?.loadBlob(previewBlob)
        setIsPreviewActive(true)
      } else {
        const originalBlob = await loadUtteranceAudioBlobApi(utteranceId)
        await wavesurferRef.current?.loadBlob(originalBlob)
        setIsPreviewActive(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장 실패'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [utteranceId, intervals])

  const handleReloadAudio = useCallback(async () => {
    setError(null)
    try {
      const blob = await loadUtteranceAudioBlobApi(utteranceId)
      await wavesurferRef.current?.loadBlob(blob)
      setIsPreviewActive(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '원본 복구 실패'
      setError(message)
    }
  }, [utteranceId])

  const handleRestoreOriginal = useCallback(async () => {
    setRestoring(true)
    setError(null)
    try {
      const result = await restoreUtteranceOriginalApi(utteranceId)
      if (result.error) throw new Error(result.error)
      // 서버 저장된 PII 구간 비움 (재적용 시 깨끗한 시작점)
      await saveUtterancePiiApi(utteranceId, [])
      // 에디터 전체 remount — 새 wavesurfer 인스턴스로 listener/state 모두 재초기화
      setIntervals([])
      setSelectedIntervalId(null)
      setResetKey(k => k + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : '원본 초기화 실패'
      setError(message)
    } finally {
      setRestoring(false)
    }
  }, [utteranceId])

  const handleApplyMask = useCallback(async () => {
    setApplying(true)
    setError(null)
    try {
      const saveResult = await saveUtterancePiiApi(utteranceId, intervals)
      if (saveResult.error) throw new Error(`PII 저장 실패: ${saveResult.error}`)
      const applyResult = await applyUtteranceMaskApi(utteranceId, jobId)
      if (applyResult.error) throw new Error(`마스킹 적용 실패: ${applyResult.error}`)
      if (applyResult.data) {
        setMaskAudit({
          piiMasked: applyResult.data.piiMasked,
          piiMaskedAt: applyResult.data.piiMaskedAt,
          piiMaskedBy: applyResult.data.piiMaskedBy,
          piiMaskedByEmail: applyResult.data.piiMaskedByEmail,
          piiMaskVersion: applyResult.data.piiMaskVersion,
        })
      }
      setHasBackup(true)
      onMaskApplied?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : '마스킹 적용 실패'
      setError(message)
    } finally {
      setApplying(false)
    }
  }, [utteranceId, intervals, jobId, onMaskApplied])

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={{ color: '#ef4444' }}>security</span>
          <span className="text-xs font-medium text-white">PII 마스킹 에디터</span>
        </div>
        <div className="flex items-center gap-2">
          {hasBackup && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              마스킹됨
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {intervals.length}개 구간
            {intervals.filter(i => i.source === 'auto').length > 0 && (
              <> (자동 {intervals.filter(i => i.source === 'auto').length})</>
            )}
          </span>
        </div>
      </div>

      {maskAudit?.piiMasked ? (
        <div
          className="px-4 py-2 flex items-center gap-2 text-[10px]"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(34,197,94,0.04)' }}
        >
          <span className="material-symbols-outlined text-xs" style={{ color: '#22c55e' }}>verified_user</span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>
            마지막 적용:{' '}
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>
              {maskAudit.piiMaskedByEmail ?? maskAudit.piiMaskedBy ?? 'unknown'}
            </span>
            {' · '}
            {maskAudit.piiMaskedAt ? new Date(maskAudit.piiMaskedAt).toLocaleString('ko-KR', { hour12: false }) : ''}
            {maskAudit.piiMaskVersion >= 2 && (
              <span className="ml-1 px-1 rounded" style={{ backgroundColor: '#22c55e', color: '#000' }}>
                v{maskAudit.piiMaskVersion}
              </span>
            )}
          </span>
        </div>
      ) : hasBackup ? (
        <div
          className="px-4 py-2 flex items-center gap-2 text-[10px]"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(245,158,11,0.04)' }}
        >
          <span className="material-symbols-outlined text-xs" style={{ color: '#f59e0b' }}>history</span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>
            이전에 마스킹된 발화 (작업자 정보 없음 — 036 마이그레이션 이전)
          </span>
        </div>
      ) : null}

      {/* Waveform */}
      <div className="px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center h-[120px]">
            <span className="material-symbols-outlined animate-spin text-xl" style={{ color: '#8b5cf6' }}>progress_activity</span>
          </div>
        )}
        <div ref={containerRef} style={{ display: loading ? 'none' : 'block' }} />
      </div>

      {/* Playback + New region defaults */}
      <div className="px-4 pb-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handlePlayPause}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg disabled:opacity-30"
          style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
          {isPlaying ? '일시정지' : '재생'}
        </button>

        <div className="w-px h-4" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />

        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>새 구간 기본값:</span>
        <select
          value={newPiiType}
          onChange={e => setNewPiiType(e.target.value)}
          className="text-[10px] px-2 py-1 rounded-lg outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {PII_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={newMaskType}
          onChange={e => handleMaskTypeChange(e.target.value as 'beep' | 'silence')}
          className="text-[10px] px-2 py-1 rounded-lg outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {MASK_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Interval list */}
      <div className="px-4 py-3 space-y-1.5 max-h-[200px] overflow-y-auto">
        {intervals.length === 0 && (
          <p className="text-[10px] text-center py-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
            파형 위에서 드래그하여 PII 구간을 추가하세요
          </p>
        )}
        {intervals.map(interval => {
          const isSelected = interval.id === selectedIntervalId
          return (
            <div
              key={interval.id}
              onClick={() => setSelectedIntervalId(interval.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
              style={{
                backgroundColor: isSelected ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                border: isSelected ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
              }}
            >
              {/* Color dot */}
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: PII_COLORS[interval.piiType] ?? PII_COLORS['기타'] }}
              />

              {/* Time range */}
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {interval.startSec.toFixed(2)}s – {interval.endSec.toFixed(2)}s
              </span>

              {/* PII type selector */}
              <select
                value={interval.piiType}
                onChange={e => handleUpdateInterval(interval.id, { piiType: e.target.value })}
                onClick={e => e.stopPropagation()}
                className="text-[10px] px-1.5 py-0.5 rounded outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {PII_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* Mask type selector */}
              <select
                value={interval.maskType}
                onChange={e => handleUpdateInterval(interval.id, { maskType: e.target.value as 'beep' | 'silence' })}
                onClick={e => e.stopPropagation()}
                className="text-[10px] px-1.5 py-0.5 rounded outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {MASK_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {/* Source badge */}
              <span
                className="text-[8px] px-1 py-0.5 rounded flex-shrink-0"
                style={{
                  backgroundColor: interval.source === 'auto' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)',
                  color: interval.source === 'auto' ? '#60a5fa' : '#a78bfa',
                }}
              >
                {interval.source === 'auto' ? '자동' : '수동'}
              </span>

              {/* Delete */}
              <button
                onClick={e => { e.stopPropagation(); handleDeleteInterval(interval.id) }}
                className="ml-auto flex-shrink-0"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)' }}>close</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-2">
          <p className="text-[10px]" style={{ color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleRestoreOriginal}
          disabled={!hasBackup || restoring || loading}
          className="text-xs px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
        >
          {restoring ? '복원 중...' : '원본 초기화'}
        </button>
        <button
          onClick={handleReloadAudio}
          disabled={!isPreviewActive || loading}
          className="text-xs px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
        >
          원본 복구
        </button>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex-1 text-xs py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={handleApplyMask}
          disabled={applying || loading || intervals.length === 0}
          className="flex-1 text-xs py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-30"
          style={{ backgroundColor: '#ef4444' }}
        >
          <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>security</span>
          {applying ? '적용 중...' : '마스킹 적용'}
        </button>
      </div>
    </div>
  )
}
