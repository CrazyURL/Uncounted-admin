// ── AdminUtterancesPage — BM v10 통합 검수 + 납품 페이지 ────────────────
//
// /admin/review 통합 후의 단일 검수 페이지.
//
// 구조:
//   - 헤더: 통화/발화 카운트
//   - 검수 카운트 카드 5종 (대기/검토중/승인/거절/재수정필요)
//   - 일괄 자동 승인 카드 (전역, 제외 제외)
//   - 필터 (통화 검수, 동의, 저품질, 발화 검수, 정산, 자동라벨, 검색)
//   - 통화 트리: 헤더(파이프라인 5점 + 검수 액션) → 펼침 = 발화 목록
//   - sticky: "선택 발화 납품" / "승인된 발화 일괄 납품"
//
// 데이터:
//   - 1차: fetchReviewQueue → AdminSession[] (파이프라인 진행 중 통화 포함)
//   - 2차: fetchUtterances → AdminUtterance[] (펼침 시 사용)
//   - 클라이언트 조인: session_id 기준
//
// 제약:
//   - 같은 (session, client) 두 번 납품 X (백엔드 UNIQUE 409)
//   - session.review_status='approved' 필수 (DeliveryDialog 사전 안내)
//   - 일괄 자동 승인: A등급 + PII 위험 없음 + ≥1초 + 화자 할당 등

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card,
  Input,
  Select,
  Button,
  ErrorBanner,
  ConfirmDialog,
  useToast,
  type SelectOption,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import {
  fetchUtterances,
  fetchUtteranceStats,
  updateUtteranceReviewStatus,
  type AdminUtterance,
  type UtteranceListResponse,
  type UtteranceStatsResponse,
  type UtteranceReviewStatus,
  type LabelSource,
} from '../../lib/api/utterances'
import {
  fetchReviewQueue,
  updateReviewStatus,
  bulkAutoApprove,
  type ReviewQueueResponse,
  type BulkAutoApproveResponse,
} from '../../lib/api/reviews'
import {
  type AdminSession,
  type ReviewStatus,
} from '../../types/adminSession'
import { DeliveryDialog, type SelectedUtterance } from '../../components/domain/DeliveryDialog'
import {
  AdminUtteranceSessionRow,
  type SessionGroup,
} from '../../components/domain/AdminUtteranceSessionRow'
import { SessionPaginationBar } from '../../components/domain/SessionPaginationBar'
import { type SessionReviewActionRequest } from '../../components/domain/SessionReviewActions'

// ── Filter options ──────────────────────────────────────────────────────

const SETTLED_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'yes', label: '정산 완료' },
  { value: 'no', label: '미정산' },
]

const REVIEW_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '검수 대기' },
  { value: 'excluded', label: '제외' },
]

const LABEL_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'needs_review', label: '확인 필요' },
  { value: 'auto_review', label: '검토 권장' },
  { value: 'auto_confirmed', label: '자동 확인' },
  { value: 'admin_confirmed', label: '어드민 확인' },
]

const SESSION_REVIEW_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: labels.review.pending },
  { value: 'in_review', label: labels.review.in_review },
  { value: 'approved', label: labels.review.approved },
  { value: 'rejected', label: labels.review.rejected },
  { value: 'needs_revision', label: labels.review.needs_revision },
]

const CONSENT_OPTIONS: SelectOption[] = [
  { value: 'all', label: '전체' },
  { value: 'both_agreed', label: labels.consent.both_agreed },
  { value: 'user_only', label: labels.consent.user_only },
]

// ── buildGroups ─────────────────────────────────────────────────────────

function buildGroups(
  sessions: AdminSession[],
  utterances: AdminUtterance[],
): SessionGroup[] {
  const uttBySession = new Map<string, AdminUtterance[]>()
  for (const u of utterances) {
    const arr = uttBySession.get(u.session_id) ?? []
    arr.push(u)
    uttBySession.set(u.session_id, arr)
  }
  return sessions.map((s) => {
    const list = uttBySession.get(s.id) ?? []
    return {
      sessionId: s.id,
      session: s,
      utterances: list,
      totalUnitPriceKrw: list.reduce((sum, u) => sum + u.unit_price_krw, 0),
      excludedCount: list.filter((u) => u.review_status === 'excluded').length,
    }
  })
}

// ── Main page ───────────────────────────────────────────────────────────

export default function AdminUtterancesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()

  // URL params
  const settled = (searchParams.get('settled') ?? 'all') as 'all' | 'yes' | 'no'
  const review = (searchParams.get('review') ?? 'all') as 'all' | UtteranceReviewStatus
  const labelSource = (searchParams.get('label_source') ?? 'all') as 'all' | LabelSource
  const search = searchParams.get('q') ?? ''
  const sessionId = searchParams.get('session') ?? ''
  const sessionReview = (searchParams.get('session_review') ?? 'all') as 'all' | ReviewStatus
  const consent = (searchParams.get('consent') ?? 'all') as 'all' | 'both_agreed' | 'user_only'
  const qualityLow = searchParams.get('low') === '1'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.max(5, Math.min(100, parseInt(searchParams.get('per') ?? '20', 10) || 20))

  // Data state
  const [data, setData] = useState<UtteranceListResponse | null>(null)
  const [reviewData, setReviewData] = useState<ReviewQueueResponse | null>(null)
  const [stats, setStats] = useState<UtteranceStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map())
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Review action state
  const [confirmAction, setConfirmAction] = useState<
    | {
        sessionId: string
        status: ReviewStatus
        label: string
        body: string
      }
    | null
  >(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Bulk auto-approve state
  const [bulkDryRun, setBulkDryRun] = useState<BulkAutoApproveResponse | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams)
      if (value == null || value === '' || value === 'all') next.delete(key)
      else next.set(key, value)
      if (key !== 'page' && key !== 'per') next.delete('page')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [list, st, rq] = await Promise.all([
      fetchUtterances({
        settled: settled === 'all' ? undefined : settled,
        review: review === 'all' ? undefined : review,
        sessionId: sessionId || undefined,
        search: search || undefined,
        limit: 5000,
        orderBy: 'created_at_desc',
      }),
      fetchUtteranceStats(),
      fetchReviewQueue({
        reviewStatus: sessionReview,
        qualityLow,
        search: search || undefined,
        limit: pageSize,
        page,
      }),
    ])
    if (list.error) setError(list.error)
    else setData(list.data ?? null)
    if (!st.error) setStats(st.data ?? null)
    if (rq.error && !list.error) setError(rq.error)
    else if (!rq.error) setReviewData(rq.data ?? null)
    setLoading(false)
  }, [settled, review, sessionId, search, sessionReview, qualityLow, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  // dry-run 자동 호출 — 자동 승인 가능 카운트 사전 표시
  const reloadBulkDryRun = useCallback(async () => {
    const res = await bulkAutoApprove({ dryRun: true })
    if (!res.error && res.data) setBulkDryRun(res.data)
  }, [])
  useEffect(() => {
    reloadBulkDryRun()
  }, [reloadBulkDryRun, reviewData])

  // Build groups: AdminSession 기준, utterances 조인
  const allGroups = useMemo(
    () => buildGroups(reviewData?.sessions ?? [], data?.utterances ?? []),
    [reviewData, data],
  )

  // label_source 클라이언트 필터 — utterance 단위만, session header 는 유지
  const groups = useMemo(() => {
    if (labelSource === 'all') return allGroups
    return allGroups.map((g) => ({
      ...g,
      utterances: g.utterances.filter((u) => u.label_source === labelSource),
    }))
  }, [allGroups, labelSource])

  // 라벨 저장 낙관 업데이트
  const handleLabelSaved = useCallback(
    (id: string, updatedFields: Partial<AdminUtterance>) => {
      setData((cur) =>
        cur
          ? {
              ...cur,
              utterances: cur.utterances.map((u) =>
                u.id === id ? { ...u, ...updatedFields } : u,
              ),
            }
          : cur,
      )
    },
    [],
  )

  const totalItems = reviewData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)

  // 검색으로 단일 session 진입 시 자동 펼치기
  useEffect(() => {
    if (sessionId && groups.length === 1) {
      setExpanded(new Set([groups[0].sessionId]))
    }
  }, [sessionId, groups])

  const toggleExpand = (sid: string) => {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  const toggleUtteranceSelect = (sid: string, uid: string) => {
    setSelected((cur) => {
      const next = new Map(cur)
      const set = new Set(next.get(sid) ?? [])
      if (set.has(uid)) set.delete(uid)
      else set.add(uid)
      if (set.size === 0) next.delete(sid)
      else next.set(sid, set)
      return next
    })
  }

  const toggleAllInSession = (group: SessionGroup) => {
    setSelected((cur) => {
      const next = new Map(cur)
      const existing = next.get(group.sessionId)
      const includable = group.utterances.filter((u) => u.review_status !== 'excluded')
      if (existing && existing.size === includable.length) {
        next.delete(group.sessionId)
      } else {
        next.set(group.sessionId, new Set(includable.map((u) => u.id)))
      }
      return next
    })
  }

  // "전체 승인된 발화 일괄 납품" — 승인된 통화의 비-제외 발화 전부 선택 후 다이얼로그
  const approvedGroups = useMemo(
    () => groups.filter((g) => (g.session.review_status ?? 'pending') === 'approved'),
    [groups],
  )

  const approvedNonExcludedCount = useMemo(
    () =>
      approvedGroups.reduce(
        (sum, g) => sum + g.utterances.filter((u) => u.review_status !== 'excluded').length,
        0,
      ),
    [approvedGroups],
  )

  const selectAllApproved = () => {
    const next = new Map<string, Set<string>>()
    for (const g of approvedGroups) {
      const includable = g.utterances.filter((u) => u.review_status !== 'excluded')
      if (includable.length === 0) continue
      next.set(g.sessionId, new Set(includable.map((u) => u.id)))
    }
    setSelected(next)
    setDialogOpen(true)
  }

  const handleToggleReview = useCallback(
    async (utterance: AdminUtterance) => {
      if (updatingId) return
      const nextIncluded = utterance.review_status !== 'pending'
      setUpdatingId(utterance.id)
      const prev = data
      setData((cur) =>
        cur
          ? {
              ...cur,
              utterances: cur.utterances.map((u) =>
                u.id === utterance.id
                  ? {
                      ...u,
                      review_status: nextIncluded ? 'pending' : 'excluded',
                      exclude_reason: nextIncluded ? null : u.exclude_reason ?? 'manual',
                    }
                  : u,
              ),
            }
          : cur,
      )
      const res = await updateUtteranceReviewStatus(utterance.id, nextIncluded)
      if (res.error) {
        setError(res.error)
        setData(prev)
      }
      setUpdatingId(null)
    },
    [data, updatingId],
  )

  // 통화 검수 액션 (승인/거절/재수정)
  const handleReviewAction = (sessionId: string, req: SessionReviewActionRequest) => {
    setConfirmAction({
      sessionId,
      status: req.status,
      label: req.label,
      body: req.body,
    })
  }

  const executeReviewAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    const res = await updateReviewStatus(confirmAction.sessionId, confirmAction.status)
    setActionLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(getToastForStatus(confirmAction.status))
    setConfirmAction(null)
    await load()
  }

  const handleBulkApprove = async () => {
    setBulkLoading(true)
    const res = await bulkAutoApprove({ dryRun: false })
    setBulkLoading(false)
    setBulkConfirm(false)
    if (res.error) {
      toast.error(`일괄 승인 실패: ${res.error}`)
      return
    }
    const d = res.data!
    toast.success(`일괄 승인 완료 — 승인 ${d.approved}건 / 보류 ${d.skipped}건`)
    await load()
    await reloadBulkDryRun()
  }

  // DeliveryDialog 에 넘길 선택 목록 평탄화
  const selectedList: SelectedUtterance[] = useMemo(() => {
    const list: SelectedUtterance[] = []
    for (const g of groups) {
      const set = selected.get(g.sessionId)
      if (!set) continue
      for (const u of g.utterances) {
        if (set.has(u.id)) {
          list.push({
            sessionId: g.sessionId,
            sessionTitle: g.session.title ?? null,
            reviewStatusOfSession: g.session.review_status ?? 'pending',
            utteranceId: u.id,
          })
        }
      }
    }
    return list
  }, [groups, selected])

  const selectedCount = selectedList.length
  const totalDurationSec = reviewData?.filteredDurationSec ?? 0

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-txt-sub">
            통화 단위 검수 (승인/거절) 와 발화 단위 검수 + 납품을 한 페이지에서 처리합니다.
          </p>
        </div>
        {!loading && (
          <div className="text-right text-xs text-txt-sub whitespace-nowrap pt-1">
            <div>
              통화 <span className="font-semibold text-txt text-sm">{(reviewData?.total ?? groups.length).toLocaleString('ko-KR')}</span>개
              {' · '}
              총 <span className="font-semibold text-txt text-sm">{formatDurationCompact(totalDurationSec)}</span>
            </div>
            <div className="mt-0.5">
              발화 <span className="font-semibold text-txt text-sm">{(data?.utterances.length ?? 0).toLocaleString('ko-KR')}</span>건
              {data && data.total > (data.utterances.length ?? 0) && (
                <> / 전체 {data.total.toLocaleString('ko-KR')}</>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 검수 상태 카운트 5종 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label={labels.review.pending} value={reviewData?.pendingCount ?? 0} />
        <SummaryCard label={labels.review.in_review} value={reviewData?.inReviewCount ?? 0} />
        <SummaryCard label={labels.review.approved} value={reviewData?.approvedCount ?? 0} sub={(reviewData?.approvedCount ?? 0) > 0 ? '납품 가능' : undefined} />
        <SummaryCard label={labels.review.rejected} value={reviewData?.rejectedCount ?? 0} />
        <SummaryCard label={labels.review.needs_revision} value={reviewData?.needsRevisionCount ?? 0} />
      </div>

      {/* 발화 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card padding="sm">
          <div className="text-xs text-txt-sub">총 발화</div>
          <div className="mt-1 text-2xl font-bold text-txt">
            {stats?.total.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">정산 완료</div>
          <div className="mt-1 text-2xl font-bold text-success">
            {stats?.settledCount.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">납품 전</div>
          <div className="mt-1 text-2xl font-bold text-warning">
            {stats?.unsettledCount.toLocaleString('ko-KR') ?? 0}
          </div>
          {(stats?.unsettledCount ?? 0) > 0 && (
            <div className="mt-0.5 text-xs text-warning">납품 대기 중</div>
          )}
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">예상 매출</div>
          <div className="mt-1 text-xl font-bold text-txt tabular-nums">
            ₩{(stats?.estimatedRevenueKrw ?? 0).toLocaleString('ko-KR')}
          </div>
        </Card>
      </div>

      {/* 조건부 일괄 자동 승인 (전역) */}
      {bulkDryRun && bulkDryRun.eligibleCount !== undefined && (
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="text-txt">
                전역 자동 승인 가능 <span className="font-bold text-accent">{bulkDryRun.eligibleCount}</span>건
                <span className="text-txt-sub"> · 보류 {bulkDryRun.skipped}건</span>
              </div>
              <div className="text-xs text-txt-sub mt-0.5">
                조건: A등급 + 숫자 7자리+ 없음 + ≥1초 + 화자 할당 + PII 위험 없음
                <span className="ml-1">· 현재 필터와 무관, 제외(rejected) 통화 자동 미포함</span>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={bulkDryRun.eligibleCount === 0 || bulkLoading}
              onClick={() => setBulkConfirm(true)}
            >
              {bulkLoading ? '처리 중…' : `${bulkDryRun.eligibleCount}건 일괄 승인`}
            </Button>
          </div>
        </Card>
      )}

      {/* 필터 */}
      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="통화 검수"
            value={sessionReview}
            options={SESSION_REVIEW_OPTIONS}
            onChange={(e) => updateParam('session_review', e.target.value)}
          />
          <Select
            label="동의"
            value={consent}
            options={CONSENT_OPTIONS}
            onChange={(e) => updateParam('consent', e.target.value)}
          />
          <Select
            label="발화 검수"
            value={review}
            options={REVIEW_OPTIONS}
            onChange={(e) => updateParam('review', e.target.value)}
          />
          <Select
            label="정산 상태"
            value={settled}
            options={SETTLED_OPTIONS}
            onChange={(e) => updateParam('settled', e.target.value)}
          />
          <Select
            label="자동라벨"
            value={labelSource}
            options={LABEL_SOURCE_OPTIONS}
            onChange={(e) => updateParam('label_source', e.target.value)}
          />
          <Input
            label="세션 ID"
            placeholder="세션 ID 일부"
            value={sessionId}
            onChange={(e) => updateParam('session', e.target.value)}
          />
          <Input
            label="검색"
            placeholder="제목 / 발화 텍스트"
            value={search}
            onChange={(e) => updateParam('q', e.target.value)}
          />
          <div className="flex flex-col">
            <label className="block text-sm font-medium text-txt mb-1.5">우선 정렬</label>
            <label className="inline-flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={qualityLow}
                onChange={(e) => updateParam('low', e.target.checked ? '1' : null)}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-txt">저품질 우선</span>
            </label>
          </div>
        </div>
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* 페이지네이션 */}
      {!loading && groups.length > 0 && (
        <SessionPaginationBar
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={reviewData?.total ?? 0}
          onPageChange={(p) => updateParam('page', String(p))}
          onPageSizeChange={(ps) => updateParam('per', String(ps))}
        />
      )}

      {/* 통화 트리 */}
      {loading ? (
        <Card padding="md">
          <div className="text-center text-txt-sub text-sm py-10">불러오는 중...</div>
        </Card>
      ) : groups.length === 0 ? (
        <Card padding="md">
          <div className="text-center text-txt-sub text-sm py-10">
            조건에 맞는 통화가 없습니다.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <AdminUtteranceSessionRow
              key={g.sessionId}
              group={g}
              expanded={expanded.has(g.sessionId)}
              selectedSet={selected.get(g.sessionId) ?? new Set()}
              updatingId={updatingId}
              onToggleExpand={() => toggleExpand(g.sessionId)}
              onToggleUtterance={(uid) => toggleUtteranceSelect(g.sessionId, uid)}
              onSelectAll={() => toggleAllInSession(g)}
              onToggleReview={handleToggleReview}
              onLabelSaved={handleLabelSaved}
              onReviewAction={(req) => handleReviewAction(g.sessionId, req)}
            />
          ))}
        </div>
      )}

      {/* sticky 납품 바 */}
      {(selectedCount > 0 || approvedNonExcludedCount > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-light shadow-lg z-30">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-txt">
              {selectedCount > 0 ? (
                <>
                  <span className="font-semibold">{selectedCount}</span>건 선택됨 ·{' '}
                  통화 <span className="font-semibold">{selected.size}</span>개
                </>
              ) : (
                <>
                  승인된 통화 <span className="font-semibold">{approvedGroups.length}</span>개 ·{' '}
                  납품 가능 발화 <span className="font-semibold">{approvedNonExcludedCount}</span>건
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
                  선택 해제
                </Button>
              )}
              {approvedNonExcludedCount > 0 && selectedCount === 0 && (
                <Button variant="secondary" onClick={selectAllApproved}>
                  승인된 발화 일괄 납품 ({approvedNonExcludedCount}건)
                </Button>
              )}
              {selectedCount > 0 && (
                <Button variant="primary" onClick={() => setDialogOpen(true)}>
                  선택 발화 납품
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <DeliveryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        selected={selectedList}
        onSuccess={() => {
          setSelected(new Map())
          load()
        }}
      />

      {/* 통화 검수 확인 모달 */}
      {confirmAction && (
        <ConfirmDialog
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={executeReviewAction}
          title={confirmAction.label}
          body={confirmAction.body}
          confirmLabel={confirmAction.label}
          variant={confirmAction.status === 'rejected' ? 'danger' : 'primary'}
          loading={actionLoading}
        />
      )}

      {/* 일괄 자동 승인 확인 모달 */}
      {bulkConfirm && bulkDryRun && (
        <ConfirmDialog
          open
          onClose={() => setBulkConfirm(false)}
          onConfirm={handleBulkApprove}
          title="조건부 일괄 자동 승인"
          body={`자동 승인 가능 ${bulkDryRun.eligibleCount ?? 0}건을 일괄 approved 로 전환합니다. 보류된 ${bulkDryRun.skipped}건은 수동 검수 필요. label_source='auto:bulk_review' 로 기록됩니다.`}
          confirmLabel={`${bulkDryRun.eligibleCount ?? 0}건 승인`}
          variant="primary"
          loading={bulkLoading}
        />
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card padding="sm">
      <div className="text-xs text-txt-sub">{label}</div>
      <div className="mt-1 text-2xl font-bold text-txt">{value.toLocaleString('ko-KR')}</div>
      {sub && <div className="mt-0.5 text-xs text-txt-sub">{sub}</div>}
    </Card>
  )
}

function formatDurationCompact(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

function getToastForStatus(status: ReviewStatus): string {
  switch (status) {
    case 'approved':
      return labels.toast.approved
    case 'rejected':
      return labels.toast.rejected
    case 'needs_revision':
      return labels.toast.needsRevision
    default:
      return labels.toast.saved
  }
}

