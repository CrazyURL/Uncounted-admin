import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { type Session, type ReviewAction } from '../types/session'
import { loadAllSessions, saveAllSessions } from '../lib/sessionMapper'
import { maskSessionTitle } from '../lib/displayMask'
import { useToast } from '../lib/toastContext'
import { DURATION, EASE } from '../lib/motionTokens'
import { completeQuest } from '../lib/tutorialStore'
import { getSanitizeCache, sanitizeSession, applySanitizeResult, type SanitizeCacheEntry, type TranscriptPiiDetection } from '../lib/sanitizeCache'
import { loadTranscript } from '../lib/transcriptStore'
import { piiTypeLabel, type PiiDetection } from '../lib/piiDetector'
import { sanitizeAudio, type AudioSource } from '../lib/audioSanitizer'
import { formatDuration } from '../lib/earnings'
import AudioPlayer, { type AudioPlayerHandle } from '../components/domain/AudioPlayer'
import Illust3D from '../components/domain/Illust3D'

type FilterKey = 'all' | 'LOCKED' | 'REVIEWED'

const ACTION_OPTIONS: { action: ReviewAction; label: string; icon: string; desc: string }[] = [
  { action: 'MASK_TEXT_ONLY', label: '마스킹 및 beep 처리', icon: 'edit_off', desc: '텍스트 **** 마스킹 + 음성 1kHz beep 처리' },
  { action: 'EXCLUDE_SEGMENT', label: '구간 제거', icon: 'content_cut', desc: '해당 구간만 제거하고 나머지 공유' },
  { action: 'DO_NOT_SHARE', label: '공유 제외', icon: 'block', desc: '이 세션은 공유하지 않음' },
]

const expandVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: DURATION.medium, ease: EASE.decelerate },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: DURATION.short, ease: EASE.accelerate },
  },
}

const EXT_MIME: Record<string, string> = {
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
  ogg: 'audio/ogg', '3gp': 'audio/3gpp', aac: 'audio/aac',
  amr: 'audio/amr', flac: 'audio/flac',
}

export default function PiiReviewPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    loadAllSessions().then(async (all) => {
      let needsSave = false
      const autoProtect = localStorage.getItem('uncounted_pii_auto_protect') === 'on'

      for (const s of all) {
        if ((s.piiStatus ?? 'CLEAR') !== 'LOCKED') continue

        const cache = await getSanitizeCache(s.id)

        if (cache) {
          const hasTranscriptPii = cache.transcriptPiiDetections?.some(
            (td) => td.detections.some((d) => d.confidence >= 0.7),
          ) ?? false
          if (!hasTranscriptPii) {
            s.piiStatus = 'CLEAR'
            s.lockReason = null
            needsSave = true
            continue
          }
        } else {
          try {
            const entry = await sanitizeSession(s)
            const updated = applySanitizeResult(s, entry)
            Object.assign(s, updated)
            needsSave = true
          } catch {
            // 실패 시 잠금 상태 유지
          }
        }

        // 자동 보호 ON이고 아직 검토 안 된 LOCKED → 자동 MASK_TEXT_ONLY
        if (autoProtect && (s.piiStatus ?? 'CLEAR') === 'LOCKED' && !s.reviewAction) {
          s.reviewAction = 'MASK_TEXT_ONLY'
          s.piiStatus = 'REVIEWED'
          s.eligibleForShare = true
          needsSave = true
        }
      }

      if (needsSave) {
        await saveAllSessions(all)
      }

      const piiSessions = all.filter((s) => {
        const pii = s.piiStatus ?? 'CLEAR'
        return pii === 'LOCKED' || pii === 'REVIEWED' || pii === 'SUSPECT'
      })
      setSessions(piiSessions)
      setLoading(false)
    })
  }, [])

  const filtered = sessions.filter((s) => {
    if (filter === 'all') return true
    return (s.piiStatus ?? 'CLEAR') === filter
  })

  const lockedCount = sessions.filter((s) => (s.piiStatus ?? 'CLEAR') === 'LOCKED').length
  const reviewedCount = sessions.filter((s) => (s.piiStatus ?? 'CLEAR') === 'REVIEWED').length

  function getTabLabel(key: FilterKey): string {
    switch (key) {
      case 'all': return `전체 ${sessions.length > 0 ? sessions.length.toLocaleString() : ''}`
      case 'LOCKED': return `잠금 ${lockedCount > 0 ? lockedCount.toLocaleString() : ''}`
      case 'REVIEWED': return `검토완료 ${reviewedCount > 0 ? reviewedCount.toLocaleString() : ''}`
    }
  }

  async function handleSelectAction(sessionId: string, action: ReviewAction) {
    setSaving(true)

    const doNotShare = action === 'DO_NOT_SHARE'
    const updated = sessions.map((s) => {
      if (s.id !== sessionId) return s
      return {
        ...s,
        reviewAction: action,
        piiStatus: 'REVIEWED' as const,
        eligibleForShare: !doNotShare,
        ...(doNotShare ? {
          isPublic: false,
          visibilityStatus: 'PRIVATE' as const,
          visibilitySource: 'MANUAL' as const,
        } : {}),
      }
    })

    setSessions(updated)

    const all = await loadAllSessions()
    const merged = all.map((s) => {
      const match = updated.find((u) => u.id === s.id)
      return match ?? s
    })
    await saveAllSessions(merged)
    setSaving(false)
    showToast({ message: '검토 완료', icon: 'check_circle' })
    completeQuest('pii_review')
  }

  async function handleUndoDoNotShare(sessionId: string) {
    setSaving(true)

    const autoPiiProtect = localStorage.getItem('uncounted_pii_auto_protect') === 'on'
    const updated = sessions.map((s) => {
      if (s.id !== sessionId) return s
      // 자동 보호 ON이면 마스킹 처리 상태로 복원, 아니면 잠금으로 되돌림
      if (autoPiiProtect) {
        return {
          ...s,
          reviewAction: 'MASK_TEXT_ONLY' as const,
          piiStatus: 'REVIEWED' as const,
          eligibleForShare: true,
        }
      }
      return {
        ...s,
        reviewAction: null,
        piiStatus: 'LOCKED' as const,
        eligibleForShare: false,
      }
    })

    setSessions(updated)

    const all = await loadAllSessions()
    const merged = all.map((s) => {
      const match = updated.find((u) => u.id === s.id)
      return match ?? s
    })
    await saveAllSessions(merged)
    setSaving(false)
    showToast({ message: '공유 제외 해제됨 — 다시 검토해 주세요', icon: 'undo' })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 min-h-full" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Illust3D fallback="autorenew" src="/assets/3d/A-4.png" size={72} />
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>잠금 세션 불러오는 중...</p>
      </div>
    )
  }

  function renderEmpty() {
    if (sessions.length === 0) {
      return (
        <div className="flex flex-col items-center py-12 gap-3">
          <Illust3D fallback="verified_user" src="/assets/3d/B-2.jpg" size={64} />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>민감정보가 탐지되지 않았습니다</p>
          <p className="text-xs text-center px-8 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            파이프라인 실행 후 민감정보가 자동으로 점검됩니다.
          </p>
        </div>
      )
    }

    if (filter === 'LOCKED') {
      return (
        <div className="flex flex-col items-center py-12 gap-3">
          <Illust3D fallback="check_circle" src="/assets/3d/D-3.png" size={64} />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>모든 잠금 세션을 검토했습니다</p>
          <p className="text-xs text-center px-8 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            검토 완료 탭에서 처리 결과를 확인할 수 있습니다.
          </p>
        </div>
      )
    }

    if (filter === 'REVIEWED') {
      return (
        <div className="flex flex-col items-center py-12 gap-3">
          <Illust3D fallback="pending_actions" src="/assets/3d/D-1.png" size={64} />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>아직 검토한 세션이 없습니다</p>
          <p className="text-xs text-center px-8 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            잠금 탭에서 세션을 선택하고 처리 방법을 지정하면 여기에 표시됩니다.
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center py-12 gap-3">
        <Illust3D fallback="verified_user" src="/assets/3d/B-2.jpg" size={64} />
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>검토할 세션이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="min-h-full px-4 py-4 flex flex-col gap-4 pb-24" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 요약 헤더 */}
      <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Illust3D fallback="shield" src="/assets/3d/F-5.jpg" size={28} />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>민감정보 보호 현황</p>
          {reviewedCount > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              보호 완료 {reviewedCount.toLocaleString()}건
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
          {reviewedCount > 0
            ? `${reviewedCount.toLocaleString()}건의 민감정보가 자동으로 보호되었습니다. 개별 세션을 열어 확인하거나 공유 제외할 수 있습니다.`
            : '탐지된 민감정보를 확인하고 처리 방법을 선택할 수 있습니다.'}
        </p>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2">
        {(['all', 'LOCKED', 'REVIEWED'] as FilterKey[]).map((key) => {
          const active = filter === key
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                  : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }
              }
            >
              {getTabLabel(key)}
            </button>
          )
        })}
      </div>

      {/* 세션 목록 */}
      {filtered.length === 0 ? renderEmpty() : (
        filtered.map((session) => (
          <PiiSessionCard
            key={session.id}
            session={session}
            onSelectAction={handleSelectAction}
            onUndoDoNotShare={handleUndoDoNotShare}
            saving={saving}
          />
        ))
      )}

    </div>
  )
}

// ── PII 텍스트 하이라이트 헬퍼 ──────────────────────────────────────────────

function highlightPiiInSentence(text: string, detections: PiiDetection[]): React.ReactNode {
  if (detections.length === 0) return text

  const sorted = [...detections].sort((a, b) => a.startIndex - b.startIndex)
  const parts: React.ReactNode[] = []
  let lastEnd = 0

  sorted.forEach((d, i) => {
    if (d.startIndex > lastEnd) {
      parts.push(text.slice(lastEnd, d.startIndex))
    }
    parts.push(
      <span
        key={i}
        className="font-semibold px-0.5 rounded"
        style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
      >
        {d.masked}
      </span>,
    )
    lastEnd = d.endIndex
  })

  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd))
  }

  return <>{parts}</>
}

// ── 전체 텍스트 PII 렌더링 ──────────────────────────────────────────────────

type AbsolutePiiRange = {
  start: number
  end: number
  masked: string
  type: string
}

function collectAbsoluteRanges(detections: TranscriptPiiDetection[]): AbsolutePiiRange[] {
  const ranges: AbsolutePiiRange[] = []
  for (const td of detections) {
    for (const d of td.detections) {
      ranges.push({
        start: td.charOffsetInTranscript + d.startIndex,
        end: td.charOffsetInTranscript + d.endIndex,
        masked: d.masked,
        type: d.type,
      })
    }
  }
  return ranges.sort((a, b) => a.start - b.start)
}

/** 전사 텍스트 전문에 PII를 하이라이트 또는 마스킹 처리하여 렌더 */
function renderTranscriptWithPii(
  text: string,
  ranges: AbsolutePiiRange[],
  mode: 'highlight' | 'masked',
): React.ReactNode {
  if (ranges.length === 0) return text

  const parts: React.ReactNode[] = []
  let lastEnd = 0

  ranges.forEach((r, i) => {
    if (r.start > lastEnd) {
      parts.push(text.slice(lastEnd, r.start))
    }
    if (mode === 'highlight') {
      parts.push(
        <span
          key={i}
          className="font-semibold px-0.5 rounded"
          style={{ backgroundColor: 'var(--color-danger-dim)', color: 'var(--color-danger)' }}
        >
          {text.slice(r.start, r.end)}
        </span>,
      )
    } else {
      parts.push(
        <span
          key={i}
          className="font-semibold px-0.5 rounded"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
        >
          {r.masked}
        </span>,
      )
    }
    lastEnd = r.end
  })

  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd))
  }

  return <>{parts}</>
}

// ── 개별 세션 카드 ──────────────────────────────────────────────────────────

function PiiSessionCard({
  session,
  onSelectAction,
  onUndoDoNotShare,
  saving,
}: {
  session: Session
  onSelectAction: (sessionId: string, action: ReviewAction) => void
  onUndoDoNotShare: (sessionId: string) => void
  saving: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [cacheEntry, setCacheEntry] = useState<SanitizeCacheEntry | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 오디오
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const playerRef = useRef<AudioPlayerHandle>(null)

  // 전사 텍스트
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptView, setTranscriptView] = useState<'original' | 'masked'>('original')

  // 처리 미리듣기
  const [previewAction, setPreviewAction] = useState<ReviewAction | null>(null)
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null)
  const [processingPreview, setProcessingPreview] = useState(false)

  const piiStatus = session.piiStatus ?? 'CLEAR'
  const isReviewed = piiStatus === 'REVIEWED'

  // 확장 시 데이터 로드
  useEffect(() => {
    if (!expanded) return
    let cancelled = false

    async function loadData() {
      setDetailLoading(true)

      // 1) 정제 캐시 로드 (전체 탐지 결과)
      const entry = await getSanitizeCache(session.id)
      if (!cancelled) setCacheEntry(entry)

      // 2) 전사 텍스트 로드
      const text = await loadTranscript(session.id)
      if (!cancelled) setTranscript(text)

      // 3) 오디오 URL 로드
      if (session.audioUrl) {
        if (!cancelled) setAudioUrl(session.audioUrl)
      } else {
        const filePaths: Record<string, string> = JSON.parse(
          localStorage.getItem('uncounted_file_paths') ?? '{}',
        )
        const callRecordId = session.callRecordId ?? filePaths[session.id]
        if (callRecordId && Capacitor.isNativePlatform()) {
          if (!cancelled) setAudioLoading(true)
          try {
            const { data } = await Filesystem.readFile({
              path: callRecordId,
              directory: Directory.ExternalStorage,
            })
            const ext = callRecordId.split('.').pop()?.toLowerCase() ?? 'm4a'
            const mime = EXT_MIME[ext] ?? 'audio/mp4'
            if (!cancelled) setAudioUrl(`data:${mime};base64,${data}`)
          } catch {
            // 오디오 로드 실패
          } finally {
            if (!cancelled) setAudioLoading(false)
          }
        }
      }

      if (!cancelled) setDetailLoading(false)
    }

    loadData()
    return () => { cancelled = true }
  }, [expanded, session.id, session.audioUrl, session.callRecordId])

  // blob URL 정리
  useEffect(() => {
    return () => {
      if (processedAudioUrl && processedAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(processedAudioUrl)
      }
    }
  }, [processedAudioUrl])

  // PII 마커 계산
  const piiMarkers = useMemo(() => {
    if (!cacheEntry) return undefined
    const markers: { timeSec: number; durationSec?: number }[] = []
    for (const td of (cacheEntry.transcriptPiiDetections ?? [])) {
      for (const d of td.detections) {
        markers.push({
          timeSec: td.estimatedTimeSec,
          durationSec: Math.max(0.5, d.matched.length / 3),
        })
      }
    }
    return markers.length > 0 ? markers : undefined
  }, [cacheEntry])

  // PII 타임 인터벌 계산 (beep 처리용)
  const piiIntervals = useMemo((): [number, number][] => {
    if (!cacheEntry?.transcriptPiiDetections?.length) return []
    return cacheEntry.transcriptPiiDetections.flatMap((td) =>
      td.detections.map((d) => {
        const durationEstimate = Math.max(0.5, d.matched.length / 3)
        return [
          Math.max(0, td.estimatedTimeSec - 0.25),
          td.estimatedTimeSec + durationEstimate,
        ] as [number, number]
      }),
    )
  }, [cacheEntry])

  // 전체 텍스트 PII 절대좌표 (전사 텍스트 뷰어용)
  const absoluteRanges = useMemo(
    () => collectAbsoluteRanges(cacheEntry?.transcriptPiiDetections ?? []),
    [cacheEntry],
  )

  // 처리 미리듣기
  const handlePreview = useCallback(async (action: ReviewAction) => {
    if (action === 'DO_NOT_SHARE') {
      onSelectAction(session.id, action)
      return
    }

    setPreviewAction(action)

    // 트랜스크립트 PII가 있고 오디오 사용 가능한 경우만 미리듣기 생성
    if (piiIntervals.length > 0 && (session.callRecordId || session.audioUrl)) {
      setProcessingPreview(true)
      try {
        const source: AudioSource = {
          callRecordId: session.callRecordId,
          audioUrl: session.audioUrl,
          sessionId: session.id,
        }
        const result = await sanitizeAudio(source, piiIntervals)
        const blob = new Blob([result.wav], { type: 'audio/wav' })

        // Android WebView에서 blob URL이 안될 수 있으므로 base64 폴백
        if (Capacitor.isNativePlatform()) {
          const reader = new FileReader()
          reader.onloadend = () => {
            setProcessedAudioUrl(reader.result as string)
            setProcessingPreview(false)
          }
          reader.readAsDataURL(blob)
        } else {
          setProcessedAudioUrl(URL.createObjectURL(blob))
          setProcessingPreview(false)
        }
      } catch {
        setProcessingPreview(false)
      }
    }
  }, [session.id, session.callRecordId, session.audioUrl, piiIntervals, onSelectAction])

  function handleConfirmAction() {
    if (!previewAction) return
    onSelectAction(session.id, previewAction)
    if (processedAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(processedAudioUrl)
    setProcessedAudioUrl(null)
    setPreviewAction(null)
  }

  function handleCancelPreview() {
    if (processedAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(processedAudioUrl)
    setProcessedAudioUrl(null)
    setPreviewAction(null)
  }

  // 음성 텍스트(트랜스크립트) PII만 표시 — 제목/파일명 PII는 자동 마스킹 처리되므로 검토 불필요
  const transcriptDetections = cacheEntry?.transcriptPiiDetections ?? []
  const totalDetections = transcriptDetections.reduce((sum, td) => sum + td.detections.length, 0)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* 세션 헤더 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start gap-3"
      >
        <span
          className="material-symbols-outlined text-lg mt-0.5"
          style={{ color: isReviewed ? 'var(--color-accent)' : 'var(--color-text-sub)' }}
        >
          {isReviewed ? 'check_circle' : 'lock'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
            {maskSessionTitle(session.title)}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{session.date}</span>
            {totalDetections > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}
              >
                PII {totalDetections.toLocaleString()}건
              </span>
            )}
            {isReviewed && session.reviewAction && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
              >
                {session.reviewAction === 'EXCLUDE_SEGMENT' && '구간 제거'}
                {session.reviewAction === 'MASK_TEXT_ONLY' && '마스킹 및 beep 처리'}
                {session.reviewAction === 'DO_NOT_SHARE' && '공유 제외'}
              </span>
            )}
          </div>
        </div>
        <span
          className="material-symbols-outlined text-base mt-1 transition-transform"
          style={{ color: 'var(--color-text-tertiary)', transform: expanded ? 'rotate(180deg)' : 'none' }}
        >
          expand_more
        </span>
      </button>

      {/* 확장: 탐지 상세 + 오디오 + 액션 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              {detailLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>탐지 결과 불러오는 중...</span>
                </div>
              ) : (
                <>
                  {/* 탐지 요약 */}
                  {totalDetections > 0 && (
                    <p className="text-xs mt-3 mb-2" style={{ color: 'var(--color-text-sub)' }}>
                      음성 텍스트에서 PII {totalDetections.toLocaleString()}건 탐지
                    </p>
                  )}

                  {/* 전사 텍스트 전문 뷰어 (원본 / 보안처리 후 토글) */}
                  {transcript && totalDetections > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mt-2 mb-2">
                        <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>description</span>
                        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>
                          전사 텍스트
                        </p>
                        <div className="ml-auto flex rounded-full overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                          <button
                            onClick={() => setTranscriptView('original')}
                            className="px-2.5 py-1 text-[10px] font-semibold"
                            style={
                              transcriptView === 'original'
                                ? { backgroundColor: 'var(--color-danger-dim)', color: 'var(--color-danger)' }
                                : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
                            }
                          >
                            PII 표시
                          </button>
                          <button
                            onClick={() => setTranscriptView('masked')}
                            className="px-2.5 py-1 text-[10px] font-semibold"
                            style={
                              transcriptView === 'masked'
                                ? { backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }
                                : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
                            }
                          >
                            보안처리 후
                          </button>
                        </div>
                      </div>
                      <div
                        className="max-h-40 overflow-y-auto rounded-lg p-3"
                        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
                      >
                        <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-sub)' }}>
                          {renderTranscriptWithPii(transcript, absoluteRanges, transcriptView === 'original' ? 'highlight' : 'masked')}
                        </p>
                      </div>
                      {transcriptView === 'masked' && (
                        <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>verified_user</span>
                          개인정보가 **** 마스킹 처리된 텍스트입니다
                        </p>
                      )}
                    </div>
                  )}

                  {/* 탐지 상세 목록 (개별 PII + 타임스탬프 재생) */}
                  {transcriptDetections.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] uppercase tracking-widest mb-2 mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                        탐지 상세
                      </p>
                      {transcriptDetections.map((td, i) => (
                        <div
                          key={i}
                          className="py-2"
                          style={i < transcriptDetections.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            {td.detections.map((d, j) => (
                              <span
                                key={j}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                              >
                                {piiTypeLabel(d.type)}
                              </span>
                            ))}
                            <button
                              onClick={() => playerRef.current?.seekTo(td.estimatedTimeSec)}
                              className="ml-auto flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-accent)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>play_circle</span>
                              {formatDuration(Math.round(td.estimatedTimeSec))}
                            </button>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                            {highlightPiiInSentence(td.sentenceText, td.detections)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 캐시 없거나 탐지 0건이면 안내 */}
                  {!cacheEntry && (
                    <p className="text-xs py-3 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                      정제 캐시가 없습니다. 공개 준비를 실행해 주세요.
                    </p>
                  )}
                  {cacheEntry && totalDetections === 0 && (
                    <p className="text-xs py-3 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                      상세 탐지 정보가 없습니다 (기존 잠금 기록).
                    </p>
                  )}

                  {/* 오디오 플레이어 */}
                  {(audioUrl || audioLoading) && (
                    <div className="mt-3">
                      {audioLoading ? (
                        <div className="flex items-center justify-center py-4 gap-2 rounded-xl" style={{ backgroundColor: 'var(--color-muted)' }}>
                          <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
                          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>오디오 로딩 중...</span>
                        </div>
                      ) : audioUrl ? (
                        <AudioPlayer
                          ref={playerRef}
                          duration={session.duration}
                          audioUrl={audioUrl}
                          piiMarkers={piiMarkers}
                        />
                      ) : null}
                    </div>
                  )}

                  {/* 미검토: 전체 액션 선택 / 검토 완료: 공유 제외 오버라이드만 */}
                  {!previewAction && (
                    <div className="mt-3">
                      {!isReviewed ? (
                        <>
                          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                            처리 방법 선택
                          </p>
                          <div className="flex flex-col gap-2">
                            {ACTION_OPTIONS.map((opt) => (
                              <button
                                key={opt.action}
                                onClick={() => handlePreview(opt.action)}
                                disabled={saving}
                                className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                                style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
                              >
                                <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-accent)' }}>
                                  {opt.icon}
                                </span>
                                <div className="flex-1">
                                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{opt.label}</p>
                                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{opt.desc}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : session.reviewAction !== 'DO_NOT_SHARE' ? (
                        <button
                          onClick={() => onSelectAction(session.id, 'DO_NOT_SHARE')}
                          disabled={saving}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                          style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
                        >
                          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>block</span>
                          <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>이 세션을 공유 제외하기</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onUndoDoNotShare(session.id)}
                          disabled={saving}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                          style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
                        >
                          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>undo</span>
                          <span className="text-xs" style={{ color: 'var(--color-accent)' }}>공유 제외 해제하고 다시 검토</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 처리 미리듣기 상태 */}
                  {previewAction && (
                    <div className="mt-3">
                      <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>verified_user</span>
                          <p className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                            {previewAction === 'MASK_TEXT_ONLY' ? '마스킹 및 beep 처리 결과' : '구간 제거 결과'}
                          </p>
                        </div>

                        {/* 마스킹 텍스트 미리보기 */}
                        {transcript && absoluteRanges.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--color-text-sub)' }}>
                              텍스트 보안처리 결과
                            </p>
                            <div
                              className="max-h-28 overflow-y-auto rounded-lg p-2.5"
                              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                            >
                              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-sub)' }}>
                                {renderTranscriptWithPii(transcript, absoluteRanges, 'masked')}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* beep 처리된 오디오 미리듣기 */}
                        {processingPreview && (
                          <div className="flex items-center gap-2 py-2">
                            <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
                            <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>음성 beep 처리 중...</span>
                          </div>
                        )}
                        {processedAudioUrl && (
                          <div className="mt-2">
                            <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--color-text-sub)' }}>
                              음성 보안처리 결과 (beep 대체)
                            </p>
                            <AudioPlayer
                              duration={session.duration}
                              audioUrl={processedAudioUrl}
                            />
                          </div>
                        )}
                        {!processingPreview && !processedAudioUrl && piiIntervals.length === 0 && (
                          <p className="text-xs py-2" style={{ color: 'var(--color-text-sub)' }}>
                            음성 PII가 없어 오디오 처리 없이 바로 적용됩니다.
                          </p>
                        )}

                        {/* 안심 메시지 */}
                        {(processedAudioUrl || (absoluteRanges.length > 0 && transcript)) && (
                          <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-success)' }}>check_circle</span>
                            <p className="text-[10px]" style={{ color: 'var(--color-success)' }}>
                              개인정보가 텍스트 **** 마스킹 + 음성 beep으로 대체되었습니다
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelPreview}
                          className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}
                        >
                          취소
                        </button>
                        <button
                          onClick={handleConfirmAction}
                          disabled={processingPreview}
                          className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                          style={
                            !processingPreview
                              ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                              : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
                          }
                        >
                          확인 및 적용
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
