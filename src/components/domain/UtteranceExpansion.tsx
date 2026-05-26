import { useCallback, useEffect, useMemo, useState } from 'react'
import { type AdminSession } from '../../types/adminSession'
import { type AdminUtterance } from '../../lib/api/utterances'
import { analyzeSessionRisk } from '../../lib/piiRisk'
import { formatDuration } from '../../lib/earnings'
import { UtteranceReviewRow } from './UtteranceReviewRow'
import { SessionReviewPanel } from './SessionReviewPanel'
import { QualityReviewReportCard } from './QualityReviewReportCard'
import { PiiCandidateReviewSection } from './PiiCandidateReviewSection'
import { getPiiCandidates } from '../../lib/api/piiCandidates'
import type { PiiCandidate, PiiDecision } from '../../types/piiCandidate'

interface UtteranceExpansionProps {
  session: AdminSession
  utterances: AdminUtterance[]
  selectedSet: Set<string>
  updatingId: string | null
  actionLoading?: boolean
  onToggleUtterance: (utteranceId: string) => void
  onSelectAll: () => void
  onToggleReview: (u: AdminUtterance) => void
  onLabelSaved: (id: string, updatedFields: Partial<AdminUtterance>) => void
  onApprove?: (note?: string) => void
  onNeedsRevision?: (note?: string) => void
  onRejectPanel?: (note?: string) => void
}

function ReviewStatusBadge({ status }: { status: AdminSession['review_status'] }) {
  switch (status) {
    case 'pending':
      return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">대기</span>
    case 'in_review':
      return <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">검수 중</span>
    case 'approved':
      return <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">승인</span>
    case 'needs_revision':
      return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">수정필요</span>
    case 'rejected':
      return <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">거절</span>
    default:
      return null
  }
}

export function UtteranceExpansion({
  session,
  utterances,
  selectedSet,
  updatingId,
  actionLoading,
  onToggleUtterance,
  onSelectAll,
  onToggleReview,
  onLabelSaved,
  onApprove,
  onNeedsRevision,
  onRejectPanel,
}: UtteranceExpansionProps) {
  const [reviewNote, setReviewNote] = useState('')
  const [qualityRefreshKey, setQualityRefreshKey] = useState(0)

  // PII 후보를 세션 단위로 불러와 상단 후보 카드와 발화 행에서 공유한다.
  // 상단 카드 = 검수 대기(pending) 후보만. 행 차단(blockedTypes) = pending ∪ 이미 확정(confirmed).
  //   confirmed 후보는 status='decided' 라 기본 큐에서 빠지지만, 같은 유형 수동 재등록을
  //   막아야 하므로(발화×유형 단위 dedup) 별도로 받아 차단 집합에만 합친다(카드에는 미표시).
  const [piiCandidates, setPiiCandidates] = useState<PiiCandidate[]>([])
  const [confirmedCandidates, setConfirmedCandidates] = useState<PiiCandidate[]>([])
  const [piiLoading, setPiiLoading] = useState(true)
  const [piiError, setPiiError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPiiLoading(true)
    setPiiError(null)
    Promise.all([
      getPiiCandidates({ sessionId: session.id }),
      // status='decided' 중 admin_decision='confirmed' 만 차단에 사용(rejected/skipped 제외).
      getPiiCandidates({ sessionId: session.id, status: 'decided' }),
    ]).then(([pendingRes, decidedRes]) => {
      if (!alive) return
      if (pendingRes.error) setPiiError(pendingRes.error)
      else setPiiCandidates(pendingRes.data ?? [])
      // 확정 후보 조회 실패는 카드 표시를 막지 않는다(차단 보강은 best-effort, 동일 span 은 서버 409 가 방어).
      if (!decidedRes.error) {
        setConfirmedCandidates(
          (decidedRes.data ?? []).filter((c) => c.admin_decision === 'confirmed'),
        )
      }
      setPiiLoading(false)
    })
    return () => {
      alive = false
    }
  }, [session.id])

  // 후보 판정 시: confirmed 는 pending→confirmed 로 이동(유형 차단 유지), rejected/skipped 는 제거(차단 해제).
  // → 상단 카드(pending)와 행 차단(pending∪confirmed)이 재조회 없이 즉시 일관되게 갱신된다.
  const handleCandidateDecided = useCallback(
    (candidateId: string, decision: PiiDecision) => {
      const decided = piiCandidates.find((c) => c.id === candidateId)
      setPiiCandidates((prev) => prev.filter((c) => c.id !== candidateId))
      if (decided && decision === 'confirmed') {
        setConfirmedCandidates((cs) =>
          cs.some((x) => x.id === candidateId)
            ? cs
            : [...cs, { ...decided, status: 'decided', admin_decision: 'confirmed' }],
        )
      }
    },
    [piiCandidates],
  )

  // utterance_id 기준 그룹핑(pending + confirmed). 행은 두 상태를 구분해 배지/문구를 다르게 렌더한다.
  const candidatesByUtterance = useMemo(() => {
    const map = new Map<string, PiiCandidate[]>()
    for (const c of [...piiCandidates, ...confirmedCandidates]) {
      const arr = map.get(c.utterance_id)
      if (arr) arr.push(c)
      else map.set(c.utterance_id, [c])
    }
    return map
  }, [piiCandidates, confirmedCandidates])

  const includable = utterances.filter((u) => u.review_status !== 'excluded')
  const allSelected = includable.length > 0 && selectedSet.size === includable.length
  const risk = useMemo(() => analyzeSessionRisk(utterances), [utterances])
  const totalPrice = useMemo(
    () =>
      utterances
        .filter((u) => u.review_status !== 'excluded')
        .reduce((sum, u) => sum + (u.unit_price_krw ?? 0), 0),
    [utterances],
  )
  const isInReview = session.review_status === 'in_review'
  const hasActions = Boolean(onApprove || onNeedsRevision || onRejectPanel)

  return (
    <div className="border-t border-border-light bg-surface-alt">

      {/* 패널 헤더 */}
      <div className="px-4 py-3 bg-surface border-b border-border-light flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-txt truncate">
            {session.title ?? `통화 ${session.id.slice(-6)}`}
          </div>
          <div className="text-xs text-txt-sub mt-0.5">
            {new Date(session.date).toLocaleDateString('ko-KR')} · {formatDuration(session.duration_seconds)}
          </div>
        </div>
        <ReviewStatusBadge status={session.review_status} />
      </div>

      {/* 액션 바: 전체 듣기 / 마스킹 전후 비교 / 검수자 */}
      <div className="px-4 py-2 bg-surface border-b border-border-light flex items-center gap-3">
        <button
          type="button"
          disabled
          title="준비 중인 기능입니다"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border text-txt-sub bg-surface-alt cursor-not-allowed opacity-60"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          전체 듣기
          <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">준비 중</span>
        </button>
        <button
          type="button"
          disabled
          title="준비 중인 기능입니다"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border text-txt-sub bg-surface-alt cursor-not-allowed opacity-60"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          마스킹 전후 비교
          <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">준비 중</span>
        </button>
        <div className="flex-1" />
        <span className="text-xs text-txt-sub">
          검수자: <span className="text-txt">진행 중</span>
        </span>
      </div>

      {/* 검수 결정 근거 패널 (화자·품질·PII) */}
      <SessionReviewPanel session={session} />

      {/* PII 후보 검토 (PII-1B) — 후보는 부모가 보유, 카드는 표시·판정만 담당 */}
      <PiiCandidateReviewSection
        candidates={piiCandidates}
        loading={piiLoading}
        error={piiError}
        onDecided={handleCandidateDecided}
      />

      {/* 저품질(C) 검수 큐 리포트 — C등급 발화 보유 세션만 표시 */}
      <QualityReviewReportCard sessionId={session.id} refreshKey={qualityRefreshKey} />

      {/* 발화 목록 헤더 */}
      <div className="px-4 py-2 flex items-center gap-3 border-b border-border-light text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-txt-sub">전체 선택 (제외 제외 {includable.length}건)</span>
        </label>
        {session.review_status !== 'approved' && (
          <span className="text-warning text-xs">⚠ 통화 검수 미승인 — 납품 차단됩니다</span>
        )}
      </div>

      {/* 발화 목록 */}
      <div className="divide-y divide-border-light">
        {utterances.map((u) => (
          <UtteranceReviewRow
            key={u.id}
            utterance={u}
            piiCandidates={candidatesByUtterance.get(u.id) ?? []}
            checked={selectedSet.has(u.id)}
            included={u.review_status === 'pending'}
            busy={updatingId === u.id}
            isDanger={risk.dangerUttIds.has(u.id)}
            onToggleSelect={() => onToggleUtterance(u.id)}
            onToggleReview={() => onToggleReview(u)}
            onLabelSaved={onLabelSaved}
            onQualityReviewUpdated={() => setQualityRefreshKey((k) => k + 1)}
          />
        ))}
      </div>

      {/* 검수 노트 + 하단 액션 (검수 중 상태만) */}
      {isInReview && hasActions && (
        <div className="px-4 py-3 border-t border-border bg-surface space-y-3">
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="검수 노트 — 거절·수정요청 시 사유 기록 (선택)"
            rows={2}
            className="w-full px-3 py-2 rounded border border-border bg-surface-alt text-xs text-txt placeholder:text-txt-sub resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center justify-between">
            <div className="text-sm text-txt-sub">
              예상 정산
              <span className="ml-2 font-semibold text-txt tabular-nums">
                ₩{totalPrice.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onRejectPanel && (
                <button
                  type="button"
                  onClick={() => {
                    if (!reviewNote.trim() && !window.confirm('거절 사유 없이 진행하시겠습니까?')) return
                    onRejectPanel(reviewNote || undefined)
                  }}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                >
                  거절
                </button>
              )}
              {onNeedsRevision && (
                <button
                  type="button"
                  onClick={() => onNeedsRevision(reviewNote || undefined)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded text-xs font-medium border border-border text-txt-sub hover:bg-surface-alt disabled:opacity-50 transition-colors"
                >
                  수정 필요
                </button>
              )}
              {onApprove && (
                <button
                  type="button"
                  onClick={() => onApprove(reviewNote || undefined)}
                  disabled={actionLoading}
                  className="px-4 py-1.5 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? '처리 중…' : '승인'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
