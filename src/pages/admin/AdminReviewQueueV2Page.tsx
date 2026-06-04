// 검수 패널 v2 전용 페이지 — 기존 AdminInventoryPage 와 공존.
// 라우트: /admin/review-v2
// Spec: docs/design_review_panel_redesign_20260603.md
//
// 의존:
//   - GET  /api/admin/review-queue/sessions?tier=red
//   - GET  /api/admin/review-queue/utterances?session_id=...&tier=red
//   - POST /api/admin/utterance-gt
//   - POST /api/admin/utterance-revisions

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { apiFetch } from '../../lib/api/client'
import { fetchUtteranceAudio } from '../../lib/api/utterances'
import { ReviewQueueList } from '../../components/domain/review-panel-v2/ReviewQueueList'
import { UtteranceReviewPanelV2, type ReviewDecision, type ContextUtterance } from '../../components/domain/review-panel-v2/UtteranceReviewPanelV2'
import { CallActionPanel, type NeedsRevisionOptions } from '../../components/domain/review-panel-v2/CallActionPanel'
import type {
  ReviewQueueItem,
  UtteranceReviewItem,
  CallActionContext,
} from '../../components/domain/review-panel-v2/types'

interface SessionQueueRow {
  id: string
  duration: number
  utterance_count: number
  title: string | null
  call_review_score: number | null
  call_review_tier: 'red' | 'yellow' | 'green' | null
  billing_utterance_count: number | null
  red_utterance_count: number
  yellow_utterance_count: number
  green_utterance_count: number
}

interface UtteranceQueueRow {
  id: string
  session_id: string
  sequence_order: number | null
  start_sec: number
  end_sec: number
  duration_sec: number
  speaker_id: string | null
  is_user: boolean | null
  transcript_text: string
  quality_grade: string | null
  quality_score: number | null
  emotion: string | null
  emotion_confidence: number | null
  review_priority_score: number
  review_priority_tier: 'red' | 'yellow' | 'green'
}

type View = 'queue' | 'utterance' | 'call_action'

export default function AdminReviewQueueV2Page() {
  const [view, setView] = useState<View>('queue')
  const [queue, setQueue] = useState<ReviewQueueItem[]>([])
  const [redUtteranceCount, setRedUtteranceCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // 통화 펼침 상태
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeSession, setActiveSession] = useState<SessionQueueRow | null>(null)
  const [redUtterances, setRedUtterances] = useState<UtteranceQueueRow[]>([])
  const [activeUtteranceIdx, setActiveUtteranceIdx] = useState(0)
  const [contextItems, setContextItems] = useState<ContextUtterance[]>([])

  // 정정 통계 (call_action 패널 input)
  const [revisionStats, setRevisionStats] = useState({
    text_correction: 0,
    speaker_relabel: 0,
    pii_addition: 0,
    exclude: 0,
    deferred_split: 0,
  })

  // 초기 큐 로드
  useEffect(() => {
    void loadQueue()
  }, [])

  const loadQueue = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<SessionQueueRow[]>('/api/admin/review-queue/sessions?tier=red&limit=50')
      if (res?.data && Array.isArray(res.data)) {
        const items: ReviewQueueItem[] = res.data.map((s: SessionQueueRow) => ({
          session_id: s.id,
          session_label: s.title ? s.title : `통화 #${s.id.slice(-6)}`,
          duration_seconds: s.duration,
          utterance_count: s.billing_utterance_count ?? s.utterance_count,
          call_review_score: s.call_review_score ?? 0,
          call_review_tier: s.call_review_tier ?? 'green',
          red_count: s.red_utterance_count,
          yellow_count: s.yellow_utterance_count,
          green_count: s.green_utterance_count,
          reasons: buildReasons(s),
        }))
        setQueue(items)
        const totalRed = res.data.reduce((sum: number, s: SessionQueueRow) => sum + s.red_utterance_count, 0)
        setRedUtteranceCount(totalRed)
      }
    } catch (e) {
      console.error('queue load failed', e)
    } finally {
      setLoading(false)
    }
  }

  const openSession = async (sessionId: string) => {
    const sess = queue.find((q) => q.session_id === sessionId)
    if (!sess) return
    setActiveSessionId(sessionId)
    setActiveSession({
      id: sessionId,
      duration: sess.duration_seconds,
      utterance_count: sess.utterance_count,
      title: sess.session_label,
      call_review_score: sess.call_review_score,
      call_review_tier: sess.call_review_tier,
      billing_utterance_count: sess.utterance_count,
      red_utterance_count: sess.red_count,
      yellow_utterance_count: sess.yellow_count,
      green_utterance_count: sess.green_count,
    })

    const res = await apiFetch<UtteranceQueueRow[]>(
      `/api/admin/review-queue/utterances?session_id=${sessionId}&tier=red&exclude_reviewed=true&limit=500`,
    )
    if (res?.data && Array.isArray(res.data)) {
      setRedUtterances(res.data)
      setActiveUtteranceIdx(0)
      setView(res.data.length > 0 ? 'utterance' : 'call_action')
      setRevisionStats({ text_correction: 0, speaker_relabel: 0, pii_addition: 0, exclude: 0, deferred_split: 0 })
    }
  }

  const handleUtteranceSubmit = useCallback(
    async (decision: ReviewDecision) => {
      if (!activeSession) return
      const utterance = redUtterances[activeUtteranceIdx]
      if (!utterance) return

      const gtBody: Record<string, unknown> = {
        utterance_id: utterance.id,
        session_id: utterance.session_id,
        gt_transcript:
          decision.type === 'normal' ? utterance.transcript_text :
          decision.type === 'modify' ? decision.gt_transcript :
          utterance.transcript_text,
        review_method: 'human',
      }
      if (decision.type === 'normal') {
        gtBody.status = 'approved'
        gtBody.gt_speaker = utterance.is_user ? '본인' : utterance.is_user === false ? '상대' : 'unknown'
      } else if (decision.type === 'modify') {
        gtBody.status = 'approved'
        gtBody.gt_speaker = decision.gt_speaker
        gtBody.gt_pii_intervals = decision.gt_pii_intervals
        gtBody.reviewer_comment = decision.reviewer_comment
      } else if (decision.type === 'exclude') {
        gtBody.status = decision.is_deferred_split ? 'deferred_split' : 'rejected'
        gtBody.exclude_reason = decision.reason
        gtBody.exclude_reason_note = decision.reason_note
      }

      try {
        const res = await apiFetch('/api/admin/utterance-gt', {
          method: 'POST',
          body: JSON.stringify(gtBody),
        })
        if (res?.error) throw new Error(res.error)

        if (decision.type === 'modify' && decision.revisions.length > 0) {
          const revisionBody = decision.revisions.map((rev) => ({
            utterance_id: utterance.id,
            session_id: utterance.session_id,
            revision_type: rev.type,
            payload: rev.payload,
            reason: decision.reviewer_comment,
          }))
          await apiFetch('/api/admin/utterance-revisions', {
            method: 'POST',
            body: JSON.stringify(revisionBody),
          })
        }

        setRevisionStats((prev) => {
          const next = { ...prev }
          if (decision.type === 'modify') {
            for (const rev of decision.revisions) {
              if (rev.type === 'text_correction') next.text_correction++
              else if (rev.type === 'speaker_relabel') next.speaker_relabel++
              else if (rev.type === 'pii_addition') next.pii_addition++
            }
          } else if (decision.type === 'exclude') {
            next.exclude++
            if (decision.is_deferred_split) next.deferred_split++
          }
          return next
        })

        if (activeUtteranceIdx + 1 < redUtterances.length) {
          setActiveUtteranceIdx(activeUtteranceIdx + 1)
        } else {
          setView('call_action')
        }
      } catch (e) {
        console.error('submit failed', e)
        alert('저장 실패: ' + (e instanceof Error ? e.message : String(e)))
      }
    },
    [activeSession, redUtterances, activeUtteranceIdx],
  )

  const handleApproveCall = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const res = await apiFetch(`/api/admin/sessions/${activeSessionId}/review-status`, {
        method: 'PATCH',
        body: JSON.stringify({ review_status: 'approved' }),
      })
      if (res?.error) throw new Error(res.error)
      alert('통화 승인 완료')
      setView('queue')
      void loadQueue()
    } catch (e) {
      alert('승인 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }, [activeSessionId])

  const handleNeedsRevision = useCallback(
    async (options: NeedsRevisionOptions) => {
      if (!activeSessionId) return
      try {
        const res = await apiFetch('/api/admin/session-reprocess-runs', {
          method: 'POST',
          body: JSON.stringify({ session_id: activeSessionId, ...options }),
        })
        if (res?.error) throw new Error(res.error)
        alert('재처리 요청 등록 완료')
        setView('queue')
        void loadQueue()
      } catch (e) {
        alert('재처리 요청 실패: ' + (e instanceof Error ? e.message : String(e)))
      }
    },
    [activeSessionId],
  )

  const handleReject = useCallback(
    async (reason: string) => {
      if (!activeSessionId) return
      try {
        const res = await apiFetch(`/api/admin/sessions/${activeSessionId}/review-status`, {
          method: 'PATCH',
          body: JSON.stringify({ review_status: 'rejected', reason }),
        })
        if (res?.error) throw new Error(res.error)
        alert('통화 거절 완료')
        setView('queue')
        void loadQueue()
      } catch (e) {
        alert('거절 실패: ' + (e instanceof Error ? e.message : String(e)))
      }
    },
    [activeSessionId],
  )

  const callActionContext: CallActionContext | null = useMemo(() => {
    if (!activeSession) return null
    return {
      session_id: activeSession.id,
      total_utterance_count: activeSession.billing_utterance_count ?? activeSession.utterance_count,
      reviewed_red_count: activeUtteranceIdx,
      reviewed_red_total: redUtterances.length,
      revision_stats: revisionStats,
      hotword_candidates: [], // P2 에서 자동 추출 — P1 placeholder
    }
  }, [activeSession, activeUtteranceIdx, redUtterances.length, revisionStats])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map())

  // 발화 전환 시 audio 정지 + context fetch
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const utt = redUtterances[activeUtteranceIdx]
    if (!utt) {
      setContextItems([])
      return
    }
    let cancelled = false
    apiFetch<ContextUtterance[]>(`/api/admin/review-queue/utterance-context?utterance_id=${utt.id}&n=2`)
      .then((res) => {
        if (cancelled) return
        if (res?.data && Array.isArray(res.data)) {
          setContextItems(res.data)
        } else {
          setContextItems([])
        }
      })
      .catch((e) => {
        console.error('context fetch failed', e)
        if (!cancelled) setContextItems([])
      })
    return () => {
      cancelled = true
    }
  }, [activeUtteranceIdx, redUtterances])

  const handlePlay = useCallback(async () => {
    const utt = redUtterances[activeUtteranceIdx]
    if (!utt) return
    try {
      // 같은 발화면 toggle pause/resume
      if (audioRef.current && audioRef.current.dataset.uttId === utt.id) {
        if (audioRef.current.paused) await audioRef.current.play()
        else audioRef.current.pause()
        return
      }
      // 새 발화 audio 로드
      let url = audioUrlCacheRef.current.get(utt.id)
      if (!url) {
        const res = await fetchUtteranceAudio(utt.id)
        if (res?.error || !res?.data?.url) {
          alert('재생 실패: ' + (res?.error ?? 'no url'))
          return
        }
        url = res.data.url
        audioUrlCacheRef.current.set(utt.id, url)
      }
      const a = new Audio(url)
      a.dataset.uttId = utt.id
      audioRef.current = a
      await a.play()
    } catch (e) {
      console.error('play failed', e)
      alert('재생 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }, [redUtterances, activeUtteranceIdx])

  const handleSeek = useCallback((deltaSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + deltaSec)
    }
  }, [])

  const handleNextRed = useCallback(() => {
    if (activeUtteranceIdx + 1 < redUtterances.length) {
      setActiveUtteranceIdx(activeUtteranceIdx + 1)
    } else {
      setView('call_action')
    }
  }, [activeUtteranceIdx, redUtterances.length])

  if (loading) {
    return <div className="p-6 text-center text-txt-sub">검수 큐 로딩 중...</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            setView('queue')
            setActiveSessionId(null)
            setActiveSession(null)
            setRedUtterances([])
          }}
          className={`px-3 py-1 rounded ${view === 'queue' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        >
          큐
        </button>
        {activeSessionId && activeSession && (
          <>
            <span className="text-txt-sub">/</span>
            <span className="text-txt-sub text-xs px-2 py-1 bg-gray-100 rounded max-w-md truncate" title={activeSession.title ?? ''}>
              {activeSession.title ?? `통화 #${activeSessionId.slice(-6)}`}
              {' '}({activeSession.utterance_count}발화)
            </span>
            <button
              type="button"
              onClick={() => setView('utterance')}
              className={`px-3 py-1 rounded ${view === 'utterance' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              disabled={redUtterances.length === 0}
            >
              빨강 발화 {activeUtteranceIdx + 1}/{redUtterances.length}
            </button>
            <button
              type="button"
              onClick={() => setView('call_action')}
              className={`px-3 py-1 rounded ${view === 'call_action' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            >
              통화 액션
            </button>
          </>
        )}
      </div>

      {view === 'queue' && (
        <ReviewQueueList
          items={queue}
          totalUtteranceCount={0}
          redUtteranceCount={redUtteranceCount}
          onOpenSession={openSession}
          onBulkAutoApprove={(ids) => {
            console.log('TODO: bulk auto approve', ids)
            alert('일괄 자동승인은 CBO Tier 정책 합의 후 활성화 (정본 §2.4).')
          }}
        />
      )}

      {view === 'utterance' && redUtterances[activeUtteranceIdx] && (
        <UtteranceReviewPanelV2
          utterance={mapToReviewItem(redUtterances[activeUtteranceIdx])}
          isActive={true}
          context={contextItems}
          onSubmit={handleUtteranceSubmit}
          onNextRed={handleNextRed}
          onPlay={handlePlay}
          onSeek={handleSeek}
        />
      )}

      {view === 'call_action' && callActionContext && (
        <CallActionPanel
          context={callActionContext}
          onApprove={handleApproveCall}
          onNeedsRevision={handleNeedsRevision}
          onReject={handleReject}
          onHotwordsRegister={(selected) => {
            console.log('TODO: register hotwords', selected)
            alert('HOTWORDS 자동 추출은 P2 (운영 1개월 후) 도입.')
          }}
        />
      )}
    </div>
  )
}

function buildReasons(s: SessionQueueRow): string[] {
  const reasons: string[] = []
  if (s.red_utterance_count > 0) reasons.push(`빨강 ${s.red_utterance_count}`)
  if (s.yellow_utterance_count > 0) reasons.push(`노랑 ${s.yellow_utterance_count}`)
  return reasons
}

function mapToReviewItem(u: UtteranceQueueRow): UtteranceReviewItem {
  return {
    id: u.id,
    sequence_order: u.sequence_order ?? 0,
    start_sec: u.start_sec,
    end_sec: u.end_sec,
    duration_sec: u.duration_sec,
    speaker_id: u.speaker_id,
    is_user: u.is_user,
    auto_transcript: u.transcript_text,
    quality_grade: u.quality_grade,
    quality_score: u.quality_score,
    emotion: u.emotion,
    emotion_confidence: u.emotion_confidence,
    review_priority_score: u.review_priority_score,
    review_priority_tier: u.review_priority_tier,
    dataset_tier: null,
  }
}
