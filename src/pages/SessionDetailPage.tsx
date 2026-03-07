import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { type Session } from '../types/session'
import { formatDuration } from '../lib/earnings'
import { consentStatusIcon } from '../lib/consentEngine'
import { loadAllSessions, saveAllSessions } from '../lib/sessionMapper'
import AudioPlayer from '../components/domain/AudioPlayer'
import { fetchSession } from '../lib/api/sessions'
import { useSttJob, useSttGlobal, prioritizeTranscription, getSttMode, setSttMode } from '../lib/sttEngine'
import { loadTranscriptFull } from '../lib/transcriptStore'
import { detectPiiSentences, type PiiSentence } from '../lib/piiDetector'
import Illust3D from '../components/domain/Illust3D'
import {
  createInvitation,
  shareInvitation,
  hasAgreedInvitation,
} from '../lib/consentInvitation'
import { isEnrolled, getVerificationResult } from '../lib/embeddingEngine'
import { trackFunnel } from '../lib/funnelLogger'
import { useVerificationProgress } from '../lib/verificationEngine'
import { getCachedResult, diarizeSession } from '../lib/diarizationEngine'
import {
  muteCounterpartyAudio,
  getCachedMutedAudio,
  maskPeerTranscript,
  extractPeerIntervals,
  type MaskedTranscriptResult,
} from '../lib/speakerMuter'

function deriveGrade(qa: number): 'A' | 'B' | 'C' {
  if (qa >= 80) return 'A'
  if (qa >= 60) return 'B'
  return 'C'
}

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPublic, setIsPublic] = useState(false)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [piiSentences, setPiiSentences] = useState<PiiSentence[]>([])
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const [invitationStatus, setInvitationStatus] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<string | null>(null)
  const [mutedAudioUrl, setMutedAudioUrl] = useState<string | null>(null)
  const [isMuting, setIsMuting] = useState(false)
  const [maskedTranscript, setMaskedTranscript] = useState<MaskedTranscriptResult | null>(null)
  const sttJob = useSttJob(sessionId)
  const sttGlobal = useSttGlobal()
  const verifyProgress = useVerificationProgress()

  useEffect(() => {
    async function load() {
      let sess: Session | null = null

      // 1) 로컬 스토어 우선 (IDB — verifiedSpeaker/consentStatus 등 로컬 전용 데이터 보존)
      const all = await loadAllSessions()
      sess = all.find((s) => s.id === sessionId) ?? null

      // 2) 로컬에 없으면 API 폴백
      if (!sess && sessionId && import.meta.env.VITE_API_URL) {
        try {
          const { data, error } = await fetchSession(sessionId)
          if (!error && data) {
            sess = data
          }
        } catch {
          // 연결 실패
        }
      }

      // 3) 검증 캐시 방어 적용 — IDB/Supabase에 반영 안 된 경우 캐시에서 복원
      if (sess && !sess.verifiedSpeaker && sessionId) {
        const cached = getVerificationResult(sessionId)
        if (cached?.isVerified) {
          const consent = sess.consentStatus === 'both_agreed' ? 'both_agreed' as const : 'user_only' as const
          sess = { ...sess, verifiedSpeaker: true, consentStatus: consent }
          // IDB에도 반영 (다음 로드 시 캐시 일관성 유지)
          const patched = all.map((s) => s.id === sessionId ? sess! : s)
          saveAllSessions(patched).catch(() => {})
        }
      }

      if (sess) {
        setSession(sess)
        setIsPublic(sess.isPublic)
      }
      setLoading(false)
    }
    load()
  }, [sessionId])

  // 백그라운드 검증 엔진이 이 세션을 검증 완료하면 즉시 반영
  useEffect(() => {
    if (!session || session.verifiedSpeaker || !sessionId) return
    // 이 세션이 방금 검증되었는지 확인
    if (verifyProgress.lastVerifiedId === sessionId) {
      const consent = session.consentStatus === 'both_agreed' ? 'both_agreed' as const : 'user_only' as const
      setSession({ ...session, verifiedSpeaker: true, consentStatus: consent })
      return
    }
    // 다른 세션이 검증된 경우에도 캐시에서 이 세션 확인
    if (verifyProgress.verified === 0) return
    const cached = getVerificationResult(sessionId)
    if (cached?.isVerified) {
      const consent = session.consentStatus === 'both_agreed' ? 'both_agreed' as const : 'user_only' as const
      setSession({ ...session, verifiedSpeaker: true, consentStatus: consent })
    }
  }, [verifyProgress.verified, verifyProgress.lastVerifiedId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return
    if (session.audioUrl) {
      setProcessedUrl(session.audioUrl)
      return
    }
    const filePaths: Record<string, string> = JSON.parse(
      localStorage.getItem('uncounted_file_paths') ?? '{}'
    )
    const callRecordId = session.callRecordId ?? filePaths[session.id]
    if (!Capacitor.isNativePlatform() || !callRecordId) return

    let cancelled = false

    const EXT_MIME: Record<string, string> = {
      m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
      ogg: 'audio/ogg', '3gp': 'audio/3gpp', aac: 'audio/aac',
      amr: 'audio/amr', flac: 'audio/flac',
    }

    async function loadAudio() {
      setProcessing(true)

      try {
        const { data } = await Filesystem.readFile({
          path: callRecordId,
          directory: Directory.ExternalStorage,
        })
        if (cancelled) return
        const ext = callRecordId.split('.').pop()?.toLowerCase() ?? 'm4a'
        const mime = EXT_MIME[ext] ?? 'audio/mp4'
        setProcessedUrl(`data:${mime};base64,${data}`)
        setProcessing(false)
        return
      } catch {
        if (cancelled) return
      }

      try {
        const { uri } = await Filesystem.getUri({
          path: callRecordId,
          directory: Directory.ExternalStorage,
        })
        if (!cancelled) setProcessedUrl(Capacitor.convertFileSrc(uri))
      } catch {
        // 모두 실패
      } finally {
        if (!cancelled) setProcessing(false)
      }
    }

    loadAudio()

    return () => {
      cancelled = true
      setProcessedUrl(null)
      setProcessing(false)
    }
  }, [session])

  // 캐시된 트랜스크립트 로드 + 없으면 자동 추출 시작
  useEffect(() => {
    if (!sessionId) return
    loadTranscriptFull(sessionId).then((data) => {
      if (data) {
        setTranscript(data.text)
        setSummary(data.summary ?? null)
        setPiiSentences(detectPiiSentences(data.text))
      }
    })
  }, [sessionId])

  // 트랜스크립트 없고 오디오 있으면 자동 STT 시작 (STT 모드 on일 때만)
  useEffect(() => {
    if (!session || transcript !== null) return
    if (getSttMode() !== 'on') return
    if (sttJob && sttJob.status !== 'error' && sttJob.status !== 'done' && sttJob.status !== 'queued') return
    const callRecordId = session.callRecordId ?? JSON.parse(localStorage.getItem('uncounted_file_paths') ?? '{}')[session.id]
    if (!callRecordId) return
    prioritizeTranscription(session.id, callRecordId)
  }, [session, transcript]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sttJob?.status === 'done' && sessionId) {
      loadTranscriptFull(sessionId).then((data) => {
        if (data) {
          setTranscript(data.text)
          setSummary(data.summary ?? null)
          setPiiSentences(detectPiiSentences(data.text))
        }
      })
    }
  }, [sttJob?.status, sessionId])

  // ── 상대방 음성 무음 처리 (consentStatus === 'user_only') ──────────────
  useEffect(() => {
    if (!session || !sessionId) return
    if (session.consentStatus !== 'user_only') {
      setMutedAudioUrl(null)
      return
    }
    if (!processedUrl) return

    let cancelled = false

    async function applyMute() {
      // 1) IDB 캐시 확인 (빠른 경로)
      const cached = await getCachedMutedAudio(sessionId!)
      if (cached && !cancelled) {
        setMutedAudioUrl(cached)
        return
      }

      // 2) 다이어라이제이션 결과 확인/실행
      let diarization = getCachedResult(sessionId!)
      if (!diarization || diarization.status !== 'done') {
        const callRecordId = session?.callRecordId ?? JSON.parse(
          localStorage.getItem('uncounted_file_paths') ?? '{}',
        )[session?.id ?? '']
        if (!callRecordId) return
        setIsMuting(true)
        try {
          diarization = await diarizeSession(sessionId!, callRecordId)
        } catch {
          if (!cancelled) setIsMuting(false)
          return
        }
      }
      if (cancelled || !diarization.userSpeakerId) {
        if (!cancelled) setIsMuting(false)
        return
      }

      // 3) 오디오 바이너리 → 무음 처리
      setIsMuting(true)
      try {
        let audioBuffer: ArrayBuffer
        if (processedUrl!.startsWith('data:')) {
          const base64 = processedUrl!.split(',')[1]
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          audioBuffer = bytes.buffer
        } else {
          const resp = await fetch(processedUrl!)
          audioBuffer = await resp.arrayBuffer()
        }
        if (cancelled) return

        const result = await muteCounterpartyAudio(sessionId!, audioBuffer, diarization)
        if (!cancelled && result.dataUrl) {
          setMutedAudioUrl(result.dataUrl)
        }
      } catch (err) {
        console.error('[speakerMuter] mute failed:', err)
      } finally {
        if (!cancelled) setIsMuting(false)
      }
    }

    applyMute()
    return () => { cancelled = true }
  }, [session?.consentStatus, session?.id, processedUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 트랜스크립트 마스킹 (consentStatus === 'user_only') ─────────────────
  useEffect(() => {
    if (!session || !sessionId) return
    if (session.consentStatus !== 'user_only') {
      setMaskedTranscript(null)
      return
    }
    if (!transcript) return

    const diarization = getCachedResult(sessionId)
    if (!diarization || diarization.status !== 'done' || !diarization.userSpeakerId) return

    const peerIntervals = extractPeerIntervals(diarization)
    if (peerIntervals.length === 0) return

    loadTranscriptFull(sessionId).then((data) => {
      if (!data) return
      const result = maskPeerTranscript(data.text, data.words, peerIntervals)
      setMaskedTranscript(result)
    })
  }, [session?.consentStatus, sessionId, transcript]) // eslint-disable-line react-hooks/exhaustive-deps

  function getCallRecordId(): string | null {
    if (!session) return null
    const filePaths: Record<string, string> = JSON.parse(
      localStorage.getItem('uncounted_file_paths') ?? '{}',
    )
    return session.callRecordId ?? filePaths[session.id] ?? null
  }

  function handleTranscribe() {
    if (!session) return
    if (sttJob && sttJob.status !== 'error' && sttJob.status !== 'queued' && sttJob.status !== 'done') return
    const callRecordId = getCallRecordId()
    if (!callRecordId) return
    // STT 모드가 꺼져있으면 무시 (내정보에서 켜도록 안내는 UI에서 처리)
    if (getSttMode() !== 'on') return
    prioritizeTranscription(session.id, callRecordId)
  }

  function handleRetranscribe() {
    if (!session) return
    if (sttJob && sttJob.status !== 'error' && sttJob.status !== 'queued' && sttJob.status !== 'done') return
    const callRecordId = getCallRecordId()
    if (!callRecordId) return
    setTranscript(null)
    prioritizeTranscription(session.id, callRecordId, true)
  }

  /** STT 중지 */
  function handleSttStop() {
    setSttMode('off')
  }

  async function handleToggleVisibility() {
    if (!session) return
    const next = !isPublic
    setIsPublic(next)
    trackFunnel(next ? 'consent_session_on' : 'consent_session_off', { sessionId: session.id })
    const today = new Date().toISOString().slice(0, 10)
    const patch = {
      isPublic: next,
      visibilityStatus: (next ? 'PUBLIC_CONSENTED' : 'PRIVATE') as Session['visibilityStatus'],
      visibilitySource: 'MANUAL' as Session['visibilitySource'],
      visibilityChangedAt: today,
    }
    try {
      const updated = { ...session, ...patch }
      setSession(updated)
      const all = await loadAllSessions()
      const patched = all.map((s) => s.id === session.id ? { ...s, ...patch } : s)
      await saveAllSessions(patched)
    } catch {
      setIsPublic(!next)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 px-4">
        <Illust3D fallback="hourglass_top" src="/assets/3d/A-4.png" size={72} />
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>세션 로딩 중...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 px-4">
        <Illust3D fallback="search_off" src="/assets/3d/D-2.png" size={80} />
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>세션을 찾을 수 없습니다</p>
        <button onClick={() => navigate('/assets')} className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
          자산 목록으로 돌아가기
        </button>
      </div>
    )
  }

  const m = session.audioMetrics
  const qa = session.qaScore ?? 0
  const grade = deriveGrade(qa)
  const effectiveMins = m?.effectiveMinutes ?? Math.round(session.duration / 60 * 0.75)
  const canAccessContent = session.consentStatus === 'user_only' || session.consentStatus === 'both_agreed'

  return (
    <div className="min-h-full px-5 py-5 flex flex-col gap-5" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 세션 정보 */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-start gap-2">
          <h2 className="font-semibold text-base flex-1" style={{ color: 'var(--color-text)' }}>{session.title}</h2>
          {session.isPiiCleaned && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              비식별화 완료
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            {session.date}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span className="material-symbols-outlined text-sm">schedule</span>
            {formatDuration(session.duration)}
          </span>
          {session.chunkCount > 0 && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{session.chunkCount.toLocaleString()}개 청크</span>
          )}
        </div>
      </div>

      {canAccessContent ? (<>
      {/* 오디오 플레이어 */}
      {processing ? (
        <div
          className="rounded-xl p-5 flex items-center gap-3"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
          <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>비식별화 처리 중...</span>
        </div>
      ) : isMuting ? (
        <div
          className="rounded-xl p-5 flex items-center gap-3"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
          <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>상대방 음성 제거 중...</span>
        </div>
      ) : processedUrl ? (
        session.consentStatus === 'user_only' && !mutedAudioUrl ? (
          <div
            className="rounded-xl p-5 flex items-center gap-3"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
            <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>상대방 음성 분리 중...</span>
          </div>
        ) : (
          <AudioPlayer
            duration={session.duration}
            audioUrl={
              session.consentStatus === 'user_only' && mutedAudioUrl
                ? mutedAudioUrl
                : processedUrl
            }
          />
        )
      ) : (
        <div
          className="rounded-xl p-5 flex items-center gap-3"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>audio_file</span>
          <div>
            <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>음원 파일 없음</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>기기에서 파일이 삭제되었거나 접근할 수 없습니다</p>
          </div>
        </div>
      )}

      {/* 전사 텍스트 (자산 가치 향상) */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {transcript && session.consentStatus === 'user_only' && !maskedTranscript ? (
          <div className="px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
            <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>상대방 발화 마스킹 처리 중...</span>
          </div>
        ) : transcript ? (
          <>
            {/* 헤더 + 프리뷰 */}
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>
                  description
                </span>
                <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-text)' }}>
                  전사 텍스트
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                >
                  음성+텍스트 자산
                </span>
                {maskedTranscript && maskedTranscript.maskedWordCount > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}
                  >
                    상대방 {maskedTranscript.maskedWordCount.toLocaleString()}단어 제거
                  </span>
                )}
              </div>
              {/* 텍스트 프리뷰: 요약 있으면 요약, 없으면 앞부분 */}
              {summary && session.consentStatus !== 'user_only' ? (
                <div>
                  <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>요약</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                    {summary}
                  </p>
                </div>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                  {(() => {
                    const t = maskedTranscript?.maskedText ?? transcript
                    return t.length > 120 ? t.slice(0, 120) + '...' : t
                  })()}
                </p>
              )}
              {/* PII 경고 (있을 경우만) */}
              {piiSentences.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-warning)' }}>
                    shield
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
                    민감정보 {piiSentences.length.toLocaleString()}건 탐지 — 민감정보 검토 탭에서 확인하세요
                  </span>
                </div>
              )}
            </div>
            {/* 상세보기 토글 */}
            <button
              onClick={() => setShowFullTranscript(!showFullTranscript)}
              className="w-full flex items-center justify-center gap-1 py-2 border-t"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span className="text-[11px] font-medium" style={{ color: 'var(--color-accent)' }}>
                {showFullTranscript ? '접기' : '전체 텍스트 보기'}
              </span>
              <span
                className="material-symbols-outlined text-sm transition-transform"
                style={{
                  color: 'var(--color-accent)',
                  transform: showFullTranscript ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                expand_more
              </span>
            </button>
            {showFullTranscript && (
              <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <p
                  className="mt-3 text-xs leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--color-text-sub)' }}
                >
                  {maskedTranscript?.maskedText ?? transcript}
                </p>
                <button
                  onClick={handleRetranscribe}
                  className="mt-3 text-[10px] font-medium px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}
                >
                  재추출
                </button>
              </div>
            )}
          </>
        ) : sttJob?.status === 'error' ? (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-danger)' }}>
                error
              </span>
              <p className="text-sm flex-1" style={{ color: 'var(--color-text-sub)' }}>
                {sttJob.message}
              </p>
            </div>
            <button
              onClick={handleTranscribe}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-accent)' }}
            >
              다시 시도
            </button>
          </div>
        ) : sttJob && sttJob.status !== 'done' && sttJob.status !== 'queued' ? (
          /* 현재 처리 중 (reading/resampling/download/transcribing) */
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>
                autorenew
              </span>
              <div className="flex-1">
                <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
                  {sttJob.message}
                </p>
                {sttJob.progress !== undefined && sttJob.status === 'download' && (
                  <div className="mt-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(sttJob.progress * 100)}%`,
                        backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {/* 전체 진행률 */}
            {sttGlobal.totalEnqueued > 1 && (
              <p className="text-[10px] mt-2 ml-8" style={{ color: 'var(--color-text-tertiary)' }}>
                전체 {sttGlobal.completedCount.toLocaleString()}/{sttGlobal.totalEnqueued.toLocaleString()} 완료
              </p>
            )}
          </div>
        ) : sttJob?.status === 'queued' ? (
          /* 큐 대기 중 — 진척률 표시 */
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>
                hourglass_top
              </span>
              <div className="flex-1">
                <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
                  대기 중
                  {sttGlobal.totalEnqueued > 0 && (
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      ({sttGlobal.completedCount.toLocaleString()}/{sttGlobal.totalEnqueued.toLocaleString()} 완료)
                    </span>
                  )}
                </p>
                {sttGlobal.totalEnqueued > 0 && (
                  <div className="mt-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((sttGlobal.completedCount / sttGlobal.totalEnqueued) * 100)}%`,
                        backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  </div>
                )}
              </div>
              {sttGlobal.mode === 'on' && (
                <button
                  onClick={handleSttStop}
                  className="text-[10px] font-medium px-2 py-1 rounded-md"
                  style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}
                >
                  중지
                </button>
              )}
            </div>
          </div>
        ) : getSttMode() === 'on' ? (
          /* 초기 상태 — 텍스트 추출 버튼 */
          <button
            onClick={handleTranscribe}
            className="w-full flex items-center gap-2 px-4 py-3"
          >
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>
              mic
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
              텍스트 추출
            </span>
            <span className="text-[10px] ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
              (Moonshine · 최초 ~28MB 다운로드)
            </span>
          </button>
        ) : (
          /* STT 꺼짐 — 설정 안내 */
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>mic_off</span>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              텍스트 추출이 꺼져 있습니다 — 내정보 &gt; 데이터 설정에서 켜주세요
            </span>
          </div>
        )}
      </div>
      </>) : (
        /* 잠금 — 오디오/전사 미공개 */
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--color-muted)' }}
            >
              <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-text-tertiary)' }}>lock</span>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>콘텐츠 보호</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>법적 보호를 위해 잠겨 있습니다</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--color-text-sub)' }}>
            통화 녹음에는 상대방 음성이 포함되어 있어, 오디오 재생과 전사 텍스트는
            본인 인증 또는 상대방 동의 전까지 열람할 수 없습니다.
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-base mt-0.5" style={{ color: 'var(--color-accent)' }}>record_voice_over</span>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>내 목소리 인증</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  상대방 음성 자동 제거 후, 내 목소리만 미리 듣기 가능
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-base mt-0.5" style={{ color: 'var(--color-accent)' }}>group</span>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>상대방 동의</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  전체 오디오 및 전사 텍스트 풀 버전 열람
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 품질 리포트 */}
      {m && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>
              analytics
            </span>
            <span className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>품질 리포트</span>
            <span
              className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              {grade}등급
            </span>
          </div>

          {/* 유효발화 요약 */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2.5 text-center" style={{ backgroundColor: 'var(--color-muted)' }}>
                <p className="font-bold text-sm leading-none mb-0.5" style={{ color: 'var(--color-text)' }}>{effectiveMins}분</p>
                <p className="text-[9px] leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>유효 발화</p>
              </div>
              <div className="rounded-lg p-2.5 text-center" style={{ backgroundColor: 'var(--color-muted)' }}>
                <p className="font-bold text-sm leading-none mb-0.5" style={{ color: 'var(--color-text)' }}>{qa}</p>
                <p className="text-[9px] leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>품질 점수</p>
              </div>
            </div>
          </div>

          {/* 기술 지표 그리드 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { icon: 'volume_up', label: 'SNR', value: `${m.snrDb} dB`, good: m.snrDb >= 25 },
              { icon: 'speed', label: 'Bitrate', value: `${m.bitrate} kbps`, good: m.bitrate >= 128 },
              { icon: 'graphic_eq', label: 'Sample Rate', value: `${(m.sampleRate / 1000).toFixed(1)} kHz`, good: m.sampleRate >= 44100 },
              { icon: 'headphones', label: 'Channel', value: m.channels === 2 ? 'Stereo' : 'Mono', good: m.channels === 2 },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--color-muted)' }}
              >
                <span
                  className="material-symbols-outlined text-base flex-shrink-0"
                  style={{ color: item.good ? 'var(--color-success)' : 'var(--color-warning)' }}
                >
                  {item.icon}
                </span>
                <div>
                  <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 무음/클리핑 바 */}
          <div className="flex flex-col gap-1.5">
            {[
              {
                label: '무음 비율',
                value: m.silenceRatio,
                display: `${(m.silenceRatio * 100).toFixed(1)}%`,
                bad: m.silenceRatio > 0.3,
              },
              {
                label: '클리핑 비율',
                value: m.clippingRatio * 20,
                display: `${(m.clippingRatio * 100).toFixed(2)}%`,
                bad: m.clippingRatio > 0.005,
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[10px] w-16 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, item.value * 100)}%`,
                      backgroundColor: item.bad ? 'var(--color-danger)' : 'var(--color-success)',
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-medium w-10 text-right flex-shrink-0"
                  style={{ color: item.bad ? 'var(--color-danger)' : 'var(--color-success)' }}
                >
                  {item.display}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 가치 범위 보기 링크 */}
      <button
        onClick={() => navigate('/value')}
        className="w-full rounded-2xl py-4 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
        style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
      >
        <span className="material-symbols-outlined text-lg">query_stats</span>
        가치 범위 보기
      </button>

      {/* 라벨 현황 */}
      {session.labels ? (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>label</span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>라벨 완료</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const LABEL_KEY_KO: Record<string, string> = {
                relationship: '관계', purpose: '목적', domain: '도메인',
                tone: '톤', noise: '소음', primarySpeechAct: '대화행위',
                speechActEvents: '발생 태그', interactionMode: '대화 방식',
              }
              return Object.entries(session.labels!).map(([k, v]) => {
                if (!v) return null
                const display = Array.isArray(v) ? v.join(', ') : String(v)
                return (
                  <div key={k} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{LABEL_KEY_KO[k] ?? k}</p>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{display}</p>
                  </div>
                )
              })
            })()}
          </div>
          <button
            onClick={() => navigate(`/value/label/${session.id}`)}
            className="w-full mt-3 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}
          >
            <span className="material-symbols-outlined text-base">edit</span>
            라벨 수정
          </button>
        </div>
      ) : (
        <button
          onClick={() => navigate(`/value/label/${session.id}`)}
          className="w-full rounded-2xl py-4 font-semibold flex items-center justify-center gap-2 transition-colors"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          <span className="material-symbols-outlined text-xl">edit_note</span>
          라벨링으로 준비도 올리기
        </button>
      )}

      {/* 공개 상태 (읽기 전용 뱃지 + 전환 링크) */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <span
          className="material-symbols-outlined text-lg"
          style={{ color: isPublic ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
        >
          {isPublic ? 'lock_open' : 'lock'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {isPublic ? '공개' : session.piiStatus === 'LOCKED' || session.piiStatus === 'SUSPECT' ? '검토 필요' : '비공개'}
          </p>
          <button
            onClick={handleToggleVisibility}
            className="text-[10px] mt-0.5"
            style={{ color: 'var(--color-accent)' }}
          >
            {isPublic ? '이 세션 비공개 전환' : '다시 공개로 전환'}
          </button>
        </div>
      </div>

      {/* 판매 가능 상태 */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* 현재 상태 배지 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-base" style={{
            color: session.consentStatus === 'both_agreed' ? 'var(--color-success)'
              : session.consentStatus === 'user_only' ? 'var(--color-accent)'
              : 'var(--color-text-tertiary)',
          }}>
            {consentStatusIcon(session.consentStatus)}
          </span>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {session.consentStatus === 'both_agreed'
              ? '전체 음성 판매 가능'
              : session.consentStatus === 'user_only'
              ? '내 목소리만 판매 가능'
              : '메타데이터만 판매 가능'}
          </p>
        </div>

        {/* 상태별 설명 */}
        <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-sub)' }}>
          {session.consentStatus === 'both_agreed'
            ? '상대방 동의 완료. 내 목소리 + 상대방 목소리 모두 포함하여 판매할 수 있습니다.'
            : session.consentStatus === 'user_only'
            ? '본인 음성이 확인되었습니다. 상대방 목소리는 자동으로 제거되어 내 목소리만 판매됩니다.'
            : !isEnrolled()
            ? '목소리 등록을 먼저 완료해주세요. 내정보 > 목소리 등록에서 3번 녹음하면 됩니다.'
            : '본인 음성 확인 중입니다. 잠시 후 자동으로 업데이트됩니다.'}
        </p>

        {/* 3단계 진행 표시 */}
        <div className="flex flex-col gap-2 mb-3">
          {/* 1단계: 메타데이터 */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-success)' }}>check_circle</span>
            <span className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>메타데이터 (U-M01, U-M05)</span>
            <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>판매 가능</span>
          </div>
          {/* 2단계: 내 음성 */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{
              color: (session.consentStatus === 'user_only' || session.consentStatus === 'both_agreed')
                ? 'var(--color-success)' : 'var(--color-warning)',
            }}>
              {(session.consentStatus === 'user_only' || session.consentStatus === 'both_agreed')
                ? 'check_circle' : isEnrolled() ? 'hourglass_top' : 'lock'}
            </span>
            <span className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>내 목소리 (U-A01~A03)</span>
            <span className="text-[10px]" style={{
              color: (session.consentStatus === 'user_only' || session.consentStatus === 'both_agreed')
                ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            }}>
              {(session.consentStatus === 'user_only' || session.consentStatus === 'both_agreed')
                ? '판매 가능'
                : !isEnrolled() ? '목소리 등록 필요' : '확인 중...'}
            </span>
          </div>
          {/* 3단계: 전체 음성 (선택) */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{
              color: session.consentStatus === 'both_agreed' ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            }}>
              {session.consentStatus === 'both_agreed' ? 'check_circle' : 'group'}
            </span>
            <span className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>전체 음성 (선택)</span>
            <span className="text-[10px]" style={{
              color: session.consentStatus === 'both_agreed' ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            }}>
              {session.consentStatus === 'both_agreed' ? '동의 완료' : '상대방 동의 시'}
            </span>
          </div>
        </div>

        {/* 목소리 등록 안내 (미등록 시) */}
        {!isEnrolled() && (
          <button
            onClick={() => navigate('/voice-enrollment')}
            className="w-full py-2.5 rounded-lg text-xs font-medium mb-2"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <span className="material-symbols-outlined text-sm align-middle mr-1">mic</span>
            목소리 등록하러 가기
          </button>
        )}

        {/* 상대방 동의 섹션 */}
        {session.consentStatus !== 'both_agreed' && (session.consentStatus === 'user_only' || isEnrolled()) && (
          <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-sub)' }}>
              현재 상대방 목소리는 자동 제거 후 내 목소리만 판매됩니다.
              상대방도 동의하면 전체 음성을 포함해 더 높은 가치로 판매할 수 있습니다.
            </p>
            {hasAgreedInvitation(session.id) ? (
              <button
                className="w-full py-2.5 rounded-lg text-xs font-medium transition-opacity active:opacity-80"
                style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}
                onClick={async () => {
                  const all = await loadAllSessions()
                  const idx = all.findIndex((s) => s.id === session.id)
                  if (idx !== -1) {
                    all[idx] = { ...all[idx], consentStatus: 'both_agreed' }
                    await saveAllSessions(all)
                    setSession({ ...session, consentStatus: 'both_agreed' })
                    setShareResult(null)
                    setInvitationStatus('agreed')
                  }
                }}
              >
                <span className="material-symbols-outlined text-sm align-middle mr-1">verified</span>
                상대방 동의 확인됨 -- 전체 음성 활성화
              </button>
            ) : (
              <>
                <button
                  className="w-full py-2.5 rounded-lg text-xs font-medium transition-opacity active:opacity-80"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  onClick={async () => {
                    const inv = createInvitation(session.id, session.date, session.duration)
                    const result = await shareInvitation(inv, session.date, session.duration)
                    if (result.success) {
                      setShareResult(result.method === 'web_share' ? '공유 완료' : '링크가 클립보드에 복사되었습니다')
                      setInvitationStatus('sent')
                    } else {
                      setShareResult('공유에 실패했습니다. 다시 시도해주세요.')
                    }
                  }}
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1">share</span>
                  상대방에게 동의 요청 보내기 (선택)
                </button>
                <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  필수가 아닙니다. 내 목소리만으로도 판매 가능합니다.
                </p>
                {shareResult && (
                  <p className="text-[10px] text-center mt-1" style={{ color: 'var(--color-accent)' }}>
                    {shareResult}
                  </p>
                )}
                {invitationStatus === 'sent' && (
                  <p className="text-[10px] text-center mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    카카오톡/메시지로 링크를 전달해주세요
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
