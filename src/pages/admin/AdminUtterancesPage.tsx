// ── AdminUtterancesPage — BM v10 발화 단위 검수 + 납품 트리 ──────────────────
//
// 구조: 통화(session) → 펼치면 발화(utterance) 목록
//
// 동작:
//   - 통화 row: 제목, 길이, review_status, 발화 N건, 예상 단가 합계
//   - 펼치기 토글 → 발화 목록 표시 (체크박스 + 검수 토글)
//   - 헤더 sticky 바: 선택 발화 카운트 + "선택 발화 납품" 버튼
//   - 다이얼로그: client 선택 + 가격 + 중복 사전 안내
//
// 제약:
//   - 백엔드 utterance limit cap=5000/page → 한 페이지에 모든 통화/발화 표시.
//   - 같은 (session, client) 두 번 납품 X (백엔드 UNIQUE 409)
//   - session.review_status='approved' 필수 (다이얼로그에서 사전 안내)

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card,
  Input,
  Select,
  Badge,
  Button,
  ErrorBanner,
  type SelectOption,
} from '../../components/ui'
// Badge is used in SessionRow; renderTextWithPiiHint/formatMs delegated to UtteranceReviewRow
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
import { DeliveryDialog, type SelectedUtterance } from '../../components/domain/DeliveryDialog'
import { UtteranceReviewRow } from '../../components/domain/UtteranceReviewRow'
import { analyzeSessionRisk, type SessionRiskResult } from '../../lib/piiRisk'

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

interface SessionGroup {
  sessionId: string
  title: string | null
  durationSec: number | null
  reviewStatus: string
  consentStatus: string | null
  utterances: AdminUtterance[]
  totalUnitPriceKrw: number
  excludedCount: number
}

function groupBySession(rows: AdminUtterance[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>()
  for (const u of rows) {
    let g = map.get(u.session_id)
    if (!g) {
      g = {
        sessionId: u.session_id,
        title: u.session_title,
        durationSec: u.session_duration_sec,
        reviewStatus: u.session_review_status,
        consentStatus: u.session_consent_status,
        utterances: [],
        totalUnitPriceKrw: 0,
        excludedCount: 0,
      }
      map.set(u.session_id, g)
    }
    g.utterances.push(u)
    g.totalUnitPriceKrw += u.unit_price_krw
    if (u.review_status === 'excluded') g.excludedCount += 1
  }
  return Array.from(map.values())
}

export default function AdminUtterancesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const settled = (searchParams.get('settled') ?? 'all') as 'all' | 'yes' | 'no'
  const review = (searchParams.get('review') ?? 'all') as 'all' | UtteranceReviewStatus
  const labelSource = (searchParams.get('label_source') ?? 'all') as 'all' | LabelSource
  const search = searchParams.get('q') ?? ''
  const sessionId = searchParams.get('session') ?? ''

  const [data, setData] = useState<UtteranceListResponse | null>(null)
  const [stats, setStats] = useState<UtteranceStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map())
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams)
      if (value == null || value === '' || value === 'all') next.delete(key)
      else next.set(key, value)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [list, st] = await Promise.all([
      fetchUtterances({
        settled: settled === 'all' ? undefined : settled,
        review: review === 'all' ? undefined : review,
        sessionId: sessionId || undefined,
        search: search || undefined,
        limit: 5000,
        orderBy: 'created_at_desc',
      }),
      fetchUtteranceStats(),
    ])
    if (list.error) setError(list.error)
    else setData(list.data ?? null)
    if (!st.error) setStats(st.data ?? null)
    setLoading(false)
  }, [settled, review, sessionId, search])

  useEffect(() => {
    load()
  }, [load])

  const allGroups = useMemo(
    () => groupBySession(data?.utterances ?? []),
    [data],
  )

  // label_source 클라이언트 필터 (needs_review / auto_review 우선)
  const groups = useMemo(() => {
    if (labelSource === 'all') return allGroups
    return allGroups
      .map((g) => ({
        ...g,
        utterances: g.utterances.filter((u) => u.label_source === labelSource),
      }))
      .filter((g) => g.utterances.length > 0)
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

  // 필터 변경 시 페이지 리셋
  useEffect(() => {
    setPage(1)
  }, [settled, review, labelSource, sessionId, search, pageSize])

  // 페이지 단위 slice (클라이언트 사이드)
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedGroups = useMemo(
    () => groups.slice((safePage - 1) * pageSize, safePage * pageSize),
    [groups, safePage, pageSize],
  )

  // 검색으로 session 진입 시 자동 펼치기
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

  const toggleUtteranceSelect = (sessionId: string, utteranceId: string) => {
    setSelected((cur) => {
      const next = new Map(cur)
      const set = new Set(next.get(sessionId) ?? [])
      if (set.has(utteranceId)) set.delete(utteranceId)
      else set.add(utteranceId)
      if (set.size === 0) next.delete(sessionId)
      else next.set(sessionId, set)
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
                      exclude_reason: nextIncluded ? null : (u.exclude_reason ?? 'manual'),
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
            sessionTitle: g.title,
            reviewStatusOfSession: g.reviewStatus,
            utteranceId: u.id,
          })
        }
      }
    }
    return list
  }, [groups, selected])

  const selectedCount = selectedList.length

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-txt">{labels.noun.utterance} 검수 + 납품</h1>
          <p className="mt-1 text-sm text-txt-sub">
            통화별로 펼쳐서 발화 단위 검수 + 다중 선택 납품. 단가 = 길이(초) × 시간당 단가 / 3600.
          </p>
        </div>
        {!loading && (
          <div className="text-right text-xs text-txt-sub whitespace-nowrap pt-1">
            <div>
              통화 <span className="font-semibold text-txt text-sm">{groups.length.toLocaleString('ko-KR')}</span>개
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

      {/* 요약 */}
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
          <div className="text-xs text-txt-sub">미정산</div>
          <div className="mt-1 text-2xl font-bold text-warning">
            {stats?.unsettledCount.toLocaleString('ko-KR') ?? 0}
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-txt-sub">예상 매출</div>
          <div className="mt-1 text-xl font-bold text-txt tabular-nums">
            ₩{(stats?.estimatedRevenueKrw ?? 0).toLocaleString('ko-KR')}
          </div>
        </Card>
      </div>

      {/* 필터 */}
      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Select
            label="검수 상태"
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
            label="자동라벨 상태"
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
            label="발화 검색"
            placeholder="텍스트 검색"
            value={search}
            onChange={(e) => updateParam('q', e.target.value)}
          />
        </div>
        {labelSource !== 'all' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-txt-sub">
              자동라벨 필터:
            </span>
            <span className="text-xs font-medium text-accent">
              {LABEL_SOURCE_OPTIONS.find((o) => o.value === labelSource)?.label}
            </span>
            <button
              type="button"
              onClick={() => updateParam('label_source', null)}
              className="text-xs text-txt-sub hover:text-txt underline"
            >
              필터 해제
            </button>
          </div>
        )}
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* 페이지네이션 (필터 ↔ 리스트 사이) */}
      {!loading && groups.length > 0 && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={groups.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* 트리 */}
      {loading ? (
        <Card padding="md">
          <div className="text-center text-txt-sub text-sm py-10">불러오는 중...</div>
        </Card>
      ) : groups.length === 0 ? (
        <Card padding="md">
          <div className="text-center text-txt-sub text-sm py-10">
            발화가 없습니다. GPU 처리(STT + 화자 분리) 완료 후 생성됩니다.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {pagedGroups.map((g) => (
            <SessionRow
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
            />
          ))}
        </div>
      )}

      {/* sticky 납품 바 */}
      {selectedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-light shadow-lg z-30">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="text-sm text-txt">
              <span className="font-semibold">{selectedCount}</span>건 선택됨 ·{' '}
              통화 <span className="font-semibold">{selected.size}</span>개
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
                선택 해제
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(true)}>
                선택 발화 납품
              </Button>
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
    </div>
  )
}

// ── SessionRow — 통화 단위 row + 펼침 ─────────────────────────────────────
interface SessionRowProps {
  group: SessionGroup
  expanded: boolean
  selectedSet: Set<string>
  updatingId: string | null
  onToggleExpand: () => void
  onToggleUtterance: (utteranceId: string) => void
  onSelectAll: () => void
  onToggleReview: (u: AdminUtterance) => void
  onLabelSaved: (id: string, updatedFields: Partial<AdminUtterance>) => void
}

function SessionRow({
  group, expanded, selectedSet, updatingId,
  onToggleExpand, onToggleUtterance, onSelectAll, onToggleReview, onLabelSaved,
}: SessionRowProps) {
  const includable = group.utterances.filter((u) => u.review_status !== 'excluded')
  const allSelected = includable.length > 0 && selectedSet.size === includable.length
  const risk: SessionRiskResult = useMemo(
    () => analyzeSessionRisk(group.utterances),
    [group.utterances],
  )

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors text-left"
      >
        <span className="material-symbols-outlined text-txt-sub text-base">
          {expanded ? 'expand_more' : 'chevron_right'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-txt truncate">
            {group.title || '(제목 없음)'}
          </div>
          <div className="text-xs text-txt-sub mt-0.5 flex items-center gap-2">
            <span className="font-mono">{group.sessionId.slice(0, 8)}…</span>
            <span>·</span>
            <span>{formatDurationCompact(group.durationSec)}</span>
            <span>·</span>
            <span>발화 {group.utterances.length}건</span>
            {group.excludedCount > 0 && (
              <>
                <span>·</span>
                <span className="text-warning">제외 {group.excludedCount}</span>
              </>
            )}
          </div>
        </div>
        {risk.level === 'high' && (
          <Badge
            tone="danger"
            size="sm"
            title={risk.reasons.join('\n')}
          >
            🚨 PII 의심
          </Badge>
        )}
        <Badge tone={reviewTone(group.reviewStatus)} size="sm">
          {reviewLabel(group.reviewStatus)}
        </Badge>
        <span
          className="tabular-nums text-sm font-semibold text-txt"
          title="시간당 ₩30,000 기준 · 확정 금액 아님 (검수·납품 후 결정)"
        >
          약 ₩{group.totalUnitPriceKrw.toLocaleString('ko-KR')}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border-light bg-surface-alt">
          <div className="px-4 py-2 flex items-center gap-3 border-b border-border-light text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-txt-sub">
                전체 선택 (제외 제외 {includable.length}건)
              </span>
            </label>
            {group.reviewStatus !== 'approved' && (
              <span className="text-warning text-xs">
                ⚠ 통화 검수 미승인 — 납품 차단됩니다
              </span>
            )}
          </div>

          <div className="divide-y divide-border-light">
            {group.utterances.map((u) => (
              <UtteranceReviewRow
                key={u.id}
                utterance={u}
                checked={selectedSet.has(u.id)}
                included={u.review_status === 'pending'}
                busy={updatingId === u.id}
                isDanger={risk.dangerUttIds.has(u.id)}
                onToggleSelect={() => onToggleUtterance(u.id)}
                onToggleReview={() => onToggleReview(u)}
                onLabelSaved={onLabelSaved}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────


function formatDurationCompact(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

function reviewTone(status: string): 'neutral' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'approved': return 'success'
    case 'rejected': return 'danger'
    case 'needs_revision': return 'warning'
    case 'in_review': return 'warning'
    default: return 'neutral'
  }
}

function reviewLabel(status: string): string {
  return (labels.review as Record<string, string>)[status] ?? status
}

// ── PaginationBar — 통화 단위 페이지네이션 ───────────────────────────────
interface PaginationBarProps {
  page: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (p: number) => void
  onPageSizeChange: (n: number) => void
}

const PAGE_SIZE_OPTIONS: SelectOption[] = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '30', label: '30개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
]

function PaginationBar({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const startIdx = (page - 1) * pageSize + 1
  const endIdx = Math.min(page * pageSize, totalItems)
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-txt-sub">
            {totalItems > 0 ? (
              <>
                <span className="font-semibold text-txt">{startIdx.toLocaleString('ko-KR')}</span>–
                <span className="font-semibold text-txt">{endIdx.toLocaleString('ko-KR')}</span> /{' '}
                {totalItems.toLocaleString('ko-KR')}통화
              </>
            ) : (
              <>0통화</>
            )}
          </span>
          <select
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10) || 20)}
            className="ml-2 text-xs px-2 py-1 rounded border border-border-light bg-surface text-txt cursor-pointer hover:bg-bg-hover"
          >
            {PAGE_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
          >
            처음
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            이전
          </Button>
          <span className="px-3 text-xs text-txt tabular-nums">
            <span className="font-semibold">{page}</span> / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            다음
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            끝
          </Button>
        </div>
      </div>
    </Card>
  )
}
