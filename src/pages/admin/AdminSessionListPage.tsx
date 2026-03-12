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
} from '../../lib/api/admin'
import AdminFilterBar from '../../components/domain/AdminFilterBar'
import AdminSessionRow from '../../components/domain/AdminSessionRow'
import DatasetCreateModal from '../../components/domain/DatasetCreateModal'
import { resetAll } from '../../lib/resetAll'

type SortDir = 'asc' | 'desc'
type ViewMode = 'flat' | 'byUser'

const PAGE_SIZE = 100

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

  // flat 탭 state
  const [sessions, setSessions] = useState<Session[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [page, setPage] = useState(1)

  // byUser 탭 state
  const [userGroups, setUserGroups] = useState<UserGroupSummary[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [userPage, setUserPage] = useState(1)
  const [userSortKey, setUserSortKey] = useState<'sessionCount' | 'totalDuration' | 'avgQaScore'>('sessionCount')

  const currentPathRef = useRef(location.pathname)

  // 경로 변경 감지
  useEffect(() => {
    currentPathRef.current = location.pathname
  }, [location.pathname])

  // flat 탭 데이터 로딩
  useEffect(() => {
    const isTargetRoute =
      location.pathname === '/admin/calls' ||
      location.pathname === '/admin/sessions'
    if (!isTargetRoute || viewMode !== 'flat') return

    setLoading(true)
    fetchAdminSessionsApi({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      ...filtersToQuery(filters),
      sortBy: sortKey,
      sortDir,
    }).then(({ data, count }) => {
      setSessions(data ?? [])
      setTotalSessions(count ?? 0)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminSessionList] fetchAdminSessionsApi failed:', err)
      setLoading(false)
    })
  }, [location.pathname, filters, sortKey, sortDir, page, viewMode])

  // byUser 탭 데이터 로딩
  useEffect(() => {
    const isTargetRoute =
      location.pathname === '/admin/calls' ||
      location.pathname === '/admin/sessions'
    if (!isTargetRoute || viewMode !== 'byUser') return

    setLoading(true)
    fetchAdminUserStatsApi({
      limit: PAGE_SIZE,
      offset: (userPage - 1) * PAGE_SIZE,
      ...filtersToQuery(filters),
      sortBy: userSortKey,
      sortDir,
    }).then(({ data, count }) => {
      setUserGroups(data ?? [])
      setTotalUsers(count ?? 0)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminSessionList] fetchAdminUserStatsApi failed:', err)
      setLoading(false)
    })
  }, [location.pathname, filters, sortDir, userPage, userSortKey, viewMode])

  const totalPages = Math.max(1, Math.ceil(totalSessions / PAGE_SIZE))
  const totalUserPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE))

  const selectedSessions = useMemo(
    () => sessions.filter(s => selectedIds.has(s.id)),
    [sessions, selectedIds],
  )

  function updateFilters(next: DatasetFilterCriteria) {
    setPage(1)
    setUserPage(1)
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
        // 현재 페이지 재로딩
        setPage(p => p)
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
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* 총 건수 요약 */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className="rounded-lg p-2.5 text-center flex-1"
          style={{ backgroundColor: '#1b1e2e' }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>전체 세션</p>
          <p className="text-sm font-bold text-white mt-0.5">{totalSessions.toLocaleString()}건</p>
        </div>
        <div
          className="rounded-lg p-2.5 text-center flex-1"
          style={{ backgroundColor: '#1b1e2e' }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>전체 사용자</p>
          <p className="text-sm font-bold text-white mt-0.5">{totalUsers.toLocaleString()}명</p>
        </div>
      </div>

      {/* 뷰 토글 */}
      <div className="flex items-center gap-1 px-4 py-2">
        {(['flat', 'byUser'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: viewMode === mode ? '#1337ec' : 'rgba(255,255,255,0.06)',
              color: viewMode === mode ? '#fff' : 'rgba(255,255,255,0.5)',
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
          style={{ color: showFilters ? '#1337ec' : 'rgba(255,255,255,0.5)' }}
        >
          <span className="material-symbols-outlined text-base">filter_list</span>
          필터
        </button>

        {viewMode === 'flat' && (
          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={e => { setSortKey(e.target.value as AdminSortKey); setPage(1) }}
              className="text-xs py-1 px-2 rounded-lg border outline-none bg-transparent text-white"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key} style={{ backgroundColor: '#1b1e2e' }}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1) }}
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}
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
              onChange={e => { setUserSortKey(e.target.value as typeof userSortKey); setUserPage(1) }}
              className="text-xs py-1 px-2 rounded-lg border outline-none bg-transparent text-white"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {USER_SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key} style={{ backgroundColor: '#1b1e2e' }}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setUserPage(1) }}
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <span className="material-symbols-outlined text-base">
                {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
              </span>
            </button>
          </div>
        )}
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
                backgroundColor: active ? `${GRADE_COLORS[g]}20` : 'rgba(255,255,255,0.06)',
                color: active ? GRADE_COLORS[g] : 'rgba(255,255,255,0.4)',
              }}
            >
              {g}
            </button>
          )
        })}
        <span className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <button
          onClick={() => updateFilters({ ...filters, hasAudioUrl: !filters.hasAudioUrl })}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          style={{
            backgroundColor: filters.hasAudioUrl ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.06)',
            color: filters.hasAudioUrl ? '#60a5fa' : 'rgba(255,255,255,0.4)',
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
            backgroundColor: filters.diarizationStatus === 'done' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.06)',
            color: filters.diarizationStatus === 'done' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
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
            backgroundColor: filters.transcriptStatus === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
            color: filters.transcriptStatus === 'done' ? '#22c55e' : 'rgba(255,255,255,0.4)',
          }}
        >
          자막있음
        </button>
        <button
          onClick={handleSyncAudioUrls}
          disabled={syncing}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.4)',
          }}
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
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center border"
                style={{
                  borderColor: selectedIds.size === sessions.length && sessions.length > 0 ? '#1337ec' : 'rgba(255,255,255,0.2)',
                  backgroundColor: selectedIds.size === sessions.length && sessions.length > 0 ? '#1337ec' : 'transparent',
                }}
              >
                {selectedIds.size === sessions.length && sessions.length > 0 && (
                  <span className="material-symbols-outlined text-white text-xs">check</span>
                )}
              </div>
              전체 선택
            </button>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {sessions.length}건 표시
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
              <span className="material-symbols-outlined text-3xl mb-2" style={{ color: 'rgba(255,255,255,0.15)' }}>
                search_off
              </span>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                필터 조건에 맞는 세션이 없습니다
              </p>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} total={totalSessions} onPage={setPage} />
          )}
        </>
      )}

      {/* ── 사용자별 뷰 ── */}
      {viewMode === 'byUser' && (
        <>
          <div
            className="px-4 py-2 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {totalUsers.toLocaleString()}명의 사용자
            </span>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-3 space-y-2">
            {userGroups.map(group => (
              <UserGroupCard
                key={group.userId ?? '__null__'}
                group={group}
                onClick={() => navigate(`/admin/users/${encodeURIComponent(group.userId ?? '__null__')}`)}
              />
            ))}
          </motion.div>

          {userGroups.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <span className="material-symbols-outlined text-3xl mb-2" style={{ color: 'rgba(255,255,255,0.15)' }}>
                search_off
              </span>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                필터 조건에 맞는 사용자가 없습니다
              </p>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalUserPages > 1 && (
            <Pagination page={userPage} totalPages={totalUserPages} total={totalUsers} onPage={setUserPage} />
          )}
        </>
      )}

      {/* 플로팅 액션 바 */}
      {selectedIds.size > 0 && viewMode === 'flat' && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between border-t"
          style={{
            backgroundColor: '#1b1e2e',
            borderColor: 'rgba(255,255,255,0.08)',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <span className="text-sm text-white font-medium">
            {selectedIds.size}건 선택됨
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5"
            style={{ backgroundColor: '#1337ec' }}
          >
            <span className="material-symbols-outlined text-base">add_box</span>
            데이터셋 생성
          </button>
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

// ── 페이지네이션 컨트롤 ──────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="p-1.5 rounded-lg disabled:opacity-30"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
      </button>
      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {page} / {totalPages}페이지
        <span className="ml-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          (총 {total.toLocaleString()}건)
        </span>
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="p-1.5 rounded-lg disabled:opacity-30"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
      >
        <span className="material-symbols-outlined text-base">chevron_right</span>
      </button>
    </div>
  )
}

// ── 사용자 그룹 카드 ──────────────────────────────────────────────────────────

function UserGroupCard({ group, onClick }: { group: UserGroupSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl p-3.5 text-left transition-colors"
      style={{ backgroundColor: '#1b1e2e' }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="material-symbols-outlined text-lg"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            person
          </span>
          <p className="text-sm font-medium text-white truncate">
            {group.displayId}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-base"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          chevron_right
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '세션', value: `${group.sessionCount}건` },
          { label: '시간', value: `${group.totalDurationHours.toFixed(1)}h` },
          { label: '품질', value: `${group.avgQaScore}점` },
          { label: '라벨률', value: `${Math.round(group.labeledRatio * 100)}%` },
        ].map(item => (
          <div key={item.label} className="text-center">
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.label}</p>
            <p className="text-xs font-bold text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </button>
  )
}
