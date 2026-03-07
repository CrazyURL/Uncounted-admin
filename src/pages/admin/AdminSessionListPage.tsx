import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { type QualityGrade, type DatasetFilterCriteria } from '../../types/dataset'
import { loadAllSessions, invalidateSessionCache } from '../../lib/sessionMapper'
import {
  applyAdminFilters,
  sortAdminSessions,
  calcDatasetSummary,
  calcLabelCoverage,
  groupSessionsByUserId,
  type AdminSortKey,
  type UserGroupSummary,
} from '../../lib/adminHelpers'
import { saveDataset } from '../../lib/datasetStore'
import { generateUUID } from '../../lib/uuid'
import AdminFilterBar from '../../components/domain/AdminFilterBar'
import AdminSessionRow from '../../components/domain/AdminSessionRow'
import DatasetCreateModal from '../../components/domain/DatasetCreateModal'
import { resetAll } from '../../lib/resetAll'

type SortDir = 'asc' | 'desc'
type ViewMode = 'flat' | 'byUser'

const SORT_OPTIONS: { key: AdminSortKey; label: string }[] = [
  { key: 'date', label: '날짜' },
  { key: 'qaScore', label: '품질' },
  { key: 'duration', label: '시간' },
]

const DEFAULT_FILTERS: DatasetFilterCriteria = {
  domains: [],
  qualityGrades: [],
  labelStatus: 'all',
  publicStatus: 'all',
  piiCleanedOnly: false,
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
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [filters, setFilters] = useState<DatasetFilterCriteria>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<AdminSortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  const [resetting, setResetting] = useState(false)
  const hasLoadedRef = useRef(false)
  const currentPathRef = useRef(location.pathname)

  useEffect(() => {
    // 경로가 바뀌면 hasLoadedRef 리셋
    if (currentPathRef.current !== location.pathname) {
      hasLoadedRef.current = false
      currentPathRef.current = location.pathname
    }

    // 이 컴포넌트가 렌더링되는 경로에서만 데이터 로드
    const isCallsOrSessionsRoute =
      location.pathname === '/admin/calls' ||
      location.pathname === '/admin/sessions'

    if (!isCallsOrSessionsRoute) return
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    invalidateSessionCache()
    loadAllSessions({ skipUserFilter: true }).then(sessions => {
      setAllSessions(sessions)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminSessionList] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [location.pathname])

  const filtered = useMemo(
    () => applyAdminFilters(allSessions, filters),
    [allSessions, filters],
  )

  const sorted = useMemo(
    () => sortAdminSessions(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  )

  const summary = useMemo(() => calcDatasetSummary(allSessions), [allSessions])
  const labelCoverage = useMemo(() => calcLabelCoverage(allSessions), [allSessions])

  const userGroups = useMemo(
    () => groupSessionsByUserId(filtered),
    [filtered],
  )

  const selectedSessions = useMemo(
    () => sorted.filter(s => selectedIds.has(s.id)),
    [sorted, selectedIds],
  )

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sorted.map(s => s.id)))
    }
  }

  function toggleDomain(d: string) {
    setFilters(f => ({
      ...f,
      domains: f.domains.includes(d)
        ? f.domains.filter(x => x !== d)
        : [...f.domains, d],
    }))
  }

  function toggleGrade(g: QualityGrade) {
    setFilters(f => ({
      ...f,
      qualityGrades: f.qualityGrades.includes(g)
        ? f.qualityGrades.filter(x => x !== g)
        : [...f.qualityGrades, g],
    }))
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

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <span className="material-symbols-outlined text-4xl mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          folder_open
        </span>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          세션이 없습니다
        </p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
          앱에서 세션을 업로드하면 이곳에 표시됩니다
        </p>
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* 요약 바 */}
      <div className="px-4 py-3 grid grid-cols-4 gap-2">
        {[
          { label: '총 세션', value: `${summary.sessionCount}건` },
          { label: '총 시간', value: `${summary.totalDurationHours.toFixed(1)}h` },
          { label: '평균 품질', value: `${summary.avgQaScore}점` },
          { label: '완전 라벨', value: `${labelCoverage.fullLabelCount}/${labelCoverage.totalSessions}` },
        ].map(item => (
          <div
            key={item.label}
            className="rounded-lg p-2.5 text-center"
            style={{ backgroundColor: '#1b1e2e' }}
          >
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</p>
            <p className="text-sm font-bold text-white mt-0.5">{item.value}</p>
          </div>
        ))}
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
              onChange={e => setSortKey(e.target.value as AdminSortKey)}
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
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
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
          onLabelStatus={s => setFilters(f => ({ ...f, labelStatus: s }))}
          publicStatus={filters.publicStatus}
          onPublicStatus={s => setFilters(f => ({ ...f, publicStatus: s }))}
          piiOnly={filters.piiCleanedOnly}
          onPiiOnly={v => setFilters(f => ({ ...f, piiCleanedOnly: v }))}
          selectedUploadStatuses={filters.uploadStatuses}
          onToggleUploadStatus={u => setFilters(f => ({
            ...f,
            uploadStatuses: f.uploadStatuses.includes(u)
              ? f.uploadStatuses.filter(x => x !== u)
              : [...f.uploadStatuses, u],
          }))}
          dateRange={filters.dateRange}
          onDateRange={dr => setFilters(f => ({ ...f, dateRange: dr }))}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />
      )}

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
                  borderColor: selectedIds.size === sorted.length && sorted.length > 0 ? '#1337ec' : 'rgba(255,255,255,0.2)',
                  backgroundColor: selectedIds.size === sorted.length && sorted.length > 0 ? '#1337ec' : 'transparent',
                }}
              >
                {selectedIds.size === sorted.length && sorted.length > 0 && (
                  <span className="material-symbols-outlined text-white text-xs">check</span>
                )}
              </div>
              전체 선택
            </button>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {sorted.length}건 표시
            </span>
          </div>

          {/* 세션 목록 */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {sorted.map(session => (
              <AdminSessionRow
                key={session.id}
                session={session}
                selected={selectedIds.has(session.id)}
                onToggle={toggleSelect}
              />
            ))}
          </motion.div>

          {sorted.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <span className="material-symbols-outlined text-3xl mb-2" style={{ color: 'rgba(255,255,255,0.15)' }}>
                search_off
              </span>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                필터 조건에 맞는 세션이 없습니다
              </p>
            </div>
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
              {userGroups.length}명의 사용자
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

      <div className="flex items-center gap-2 mt-2.5">
        {(['A', 'B', 'C'] as const).map(g => {
          const count = group.qualityDistribution[g] ?? 0
          if (count === 0) return null
          return (
            <span
              key={g}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${GRADE_COLORS[g]}20`, color: GRADE_COLORS[g] }}
            >
              {g} {count}
            </span>
          )
        })}
        {group.publicCount > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
          >
            <span className="material-symbols-outlined text-xs">visibility</span>
            {group.publicCount}
          </span>
        )}
      </div>
    </button>
  )
}
