import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { type LabelCategory, type Session } from '../types/session'
import { loadAllSessions, saveAllSessions } from '../lib/sessionMapper'
import { extractContactName } from '../lib/contactUtils'
import { fetchSession, updateSessionLabels, updateSessionLabelStatus } from '../lib/api/sessions'
import {
  calcLabelTrust,
  recordLabelEvent,
  loadLabelStats,
  getValidationMessage,
  type LabelTrustResult,
} from '../lib/labelTrust'
import { trackFunnel } from '../lib/funnelLogger'
import { loadAutoLabelResults, type AutoLabelResult } from '../lib/autoLabel'
import {
  RELATIONSHIP_OPTIONS, DOMAIN_OPTIONS, PURPOSE_OPTIONS, TONE_OPTIONS, NOISE_OPTIONS,
  SPEECH_ACT_OPTIONS, INTERACTION_MODE_OPTIONS,
  normalizeLabel, REL_EN_TO_KO, DOMAIN_EN_TO_KO,
} from '../lib/labelOptions'
import AudioPlayer from '../components/domain/AudioPlayer'
import { formatDuration } from '../lib/earnings'
import { loadTranscript } from '../lib/transcriptStore'
import { maskSessionTitle, maskContactName } from '../lib/displayMask'

// ── 세션별 라벨 필드 (공유 상수에서 옵션 참조) ───────────────────────────
const LABEL_CONFIG: { category: keyof Omit<LabelCategory, 'relationship'>; label: string; options: readonly string[] }[] = [
  { category: 'purpose', label: '목적', options: PURPOSE_OPTIONS },
  { category: 'domain', label: '도메인', options: DOMAIN_OPTIONS },
  { category: 'tone', label: '톤', options: TONE_OPTIONS },
  { category: 'noise', label: '소음', options: NOISE_OPTIONS },
]

// ── localStorage 유틸 ────────────────────────────────────────────────────

function loadGroupRels(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('uncounted_group_rels') ?? '{}')
  } catch {
    return {}
  }
}

function saveGroupRel(contactName: string, rel: string | null) {
  const rels = loadGroupRels()
  if (rel) {
    rels[contactName] = rel
  } else {
    delete rels[contactName]
  }
  localStorage.setItem('uncounted_group_rels', JSON.stringify(rels))
}

const EXT_MIME: Record<string, string> = {
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
  ogg: 'audio/ogg', '3gp': 'audio/3gpp', aac: 'audio/aac',
  amr: 'audio/amr', flac: 'audio/flac',
}

// ─────────────────────────────────────────────────────────────────────────

export default function LabelingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [labels, setLabels] = useState<Omit<LabelCategory, 'relationship'>>({
    purpose: null, domain: null, tone: null, noise: null,
  })
  const [relationship, setRelationship] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editCount, setEditCount] = useState(0)
  const [trustPreview, setTrustPreview] = useState<LabelTrustResult | null>(null)
  const [autoResult, setAutoResult] = useState<AutoLabelResult | null>(null)
  // A03 대화행위 확장
  const [primarySpeechAct, setPrimarySpeechAct] = useState<string | null>(null)
  const [speechActEvents, setSpeechActEvents] = useState<string[]>([])
  const [interactionMode, setInteractionMode] = useState<'qa' | 'explanatory' | 'negotiation' | 'casual' | null>(null)
  const [a03Open, setA03Open] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  const labelStartTime = useRef(Date.now())
  useEffect(() => { trackFunnel('label_start', { sessionId }) }, [sessionId])

  // ── 세션 + 자동 라벨 + 오디오 로드 ──────────────────────────────────

  useEffect(() => {
    async function load() {
      let sess: Session | null = null

      if (sessionId && import.meta.env.VITE_API_URL) {
        try {
          const { data, error } = await fetchSession(sessionId)
          if (!error && data) {
            sess = data
          }
        } catch { /* fallback */ }
      }

      if (!sess) {
        const all = await loadAllSessions()
        sess = all.find((s) => s.id === sessionId) ?? null
      }

      if (sess) {
        setSession(sess)
        const contactName = extractContactName(sess.title)
        const rels = loadGroupRels()
        const existingRel = normalizeLabel(rels[contactName]) ?? normalizeLabel(sess.labels?.relationship) ?? null
        setRelationship(existingRel)

        const existing = sess.labels

        // 자동 라벨 결과 로드
        const autoResults = await loadAutoLabelResults()
        const ar = autoResults.get(sess.id) ?? null
        setAutoResult(ar)

        // 프리필: 기존 수동 > 세션 labels > 자동 라벨 (공유 매핑 사용)
        setLabels({
          purpose: normalizeLabel(existing?.purpose) ?? ar?.purpose ?? null,
          domain: normalizeLabel(existing?.domain) ?? (ar ? DOMAIN_EN_TO_KO[ar.domain] : null) ?? null,
          tone: normalizeLabel(existing?.tone) ?? ar?.tone ?? null,
          noise: normalizeLabel(existing?.noise) ?? ar?.noise ?? null,
        })

        // 관계도 자동 라벨에서 프리필
        if (!existingRel && ar) {
          setRelationship(REL_EN_TO_KO[ar.relationship] ?? null)
        }

        // A03 프리필
        if (existing?.primarySpeechAct) setPrimarySpeechAct(existing.primarySpeechAct)
        if (existing?.speechActEvents?.length) setSpeechActEvents(existing.speechActEvents)
        if (existing?.interactionMode) setInteractionMode(existing.interactionMode)
      }

      setLoading(false)
      labelStartTime.current = Date.now()
    }
    load()
  }, [sessionId])

  // ── 오디오 URL 로드 ──────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return
    if (session.audioUrl) { setAudioUrl(session.audioUrl); return }

    const filePaths: Record<string, string> = JSON.parse(
      localStorage.getItem('uncounted_file_paths') ?? '{}'
    )
    const callRecordId = session.callRecordId ?? filePaths[session.id]
    if (!Capacitor.isNativePlatform() || !callRecordId) return

    let cancelled = false
    setAudioLoading(true)

    async function loadAudio() {
      try {
        const { data } = await Filesystem.readFile({
          path: callRecordId!,
          directory: Directory.ExternalStorage,
        })
        if (cancelled) return
        const ext = callRecordId!.split('.').pop()?.toLowerCase() ?? 'm4a'
        const mime = EXT_MIME[ext] ?? 'audio/mp4'
        setAudioUrl(`data:${mime};base64,${data}`)
        setAudioLoading(false)
        return
      } catch { /* try getUri */ }

      try {
        const { uri } = await Filesystem.getUri({
          path: callRecordId!,
          directory: Directory.ExternalStorage,
        })
        if (!cancelled) setAudioUrl(Capacitor.convertFileSrc(uri))
      } catch { /* 모두 실패 */ }
      finally { if (!cancelled) setAudioLoading(false) }
    }
    loadAudio()
    return () => { cancelled = true }
  }, [session])

  // ── 캐시된 트랜스크립트 로드 ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    loadTranscript(sessionId).then((t) => { if (t) setTranscript(t) })
  }, [sessionId])

  // ── 신뢰도 미리보기 ──────────────────────────────────────────────────

  useEffect(() => {
    const filledCount = Object.values(labels).filter(Boolean).length + (relationship ? 1 : 0)
    if (filledCount === 0) { setTrustPreview(null); return }
    const stats = loadLabelStats()
    const latencyMs = Date.now() - labelStartTime.current
    const result = calcLabelTrust(
      {
        inputLatencyMs: latencyMs,
        consecutiveSameLabel: stats.consecutiveSameLabel,
        todayLabelCount: stats.todayCount,
        editCount,
      },
      stats.avgTrustScore >= 0.8 ? 'A' : stats.avgTrustScore >= 0.5 ? 'B' : 'C',
    )
    setTrustPreview(result)
  }, [labels, relationship, primarySpeechAct, speechActEvents, interactionMode, editCount])

  // ── 로딩/에러 상태 ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 px-4"
        style={{ backgroundColor: 'var(--color-bg)' }}>
        <span className="material-symbols-outlined text-4xl animate-pulse" style={{ color: 'var(--color-accent)' }}>
          hourglass_top
        </span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>세션 로딩 중...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 px-4"
        style={{ backgroundColor: 'var(--color-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>세션을 찾을 수 없습니다</p>
        <button onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
          뒤로가기
        </button>
      </div>
    )
  }

  const contactName = extractContactName(session.title)
  const fullLabels: LabelCategory = {
    relationship, ...labels,
    primarySpeechAct: primarySpeechAct ?? null,
    speechActEvents: speechActEvents.length > 0 ? speechActEvents : undefined,
    interactionMode: interactionMode ?? null,
  }
  const filledCount = Object.values(labels).filter(Boolean).length + (relationship ? 1 : 0)
    + (primarySpeechAct ? 1 : 0) + (speechActEvents.length > 0 ? 1 : 0) + (interactionMode ? 1 : 0)
  const totalFields = LABEL_CONFIG.length + 1 // +1 for relationship (A03 optional, not counted in total)

  function selectLabel(category: keyof Omit<LabelCategory, 'relationship'>, value: string) {
    setLabels((prev) => ({
      ...prev,
      [category]: prev[category] === value ? null : value,
    }))
    setEditCount((c) => c + 1)
    labelStartTime.current = Date.now()
  }

  function selectRelationship(value: string) {
    setRelationship((prev) => prev === value ? null : value)
    setEditCount((c) => c + 1)
    labelStartTime.current = Date.now()
  }

  async function handleApply() {
    if (saving || filledCount === 0) return
    setSaving(true)

    // 신뢰도 최종 계산
    const stats = loadLabelStats()
    const latencyMs = Date.now() - labelStartTime.current
    const trustResult = calcLabelTrust(
      {
        inputLatencyMs: latencyMs,
        consecutiveSameLabel: stats.consecutiveSameLabel,
        todayLabelCount: stats.todayCount,
        editCount,
      },
      stats.avgTrustScore >= 0.8 ? 'A' : stats.avgTrustScore >= 0.5 ? 'B' : 'C',
    )

    // 관계 변경 시 group_rels 저장 + 같은 연락처 세션 모두 업데이트
    if (relationship) {
      saveGroupRel(contactName, relationship)
    }

    // 로컬 세션에 labels + labelStatus 저장
    const allSessions = await loadAllSessions()
    const updatedSessions = allSessions.map((s) => {
      if (s.id === sessionId) {
        return {
          ...s,
          labels: fullLabels,
          labelStatus: 'CONFIRMED' as const,
          labelSource: 'user' as const,
          labelConfidence: Math.min(1.0, Math.round(trustResult.adjustedScore * 100) / 100),
        }
      }
      // 같은 연락처의 다른 세션: 관계만 전파 (기존 라벨 유지)
      if (relationship && extractContactName(s.title) === contactName && s.id !== sessionId) {
        return {
          ...s,
          labels: {
            ...s.labels,
            relationship,
            purpose: s.labels?.purpose ?? null,
            domain: s.labels?.domain ?? null,
            tone: s.labels?.tone ?? null,
            noise: s.labels?.noise ?? null,
          },
        }
      }
      return s
    })

    // UI 먼저 이동 (저장은 백그라운드)
    const labelSummary = Object.values(fullLabels).filter(Boolean).join(',')
    recordLabelEvent(labelSummary, trustResult)
    trackFunnel('label_complete', { sessionId, labelSummary, trust: trustResult.adjustedScore })
    setSaving(false)
    navigate(-1)

    // 백그라운드 저장 (UI는 이미 이동 — 에러 시 콘솔 경고)
    saveAllSessions(updatedSessions).catch((e) => {
      console.warn('[labeling] saveAllSessions failed:', e)
    })

    if (sessionId && import.meta.env.VITE_API_URL) {
      try {
        // API를 통한 라벨 업데이트
        const { error } = await updateSessionLabels(sessionId, fullLabels)
        if (error) console.warn('[labeling] labels update failed:', error)

        // label_status 업데이트
        await updateSessionLabelStatus(sessionId, {
          label_status: 'CONFIRMED',
          label_source: 'user',
          label_confidence: Math.min(1.0, Math.round(trustResult.adjustedScore * 100) / 100),
        }).then(({ error: e2 }) => {
          if (e2) console.warn('[labeling] label_status update failed:', e2)
        })
      } catch { /* ignore */ }
    }
  }

  const validationMsg = trustPreview ? getValidationMessage(trustPreview.validationFlag) : null

  return (
    <div className="min-h-full px-5 py-5 flex flex-col gap-5 pb-28" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 세션 정보 카드 */}
      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>{maskSessionTitle(session.title)}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{session.date}</span>
          <span className="text-xs" style={{ color: 'var(--color-border)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{formatDuration(session.duration)}</span>
          <span className="text-xs" style={{ color: 'var(--color-border)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{maskContactName(contactName)}</span>
        </div>
        {session.audioMetrics && (
          <div className="flex gap-2 mt-2">
            <MetaTag label="품질" value={session.audioMetrics.qualityFactor >= 0.7 ? 'A' : session.audioMetrics.qualityFactor >= 0.4 ? 'B' : 'C'} />
            <MetaTag label="SNR" value={session.audioMetrics.snrDb > 0 ? `${Math.round(session.audioMetrics.snrDb)}dB` : '-'} />
            <MetaTag label="발화" value={`${Math.round((1 - session.audioMetrics.silenceRatio) * 100)}%`} />
          </div>
        )}
      </div>

      {/* 오디오 플레이어 */}
      {audioLoading ? (
        <div className="rounded-xl p-5 flex items-center gap-3" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
          <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>오디오 로딩 중...</span>
        </div>
      ) : (
        <AudioPlayer duration={session.duration} audioUrl={audioUrl ?? undefined} />
      )}

      {/* 텍스트 미리보기 (캐시된 트랜스크립트) */}
      {transcript ? (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5"
          >
            <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>description</span>
            <span className="text-xs font-medium flex-1 text-left" style={{ color: 'var(--color-text)' }}>텍스트 미리보기</span>
            <span
              className="material-symbols-outlined text-sm transition-transform"
              style={{ color: 'var(--color-text-tertiary)', transform: transcriptOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >expand_more</span>
          </button>
          {transcriptOpen && (
            <div className="px-3 pb-3">
              <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-sub)' }}>
                {transcript}
              </p>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => navigate(`/assets/${sessionId}`)}
          className="flex items-center gap-1.5 px-1"
        >
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>mic</span>
          <span className="text-xs" style={{ color: 'var(--color-accent)' }}>세션 상세에서 텍스트 추출하기</span>
        </button>
      )}

      {/* 자동 라벨 추론 근거 */}
      {autoResult && (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>smart_toy</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>자동 분석 결과</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <AutoTag label="관계" value={autoResult.relationship} conf={autoResult.relConfidence} />
            <AutoTag label="도메인" value={autoResult.domain} conf={autoResult.domConfidence} />
            {autoResult.purpose && <AutoTag label="목적" value={autoResult.purpose} conf={autoResult.purposeConfidence} />}
            {autoResult.tone && <AutoTag label="톤" value={autoResult.tone} conf={autoResult.toneConfidence} />}
            {autoResult.noise && <AutoTag label="소음" value={autoResult.noise} conf={autoResult.noiseConfidence} />}
          </div>
          {/* 주요 적용 룰 */}
          <div className="flex flex-wrap gap-1 mt-1">
            {autoResult.relRules.slice(0, 3).map((r) => (
              <span key={r.ruleName} className="text-[9px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}>
                {r.ruleName.replace(/_/g, ' ')} +{(r.score * 100).toFixed(0)}
              </span>
            ))}
            {autoResult.domRules.slice(0, 3).map((r) => (
              <span key={r.ruleName} className="text-[9px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}>
                {r.ruleName.replace(/_/g, ' ')} +{(r.score * 100).toFixed(0)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 관계 선택 (편집 가능 — 같은 연락처 전체 반영) */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-sub)' }}>group</span>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-sub)' }}>관계</p>
          <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
            '{maskContactName(contactName)}' 전체 통화에 적용
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => selectRelationship(opt)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
              style={relationship === opt
                ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: '1px solid var(--color-accent)' }
                : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }
              }
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* 세션별 라벨 선택 (목적/도메인/톤/소음) */}
      {LABEL_CONFIG.map(({ category, label, options }) => (
        <div key={category}>
          <p className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--color-text-sub)' }}>{label}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const selected = labels[category] === opt
              return (
                <button
                  key={opt}
                  onClick={() => selectLabel(category, opt)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={selected
                    ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: '1px solid var(--color-accent)' }
                    : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }
                  }
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* A03 대화행위 (선택, 접기/펼치기) */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setA03Open(!a03Open)}
          className="w-full flex items-center gap-2 px-3 py-2.5"
        >
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>record_voice_over</span>
          <span className="text-xs font-medium flex-1 text-left" style={{ color: 'var(--color-text)' }}>
            대화행위 (선택)
          </span>
          {(primarySpeechAct || speechActEvents.length > 0 || interactionMode) && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
              입력됨
            </span>
          )}
          <span
            className="material-symbols-outlined text-sm transition-transform"
            style={{ color: 'var(--color-text-tertiary)', transform: a03Open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >expand_more</span>
        </button>
        {a03Open && (
          <div className="px-3 pb-3 flex flex-col gap-3">
            {/* 대표 대화행위 (single-select) */}
            <div>
              <p className="text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-text-sub)' }}>대표 대화행위</p>
              <div className="flex flex-wrap gap-1.5">
                {SPEECH_ACT_OPTIONS.map((act) => (
                  <button
                    key={act}
                    onClick={() => { setPrimarySpeechAct(prev => prev === act ? null : act); setEditCount(c => c + 1) }}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={primarySpeechAct === act
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: '1px solid var(--color-accent)' }
                      : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }
                    }
                  >{act}</button>
                ))}
              </div>
            </div>
            {/* 발생 태그 (multi-select, 최대 5개) */}
            <div>
              <p className="text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-text-sub)' }}>
                발생 태그 <span style={{ color: 'var(--color-text-tertiary)' }}>(복수 선택, 최대 5개)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SPEECH_ACT_OPTIONS.map((act) => {
                  const selected = speechActEvents.includes(act)
                  return (
                    <button
                      key={act}
                      onClick={() => {
                        setSpeechActEvents(prev => {
                          if (selected) return prev.filter(a => a !== act)
                          if (prev.length >= 5) return prev
                          return [...prev, act]
                        })
                        setEditCount(c => c + 1)
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                      style={selected
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: '1px solid var(--color-accent)' }
                        : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }
                      }
                    >{act}</button>
                  )
                })}
              </div>
            </div>
            {/* 대화 방식 (single-select) */}
            <div>
              <p className="text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-text-sub)' }}>대화 방식</p>
              <div className="flex flex-wrap gap-1.5">
                {INTERACTION_MODE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setInteractionMode(prev => prev === key ? null : key); setEditCount(c => c + 1) }}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={interactionMode === key
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: '1px solid var(--color-accent)' }
                      : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }
                    }
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 신뢰도 미리보기 (축소) */}
      {trustPreview && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>verified</span>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                신뢰도 {Math.round(trustPreview.adjustedScore * 100)}/100
              </span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {filledCount}/{totalFields} 선택
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden mt-1" style={{ backgroundColor: 'var(--color-muted)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${(filledCount / totalFields) * 100}%`, backgroundColor: 'var(--color-accent)' }} />
            </div>
          </div>
        </div>
      )}
      {validationMsg && (
        <div className="flex items-start gap-1.5 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
          <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: 'var(--color-text-sub)' }}>warning</span>
          <p className="text-[11px]" style={{ color: 'var(--color-text-sub)' }}>{validationMsg}</p>
        </div>
      )}

      {/* 하단 고정 적용 버튼 */}
      <div
        className="fixed left-0 right-0 px-5 pb-2 pt-3 z-40"
        style={{
          bottom: 'calc(4rem + env(safe-area-inset-bottom))',
          backgroundColor: 'var(--color-bg)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <button
          onClick={handleApply}
          disabled={filledCount === 0 || saving}
          className="w-full py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          style={
            filledCount > 0 && !saving
              ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
              : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }
          }
        >
          {saving ? (
            <span className="material-symbols-outlined text-lg animate-spin">sync</span>
          ) : (
            <span className="material-symbols-outlined text-lg">check_circle</span>
          )}
          {saving ? '저장 중...' : '라벨 적용'}
        </button>
      </div>
    </div>
  )
}

// ── 메타 태그 (인라인 컴포넌트) ──────────────────────────────────────

function MetaTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
      style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span> {value}
    </span>
  )
}

// ── 자동 분석 태그 ──────────────────────────────────────────────────────

function AutoTag({ label, value, conf }: { label: string; value: string; conf: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md"
      style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-text-sub)' }}>
      <span className="font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      {value}
      <span style={{ color: 'var(--color-text-tertiary)' }}>{Math.round(conf * 100)}%</span>
    </span>
  )
}
