import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Session } from '../types/session'
import { loadAllSessions, saveAllSessions } from '../lib/sessionMapper'
import { loadAutoLabelResults, applyAutoLabelToSession, type AutoLabelResult } from '../lib/autoLabel'
import { normalizeLabel, REL_EN_TO_KO, DOMAIN_EN_TO_KO } from '../lib/labelOptions'
import LabelStatusBadge from '../components/domain/LabelStatusBadge'
import { updateSessionLabels, updateSessionLabelStatus } from '../lib/api/sessions'
import { formatDuration } from '../lib/earnings'
import { maskSessionTitle } from '../lib/displayMask'

type FilterTab = 'all' | 'recommended' | 'review' | 'locked' | 'confirmed'

const TAB_CONFIG: { key: FilterTab; label: string; statuses: string[] }[] = [
  { key: 'all', label: '전체', statuses: [] },
  { key: 'recommended', label: '추천', statuses: ['RECOMMENDED', 'AUTO'] },
  { key: 'review', label: '검토', statuses: ['REVIEW'] },
  { key: 'locked', label: '잠금', statuses: ['LOCKED'] },
  { key: 'confirmed', label: '확정', statuses: ['CONFIRMED'] },
]

const PAGE_SIZE = 30

export default function ReviewQueuePage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [results, setResults] = useState<Map<string, AutoLabelResult>>(new Map())
  const [filter, setFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    async function load() {
      const allSessions = await loadAllSessions()
      const autoResults = await loadAutoLabelResults()

      // autoResults에서 labelStatus + labels 보완
      const enriched = allSessions.map((s) => {
        const ar = autoResults.get(s.id)
        if (!ar) return s
        // 이미 CONFIRMED이면 자동 라벨로 덮어씌우지 않음
        if (s.labelStatus === 'CONFIRMED') return s
        return applyAutoLabelToSession(s, ar)
      })

      // labelStatus가 있는 세션만 (null인 건 자동 라벨링 안 된 세션)
      const labeled = enriched.filter((s) => s.labelStatus)

      setSessions(labeled)
      setResults(autoResults)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filter])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function getFiltered(): Session[] {
    if (filter === 'all') return sessions
    const statuses = TAB_CONFIG.find((t) => t.key === filter)?.statuses ?? []
    return sessions.filter((s) => statuses.includes(s.labelStatus ?? ''))
  }

  function getCounts(): Record<FilterTab, number> {
    return {
      all: sessions.length,
      recommended: sessions.filter((s) =>
        s.labelStatus === 'RECOMMENDED' || s.labelStatus === 'AUTO'
      ).length,
      review: sessions.filter((s) => s.labelStatus === 'REVIEW').length,
      locked: sessions.filter((s) => s.labelStatus === 'LOCKED').length,
      confirmed: sessions.filter((s) => s.labelStatus === 'CONFIRMED').length,
    }
  }

  async function handleConfirm(sessionId: string) {
    const result = results.get(sessionId)
    const target = sessions.find((s) => s.id === sessionId)
    if (!target) return

    const baseConf = result ? (result.relConfidence + result.domConfidence) / 2 : 0.5
    const confirmedSession: Session = {
      ...target,
      labelStatus: 'CONFIRMED' as const,
      labelSource: 'user_confirmed',
      labelConfidence: Math.min(1.0, Math.round((baseConf + 0.15) * 100) / 100),
      labels: {
        relationship: target.labels?.relationship ?? (result ? REL_EN_TO_KO[result.relationship] : null) ?? null,
        domain: target.labels?.domain ?? (result ? DOMAIN_EN_TO_KO[result.domain] : null) ?? null,
        purpose: target.labels?.purpose ?? result?.purpose ?? null,
        tone: target.labels?.tone ?? result?.tone ?? null,
        noise: target.labels?.noise ?? result?.noise ?? null,
      },
    }

    const updated = sessions.map((s) => s.id === sessionId ? confirmedSession : s)
    setSessions(updated)
    setToast('라벨 확정 완료')

    // 저장 (IDB + API)
    const allSessions = await loadAllSessions()
    const merged = allSessions.map((s) => s.id === sessionId ? confirmedSession : s)
    await saveAllSessions(merged)

    if (import.meta.env.VITE_API_URL) {
      try {
        await updateSessionLabels(sessionId, confirmedSession.labels)
        await updateSessionLabelStatus(sessionId, {
          label_status: 'CONFIRMED',
          label_source: 'user_confirmed',
          label_confidence: confirmedSession.labelConfidence ?? undefined,
        })
      } catch { /* ignore */ }
    }
  }

  async function handleSkip(sessionId: string) {
    // "모르겠어요" — labelStatus를 REVIEW로 유지, 건너뛰기
    const target = sessions.find((s) => s.id === sessionId)
    if (!target) return

    const skippedSession: Session = {
      ...target,
      labelStatus: 'REVIEW' as const,
    }

    const updated = sessions.map((s) => s.id === sessionId ? skippedSession : s)
    setSessions(updated)
    setToast('검토 건너뜀')
  }

  async function handleConfirmAllRecommended() {
    const toConfirm = sessions.filter((s) =>
      s.labelStatus === 'RECOMMENDED' || s.labelStatus === 'AUTO'
    )
    if (toConfirm.length === 0) return

    const updatedMap = new Map<string, Session>()
    for (const s of toConfirm) {
      const result = results.get(s.id)
      const baseConf = result ? (result.relConfidence + result.domConfidence) / 2 : 0.5
      updatedMap.set(s.id, {
        ...s,
        labelStatus: 'CONFIRMED' as const,
        labelSource: 'user_confirmed',
        labelConfidence: Math.min(1.0, Math.round((baseConf + 0.15) * 100) / 100),
        labels: {
          relationship: s.labels?.relationship ?? (result ? REL_EN_TO_KO[result.relationship] : null) ?? null,
          domain: s.labels?.domain ?? (result ? DOMAIN_EN_TO_KO[result.domain] : null) ?? null,
          purpose: s.labels?.purpose ?? result?.purpose ?? null,
          tone: s.labels?.tone ?? result?.tone ?? null,
          noise: s.labels?.noise ?? result?.noise ?? null,
        },
      })
    }

    const updated = sessions.map((s) => updatedMap.get(s.id) ?? s)
    setSessions(updated)
    setToast(`${toConfirm.length}건 일괄 확정 완료`)

    // 저장 (IDB + API)
    const allSessions = await loadAllSessions()
    const merged = allSessions.map((s) => updatedMap.get(s.id) ?? s)
    await saveAllSessions(merged)

    if (import.meta.env.VITE_API_URL) {
      // API를 통한 배치 업데이트
      for (const s of updatedMap.values()) {
        try {
          await updateSessionLabels(s.id, s.labels)
          await updateSessionLabelStatus(s.id, {
            label_status: 'CONFIRMED',
            label_source: 'user_confirmed',
            label_confidence: s.labelConfidence ?? undefined,
          })
        } catch { /* ignore */ }
      }
    }
  }

  function handleEdit(sessionId: string) {
    navigate(`/value/label/${sessionId}`)
  }

  const filtered = getFiltered()
  const counts = getCounts()
  const hasBottomAction = counts.recommended > 0
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4" style={{ backgroundColor: 'var(--color-bg)' }}>
        <span className="material-symbols-outlined text-4xl animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>자동 라벨 결과 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-full px-4 py-4"
      style={{
        backgroundColor: 'var(--color-bg)',
        paddingBottom: hasBottomAction ? 'calc(10rem + env(safe-area-inset-bottom))' : 'calc(5rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* 요약 */}
      <div className="mb-4">
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          전체 {sessions.length.toLocaleString()}건 (확정 {counts.confirmed} / 미확정 {(sessions.length - counts.confirmed).toLocaleString()})
        </p>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const count = counts[tab.key]
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                  : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }
              }
            >
              {tab.label}
              <span
                className="text-[10px] px-1 rounded-full"
                style={
                  active
                    ? { backgroundColor: 'rgba(255,255,255,0.2)' }
                    : { backgroundColor: 'var(--color-surface-alt)' }
                }
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 빈 상태 */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="material-symbols-outlined text-4xl" style={{ color: 'var(--color-text-tertiary)' }}>
            {filter === 'all' ? 'check_circle' : filter === 'confirmed' ? 'verified' : filter === 'recommended' ? 'star' : filter === 'review' ? 'rate_review' : 'lock'}
          </span>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {filter === 'all'
              ? '검토할 항목이 없습니다'
              : filter === 'confirmed'
                ? '확정된 항목이 없습니다'
                : filter === 'recommended'
                  ? '추천 라벨이 없습니다'
                  : filter === 'review'
                    ? '검토 대기 항목이 없습니다'
                    : '잠금 항목이 없습니다'}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => navigate('/assets')}
              className="mt-2 text-xs underline"
              style={{ color: 'var(--color-accent)' }}
            >
              자산 페이지에서 자동 라벨링 실행
            </button>
          )}
        </div>
      )}

      {/* 세션 카드 리스트 */}
      <div className="flex flex-col gap-3">
        {visible.map((session) => {
          const result = results.get(session.id)
          const isConfirmed = session.labelStatus === 'CONFIRMED'
          const isLocked = session.labelStatus === 'LOCKED'

          // 표시할 라벨 정보 — 영어 키 정규화
          const displayRel = normalizeLabel(session.labels?.relationship) ?? (result ? REL_EN_TO_KO[result.relationship] : null)
          const displayDomain = normalizeLabel(session.labels?.domain) ?? (result ? DOMAIN_EN_TO_KO[result.domain] : null)
          const displayPurpose = normalizeLabel(session.labels?.purpose) ?? result?.purpose
          const displayTone = normalizeLabel(session.labels?.tone) ?? result?.tone
          const displayNoise = normalizeLabel(session.labels?.noise) ?? result?.noise

          return (
            <div
              key={session.id}
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: isConfirmed
                  ? '1px solid var(--color-accent)'
                  : '1px solid var(--color-border)',
                opacity: isConfirmed ? 0.85 : 1,
              }}
            >
              {/* 헤더 */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>
                    {maskSessionTitle(session.title)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{session.date}</span>
                    <span className="text-xs" style={{ color: 'var(--color-border)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{formatDuration(session.duration)}</span>
                  </div>
                </div>
                <LabelStatusBadge status={session.labelStatus ?? null} />
              </div>

              {/* 라벨 태그 (모든 필드 표시) */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {displayRel && (
                  <LabelChip label="관계" value={displayRel} />
                )}
                {displayDomain && (
                  <LabelChip label="도메인" value={displayDomain} />
                )}
                {displayPurpose && (
                  <LabelChip label="목적" value={displayPurpose} />
                )}
                {displayTone && (
                  <LabelChip label="톤" value={displayTone} />
                )}
                {displayNoise && (
                  <LabelChip label="소음" value={displayNoise} />
                )}
              </div>

              {/* 신뢰도 바 (auto result 있을 때만) */}
              {result && !isConfirmed && (
                <div className="flex flex-col gap-1.5 mb-3">
                  <ConfidenceBar label="관계" value={result.relConfidence} />
                  <ConfidenceBar label="도메인" value={result.domConfidence} />
                </div>
              )}

              {/* 액션 버튼 — 3버튼: 맞아요 / 수정 / 모르겠어요 */}
              {!isLocked && !isConfirmed && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirm(session.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
                  >
                    <span className="material-symbols-outlined text-sm">check</span>
                    맞아요
                  </button>
                  <button
                    onClick={() => handleEdit(session.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--color-surface-alt)',
                      color: 'var(--color-text-sub)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    수정
                  </button>
                  <button
                    onClick={() => handleSkip(session.id)}
                    className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--color-muted)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    <span className="material-symbols-outlined text-sm">help</span>
                    모르겠어요
                  </button>
                </div>
              )}

              {/* 확정된 세션 — 수정 버튼만 */}
              {isConfirmed && (
                <button
                  onClick={() => handleEdit(session.id)}
                  className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--color-surface-alt)',
                    color: 'var(--color-text-sub)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  라벨 수정
                </button>
              )}

              {isLocked && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-muted)' }}>
                  <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-tertiary)' }}>info</span>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    PII 감지로 잠금 처리된 세션입니다.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 더 보기 */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
          className="w-full mt-3 py-3 rounded-xl text-xs font-semibold"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}
        >
          더 보기 ({filtered.length - visibleCount}건 남음)
        </button>
      )}

      {/* 하단 일괄 확정 버튼 */}
      {hasBottomAction && (
        <div
          className="fixed left-0 right-0 px-4 pt-3 z-40"
          style={{
            bottom: 'calc(4rem + env(safe-area-inset-bottom))',
            paddingBottom: '12px',
            backgroundColor: 'var(--color-bg)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <button
            onClick={handleConfirmAllRecommended}
            className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            <span className="material-symbols-outlined text-lg">done_all</span>
            추천 {counts.recommended}건 모두 확정
          </button>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-center"
          style={{
            bottom: hasBottomAction ? 'calc(10rem + env(safe-area-inset-bottom))' : 'calc(5rem + env(safe-area-inset-bottom))',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-sub)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ── 라벨 칩 (인라인 컴포넌트) ─────────────────────────────────────────

function LabelChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]"
      style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}
    >
      <span className="font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      {value}
    </span>
  )
}

// ── 신뢰도 바 (인라인 컴포넌트) ──────────────────────────────────────

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold w-10 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-muted)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: value >= 0.9
              ? 'var(--color-accent)'
              : value >= 0.6
                ? 'var(--color-text-sub)'
                : 'var(--color-text-tertiary)',
          }}
        />
      </div>
      <span className="text-[10px] flex-shrink-0 w-8 text-right" style={{ color: 'var(--color-text-tertiary)' }}>
        {pct}%
      </span>
    </div>
  )
}
