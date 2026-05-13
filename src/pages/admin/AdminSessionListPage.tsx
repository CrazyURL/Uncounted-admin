import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { type QualityGrade, type DatasetFilterCriteria } from '../../types/dataset'
import {
  filtersToQuery,
  type AdminSortKey,
  type UserGroupSummary,
} from '../../lib/adminHelpers'
import { saveDataset } from '../../lib/datasetStore'
import { generateUUID } from '../../lib/uuid'
import {
  fetchAdminSessionsApi,
  fetchAdminUserStatsApi,
  fetchAdminSessionsAggregateApi,
} from '../../lib/api/admin'
import AdminFilterBar from '../../components/domain/AdminFilterBar'
import AdminSessionRow from '../../components/domain/AdminSessionRow'
import DatasetCreateModal from '../../components/domain/DatasetCreateModal'
import { resetAll } from '../../lib/resetAll'

type SortDir = 'asc' | 'desc'
type ViewMode = 'flat' | 'byUser'

const PAGE_SIZE = 30
const PAGE_SIZE_BY_USER = 50

const SORT_OPTIONS: { key: AdminSortKey; label: string }[] = [
  { key: 'date', label: '날짜' },
  { key: 'qaScore', label: '품질' },
  { key: 'duration', label: '시간' },
]

const USER_SORT_OPTIONS: { key: 'sessionCount' | 'totalDuration' | 'avgQaScore'; label: string }[] = [
  { key: 'sessionCount', label: '세션수' },
  { key: 'totalDuration', label: '총시간' },
  { key: 'avgQaScore', label: '평균품질' },
]

const DEFAULT_FILTERS: DatasetFilterCriteria = {
  domains: [],
  qualityGrades: [],
  labelStatus: 'all',
  publicStatus: 'all',
  piiCleanedOnly: false,
  hasAudioUrl: false,
  diarizationStatus: 'all',
  transcriptStatus: 'all',
  dateRange: null,
  uploadStatuses: [],
  consentStatus: 'all',
}

const CONSENT_FILTER_OPTIONS: { value: DatasetFilterCriteria['consentStatus']; label: string; color: string }[] = [
  { value: 'all',         label: '전체동의',     color: '#9ca3af' },
  { value: 'both_agreed', label: '양측동의',     color: '#22c55e' },
  { value: 'user_only',   label: '본인만동의',   color: '#f59e0b' },
  { value: 'locked',      label: '잠김',         color: '#ef4444' },
]

function formatDurationCompact(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '0분'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#f59e0b',
  C: '#ef4444',
}

export default function AdminSessionListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<DatasetFilterCriteria>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<AdminSortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  const [resetting, setResetting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  // STAGE 6.8 — raw title 매칭 검색 (응답엔 비노출). 개발 중 통화 식별 용도.
  // searchQuery: 즉시 입력 반영 (UI). debouncedSearch: 300ms 후 fetch 트리거 (한글 IME 조합 안전).
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])
  // flat 탭 state
  const [sessions, setSessions] = useState<Session[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [sessionOffset, setSessionOffset] = useState(0)
  const [sessionHasMore, setSessionHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // 합계 (필터 적용된 전체)
  const [totalDurationSec, setTotalDurationSec] = useState(0)

  // byUser 탭 state
  const [userGroups, setUserGroups] = useState<UserGroupSummary[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [userOffset, setUserOffset] = useState(0)
  const [userHasMore, setUserHasMore] = useState(false)
  const [userLoadingMore, setUserLoadingMore] = useState(false)
  const [userSortKey, setUserSortKey] = useState<'sessionCount' | 'totalDuration' | 'avgQaScore'>('sessionCount')

  // STAGE 7 — 트리 인라인 확장: 펼친 사용자 ID 집합 + 사용자별 통화 리스트 캐시
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())
  const [userSessionsMap, setUserSessionsMap] = useState<Map<string, {
    sessions: Session[]
    total: number
    offset: number
    loading: boolean
    pageSize: number
  }>>(new Map())

  const sessionOffsetRef = useRef(sessionOffset)
  const userOffsetRef = useRef(userOffset)
  sessionOffsetRef.current = sessionOffset
  userOffsetRef.current = userOffset

  const isTargetRoute =
    location.pathname === '/admin/calls' ||
    location.pathname === '/admin/sessions'

  // flat 탭 초기 로드 (필터/정렬/탭 변경 시 목록 초기화)
  useEffect(() => {
    if (!isTargetRoute || viewMode !== 'flat') return

    setLoading(true)
    setSessions([])
    setSessionOffset(0)
    setSessionHasMore(false)

    fetchAdminSessionsApi({
      limit: PAGE_SIZE,
      offset: 0,
      ...filtersToQuery(filters),
      sortBy: sortKey,
      sortDir,
      q: debouncedSearch.trim() || undefined,
    }).then(({ data, count }) => {
      const items = data ?? []
      setSessions(items)
      setTotalSessions(count ?? 0)
      setSessionHasMore(items.length < (count ?? 0))
      setSessionOffset(items.length)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminSessionList] fetchAdminSessionsApi failed:', err)
      setLoading(false)
    })

    // 동시에 합계 (count + totalDurationSec) 조회 — 카드 표시용
    fetchAdminSessionsAggregateApi({
      ...filtersToQuery(filters),
      q: debouncedSearch.trim() || undefined,
    }).then(({ data }) => {
      setTotalDurationSec(data?.totalDurationSec ?? 0)
    }).catch(err => {
      console.error('[AdminSessionList] fetchAdminSessionsAggregateApi failed:', err)
      setTotalDurationSec(0)
    })
  }, [filters, sortKey, sortDir, viewMode, location.pathname, debouncedSearch])

  // byUser 탭 초기 로드
  useEffect(() => {
    if (!isTargetRoute || viewMode !== 'byUser') return

    setLoading(true)
    setUserGroups([])
    setUserOffset(0)
    setUserHasMore(false)

    fetchAdminUserStatsApi({
      limit: PAGE_SIZE_BY_USER,
      offset: 0,
      ...filtersToQuery(filters),
      sortBy: userSortKey,
      sortDir,
    }).then(({ data, count }) => {
      const items = data ?? []
      setUserGroups(items)
      setTotalUsers(count ?? 0)
      setUserHasMore(items.length < (count ?? 0))
      setUserOffset(items.length)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminSessionList] fetchAdminUserStatsApi failed:', err)
      setLoading(false)
    })
  }, [filters, sortDir, userSortKey, viewMode, location.pathname])

  // flat 탭 "더 보기"
  async function loadMoreSessions() {
    setLoadingMore(true)
    try {
      const { data, count } = await fetchAdminSessionsApi({
        limit: PAGE_SIZE,
        offset: sessionOffsetRef.current,
        ...filtersToQuery(filters),
        sortBy: sortKey,
        sortDir,
      })
      const items = data ?? []
      const nextOffset = sessionOffsetRef.current + items.length
      setSessions(prev => [...prev, ...items])
      setSessionOffset(nextOffset)
      setTotalSessions(count ?? 0)
      setSessionHasMore(nextOffset < (count ?? 0))
    } catch (err) {
      console.error('[AdminSessionList] loadMoreSessions failed:', err)
    }
    setLoadingMore(false)
  }

  // STAGE 7 — 트리 사용자 확장/접기 토글
  async function toggleExpandUser(encUserId: string | null) {
    const key = encUserId ?? '__null__'
    const isExpanded = expandedUserIds.has(key)
    if (isExpanded) {
      setExpandedUserIds(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }
    // 펼침 + 캐시 없으면 첫 페이지 로드
    setExpandedUserIds(prev => new Set(prev).add(key))
    if (!userSessionsMap.has(key) && encUserId) {
      await loadUserSessionsPage(encUserId, 0, 20)
    }
  }

  async function loadUserSessionsPage(encUserId: string, offset: number, pageSize: number) {
    const key = encUserId
    setUserSessionsMap(prev => {
      const next = new Map(prev)
      const existing = next.get(key)
      next.set(key, {
        sessions: existing?.sessions ?? [],
        total: existing?.total ?? 0,
        offset,
        loading: true,
        pageSize,
      })
      return next
    })
    try {
      const { data, count } = await fetchAdminSessionsApi({
        limit: pageSize,
        offset,
        ...filtersToQuery(filters),
        sortBy: sortKey,
        sortDir,
        userId: encUserId,
      })
      setUserSessionsMap(prev => {
        const next = new Map(prev)
        next.set(key, {
          sessions: data ?? [],
          total: count ?? 0,
          offset,
          loading: false,
          pageSize,
        })
        return next
      })
    } catch (err) {
      console.error('[AdminSessionList] loadUserSessionsPage failed:', err)
      setUserSessionsMap(prev => {
        const next = new Map(prev)
        const existing = next.get(key)
        if (existing) next.set(key, { ...existing, loading: false })
        return next
      })
    }
  }

  // byUser 탭 "더 보기"
  async function loadMoreUsers() {
    setUserLoadingMore(true)
    try {
      const { data, count } = await fetchAdminUserStatsApi({
        limit: PAGE_SIZE_BY_USER,
        offset: userOffsetRef.current,
        ...filtersToQuery(filters),
        sortBy: userSortKey,
        sortDir,
      })
      const items = data ?? []
      const nextOffset = userOffsetRef.current + items.length
      setUserGroups(prev => [...prev, ...items])
      setUserOffset(nextOffset)
      setTotalUsers(count ?? 0)
      setUserHasMore(nextOffset < (count ?? 0))
    } catch (err) {
      console.error('[AdminSessionList] loadMoreUsers failed:', err)
    }
    setUserLoadingMore(false)
  }

  const selectedSessions = useMemo(
    () => sessions.filter(s => selectedIds.has(s.id)),
    [sessions, selectedIds],
  )

  function updateFilters(next: DatasetFilterCriteria) {
    setSessionOffset(0)
    setUserOffset(0)
    setFilters(next)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sessions.map(s => s.id)))
    }
  }

  function toggleDomain(d: string) {
    updateFilters({
      ...filters,
      domains: filters.domains.includes(d)
        ? filters.domains.filter(x => x !== d)
        : [...filters.domains, d],
    })
  }

  function toggleGrade(g: QualityGrade) {
    updateFilters({
      ...filters,
      qualityGrades: filters.qualityGrades.includes(g)
        ? filters.qualityGrades.filter(x => x !== g)
        : [...filters.qualityGrades, g],
    })
  }

  async function handleSyncAudioUrls() {
    setSyncing(true)
    try {
      const { syncAudioUrlsApi } = await import('../../lib/api/admin')
      const { data, error } = await syncAudioUrlsApi()
      if (error) {
        alert(`동기화 실패: ${error}`)
      } else {
        alert(`동기화 완료: ${data?.total ?? 0}개 WAV 파일 확인, ${data?.updated ?? 0}건 업데이트`)
        updateFilters({ ...filters })
      }
    } catch (err) {
      alert(`동기화 오류: ${err}`)
    }
    setSyncing(false)
  }

  async function handleResetAll() {
    if (!confirm('모든 데이터(세션/데이터셋/로그)를 삭제합니다. 계속하시겠습니까?')) return
    if (!confirm('정말 전체 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    setResetting(true)
    try {
      const result = await resetAll()
      const supaRows = Object.entries(result.supabase)
        .map(([t, v]) => `${t}: ${v}`)
        .join('\n')
      alert(`초기화 완료\n\nlocalStorage: ${result.localStorage}개 키 삭제\nIndexedDB: ${result.indexedDB ? '삭제' : '실패'}\nPreferences: ${result.capacitorPreferences}개 삭제\nFiles: ${result.capacitorFiles}개 삭제\n\nSupabase:\n${supaRows}`)
      await new Promise(r => setTimeout(r, 200))
      window.location.reload()
    } catch (err) {
      alert(`초기화 오류: ${err}`)
      setResetting(false)
    }
  }

  function handleCreate(name: string, description: string) {
    const now = new Date().toISOString()
    const dataset = {
      id: generateUUID(),
      name,
      description,
      sessionIds: [...selectedIds],
      status: 'draft' as const,
      filters,
      createdAt: now,
      updatedAt: now,
      exportedAt: null,
    }
    saveDataset(dataset)
    setShowCreate(false)
    setSelectedIds(new Set())
    navigate(`/admin/datasets/${dataset.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* 총 건수 요약 */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="rounded-lg p-2.5 text-center flex-1" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>세션</p>
          <p className="text-sm font-bold text-txt mt-0.5">{totalSessions.toLocaleString()}건</p>
        </div>
        <div className="rounded-lg p-2.5 text-center flex-1" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>통화 시간</p>
          <p className="text-sm font-bold text-txt mt-0.5">{formatDurationCompact(totalDurationSec)}</p>
        </div>
        <div className="rounded-lg p-2.5 text-center flex-1" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>사용자</p>
          <p className="text-sm font-bold text-txt mt-0.5">{totalUsers.toLocaleString()}명</p>
        </div>
      </div>

      {/* 동의 상태 필터 (BM v10 — 양측동의만 GPU 처리 대상) */}
      <div className="flex items-center gap-1.5 px-4 pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {CONSENT_FILTER_OPTIONS.map(opt => {
          const active = filters.consentStatus === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => updateFilters({ ...filters, consentStatus: opt.value })}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
              style={{
                backgroundColor: active ? `${opt.color}25` : 'var(--color-surface-alt)',
                color: active ? opt.color : 'var(--color-text-tertiary)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* 뷰 토글 */}
      <div className="flex items-center gap-1 px-4 py-2">
        {(['flat', 'byUser'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: viewMode === mode ? 'var(--color-accent)' : 'var(--color-surface-alt)',
              color: viewMode === mode ? '#fff' : 'var(--color-text-sub)',
            }}
          >
            {mode === 'flat' ? '전체' : '사용자별'}
          </button>
        ))}
      </div>

      {/* 필터 토글 + 정렬 */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: showFilters ? 'var(--color-accent)' : 'var(--color-text-sub)' }}
        >
          <span className="material-symbols-outlined text-base">filter_list</span>
          필터
        </button>

        {viewMode === 'flat' && (
          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as AdminSortKey)}
              className="text-xs py-1 px-2 rounded-lg border outline-none bg-transparent text-txt"
              style={{ borderColor: 'var(--color-border-light)' }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key} style={{ backgroundColor: 'var(--color-surface)' }}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="text-xs"
              style={{ color: 'var(--color-text-sub)' }}
            >
              <span className="material-symbols-outlined text-base">
                {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
              </span>
            </button>
          </div>
        )}

        {viewMode === 'byUser' && (
          <div className="flex items-center gap-2">
            <select
              value={userSortKey}
              onChange={e => setUserSortKey(e.target.value as typeof userSortKey)}
              className="text-xs py-1 px-2 rounded-lg border outline-none bg-transparent text-txt"
              style={{ borderColor: 'var(--color-border-light)' }}
            >
              {USER_SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key} style={{ backgroundColor: 'var(--color-surface)' }}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="text-xs"
              style={{ color: 'var(--color-text-sub)' }}
            >
              <span className="material-symbols-outlined text-base">
                {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* STAGE 6.8 — 통화 제목 검색 (개발용, 원본 파일명 매칭. 결과는 합성 라벨로 표시) */}
      <div className="px-4 py-2">
        <div className="relative">
          <span
            className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base"
            style={{ color: 'var(--color-text-sub)' }}
          >
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="통화 제목 검색 (개발용 — 원본 파일명 매칭)"
            className="w-full text-sm pl-8 pr-3 py-1.5 rounded-lg border outline-none bg-transparent text-txt"
            style={{ borderColor: 'var(--color-border-light)' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--color-text-sub)' }}
            >
              지우기
            </button>
          )}
        </div>
      </div>

      {/* 필터 바 */}
      {showFilters && (
        <AdminFilterBar
          selectedDomains={filters.domains}
          onToggleDomain={toggleDomain}
          selectedGrades={filters.qualityGrades}
          onToggleGrade={toggleGrade}
          labelStatus={filters.labelStatus}
          onLabelStatus={s => updateFilters({ ...filters, labelStatus: s })}
          publicStatus={filters.publicStatus}
          onPublicStatus={s => updateFilters({ ...filters, publicStatus: s })}
          piiOnly={filters.piiCleanedOnly}
          onPiiOnly={v => updateFilters({ ...filters, piiCleanedOnly: v })}
          selectedUploadStatuses={filters.uploadStatuses}
          onToggleUploadStatus={u => updateFilters({
            ...filters,
            uploadStatuses: filters.uploadStatuses.includes(u)
              ? filters.uploadStatuses.filter(x => x !== u)
              : [...filters.uploadStatuses, u],
          })}
          dateRange={filters.dateRange}
          onDateRange={dr => updateFilters({ ...filters, dateRange: dr })}
          onReset={() => updateFilters(DEFAULT_FILTERS)}
        />
      )}

      {/* 퀵 필터 바 */}
      <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {(['A', 'B', 'C'] as const).map(g => {
          const active = filters.qualityGrades.includes(g)
          return (
            <button
              key={g}
              onClick={() => toggleGrade(g)}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex-shrink-0"
              style={{
                backgroundColor: active ? `${GRADE_COLORS[g]}20` : 'var(--color-surface-alt)',
                color: active ? GRADE_COLORS[g] : 'var(--color-text-tertiary)',
              }}
            >
              {g}
            </button>
          )
        })}
        <span className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'var(--color-border-light)' }} />
        <button
          onClick={() => updateFilters({ ...filters, hasAudioUrl: !filters.hasAudioUrl })}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          style={{
            backgroundColor: filters.hasAudioUrl ? 'rgba(96,165,250,0.15)' : 'var(--color-surface-alt)',
            color: filters.hasAudioUrl ? '#60a5fa' : 'var(--color-text-tertiary)',
          }}
        >
          비식별화완료
        </button>
        <button
          onClick={() => updateFilters({
            ...filters,
            diarizationStatus: filters.diarizationStatus === 'done' ? 'all' : 'done',
          })}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          style={{
            backgroundColor: filters.diarizationStatus === 'done' ? 'rgba(167,139,250,0.15)' : 'var(--color-surface-alt)',
            color: filters.diarizationStatus === 'done' ? '#a78bfa' : 'var(--color-text-tertiary)',
          }}
        >
          화자분리완료
        </button>
        <button
          onClick={() => updateFilters({
            ...filters,
            transcriptStatus: filters.transcriptStatus === 'done' ? 'all' : 'done',
          })}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          style={{
            backgroundColor: filters.transcriptStatus === 'done' ? 'rgba(34,197,94,0.15)' : 'var(--color-surface-alt)',
            color: filters.transcriptStatus === 'done' ? '#22c55e' : 'var(--color-text-tertiary)',
          }}
        >
          자막있음
        </button>
        <button
          onClick={handleSyncAudioUrls}
          disabled={syncing}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-tertiary)' }}
        >
          {syncing ? '동기화중...' : '스토리지동기화'}
        </button>
      </div>

      {/* ── flat 뷰 ── */}
      {viewMode === 'flat' && (
        <>
          {/* 전체선택 + 카운트 */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b"
            style={{ borderColor: 'var(--color-surface-alt)' }}
          >
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--color-text-sub)' }}
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center border"
                style={{
                  borderColor: selectedIds.size === sessions.length && sessions.length > 0 ? 'var(--color-accent)' : 'var(--color-border)',
                  backgroundColor: selectedIds.size === sessions.length && sessions.length > 0 ? 'var(--color-accent)' : 'transparent',
                }}
              >
                {selectedIds.size === sessions.length && sessions.length > 0 && (
                  <span className="material-symbols-outlined text-txt text-xs">check</span>
                )}
              </div>
              전체 선택
            </button>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {sessions.length.toLocaleString()}건 표시 중
            </span>
          </div>

          {/* 세션 목록 */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {sessions.map(session => (
              <AdminSessionRow
                key={session.id}
                session={session}
                selected={selectedIds.has(session.id)}
                onToggle={toggleSelect}
              />
            ))}
          </motion.div>

          {sessions.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <span className="material-symbols-outlined text-3xl mb-2" style={{ color: 'var(--color-border-light)' }}>search_off</span>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>필터 조건에 맞는 세션이 없습니다</p>
            </div>
          )}

          {/* 더 보기 */}
          <LoadMoreBar
            shown={sessions.length}
            total={totalSessions}
            hasMore={sessionHasMore}
            loading={loadingMore}
            onLoadMore={loadMoreSessions}
          />
        </>
      )}

      {/* ── 사용자별 뷰 ── */}
      {viewMode === 'byUser' && (
        <>
          <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--color-surface-alt)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {totalUsers.toLocaleString()}명의 사용자
            </span>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-3 space-y-2">
            {userGroups.map(group => {
              const key = group.userId ?? '__null__'
              const expanded = expandedUserIds.has(key)
              const userSessionsState = group.userId ? userSessionsMap.get(group.userId) : null
              return (
                <UserGroupNode
                  key={key}
                  group={group}
                  expanded={expanded}
                  onToggleExpand={() => toggleExpandUser(group.userId)}
                  onOpenDetail={() => navigate(`/admin/users/${encodeURIComponent(group.userId ?? '__null__')}`)}
                  sessionsState={userSessionsState ?? null}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onChangePage={(offset, pageSize) => {
                    if (group.userId) loadUserSessionsPage(group.userId, offset, pageSize)
                  }}
                />
              )
            })}
          </motion.div>

          {userGroups.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <span className="material-symbols-outlined text-3xl mb-2" style={{ color: 'var(--color-border-light)' }}>search_off</span>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>필터 조건에 맞는 사용자가 없습니다</p>
            </div>
          )}

          {/* 더 보기 */}
          <LoadMoreBar
            shown={userGroups.length}
            total={totalUsers}
            hasMore={userHasMore}
            loading={userLoadingMore}
            onLoadMore={loadMoreUsers}
          />
        </>
      )}

      {/* 플로팅 액션 바 */}
      {selectedIds.size > 0 && viewMode === 'flat' && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between border-t"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border-light)',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <span className="text-sm text-txt font-medium">{selectedIds.size}건 선택됨</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-txt flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              <span className="material-symbols-outlined text-base">add_box</span>
              데이터셋 생성
            </button>
          </div>
        </div>
      )}

      {/* 전체 초기화 */}
      <div className="px-4 pt-6 pb-4">
        <button
          onClick={handleResetAll}
          disabled={resetting}
          className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <span className="material-symbols-outlined text-base">delete_forever</span>
          {resetting ? '초기화 중...' : '전체 데이터 초기화'}
        </button>
      </div>

      {/* 생성 모달 */}
      <DatasetCreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        sessions={selectedSessions}
        filters={filters}
        onCreate={handleCreate}
      />
    </div>
  )
}

// ── 더 보기 바 ────────────────────────────────────────────────────────────────

function LoadMoreBar({
  shown,
  total,
  hasMore,
  loading,
  onLoadMore,
}: {
  shown: number
  total: number
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {shown.toLocaleString()}건 표시 중 / 총 {total.toLocaleString()}건
      </span>
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-border-light)', color: 'var(--color-text-sub)' }}
        >
          {loading
            ? <span className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-text-sub)', borderTopColor: 'transparent' }} />
            : <span className="material-symbols-outlined text-sm">expand_more</span>
          }
          더 보기
        </button>
      )}
    </div>
  )
}

// ── 사용자 그룹 노드 (STAGE 7 — 인라인 트리 확장) ─────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const

type UserSessionsState = {
  sessions: Session[]
  total: number
  offset: number
  loading: boolean
  pageSize: number
}

function UserGroupNode({
  group,
  expanded,
  onToggleExpand,
  onOpenDetail,
  sessionsState,
  selectedIds,
  onToggleSelect,
  onChangePage,
}: {
  group: UserGroupSummary
  expanded: boolean
  onToggleExpand: () => void
  onOpenDetail: () => void
  sessionsState: UserSessionsState | null
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onChangePage: (offset: number, pageSize: number) => void
}) {
  const total = sessionsState?.total ?? group.sessionCount
  const pageSize = sessionsState?.pageSize ?? 20
  const offset = sessionsState?.offset ?? 0
  const currentPage = Math.floor(offset / pageSize) + 1
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)' }}>
      {/* 헤더 — 펼침 토글 + 상세 페이지 진입 */}
      <div className="flex items-center gap-1 p-3.5">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <span
            className="material-symbols-outlined text-lg transition-transform"
            style={{
              color: 'var(--color-text-tertiary)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            chevron_right
          </span>
          <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-text-tertiary)' }}>person</span>
          <p className="text-sm font-medium text-txt truncate">{group.displayId}</p>
        </button>
        <button
          onClick={onOpenDetail}
          className="px-2 py-1 rounded-md text-[11px] font-medium"
          style={{ backgroundColor: 'var(--color-border-light)', color: 'var(--color-text-sub)' }}
          title="사용자 상세 페이지"
        >
          상세
        </button>
      </div>

      {/* 통계 그리드 */}
      <button onClick={onToggleExpand} className="w-full px-3.5 pb-3 text-left">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '세션', value: `${group.sessionCount}건` },
            { label: '시간', value: `${group.totalDurationHours.toFixed(1)}h` },
            { label: '품질', value: `${group.avgQaScore}점` },
            { label: '라벨률', value: `${Math.round(group.labeledRatio * 100)}%` },
          ].map(item => (
            <div key={item.label} className="text-center">
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</p>
              <p className="text-xs font-bold text-txt">{item.value}</p>
            </div>
          ))}
        </div>
      </button>

      {/* 펼침 — 통화 리스트 + 페이지네이션 */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--color-border-light)' }}>
          {/* 페이지네이션 바 (필터-리스트 사이) */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--color-border-light)', backgroundColor: 'var(--color-surface-alt)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                통화 {total.toLocaleString()}건
              </span>
              <select
                value={pageSize}
                onChange={e => onChangePage(0, Number(e.target.value))}
                className="text-[11px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border-light)' }}
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}건/페이지</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1 || sessionsState?.loading}
                onClick={() => onChangePage(Math.max(0, offset - pageSize), pageSize)}
                className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <span className="text-[11px] px-1.5" style={{ color: 'var(--color-text-sub)' }}>
                {currentPage}/{totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages || sessionsState?.loading}
                onClick={() => onChangePage(offset + pageSize, pageSize)}
                className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>

          {/* 리스트 */}
          {!sessionsState || sessionsState.loading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
              />
            </div>
          ) : sessionsState.sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              통화 없음
            </div>
          ) : (
            <div>
              {sessionsState.sessions.map(s => (
                <AdminSessionRow
                  key={s.id}
                  session={s}
                  selected={selectedIds.has(s.id)}
                  onToggle={onToggleSelect}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
