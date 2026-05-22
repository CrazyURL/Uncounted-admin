import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BigStat, Button, ConfirmDialog, EmptyState, ErrorBanner, StatusBadge, useToast } from '../../components/ui'
import { FilterChips } from '../../components/domain/FilterChips'
import { SessionPipelineCells } from '../../components/domain/SessionPipelineCells'
import { SessionDeliveryModal } from '../../components/domain/SessionDeliveryModal'
import { fetchDashboardStats, type DashboardStats } from '../../lib/api/dashboard'
import {
  fetchReviewQueue,
  updateReviewStatus,
} from '../../lib/api/reviews'
import {
  type AdminSession,
  isPipelineComplete,
  getPipelineState,
  getActiveStageLabel,
  type PipelineState,
  type SaleStatus,
  getSaleStatus,
} from '../../types/adminSession'
import { labels } from '../../lib/labels'
import {
  fetchUtterances,
  fetchUtteranceStats,
  updateUtteranceReviewStatus,
  type AdminUtterance,
  type UtteranceStatsResponse,
} from '../../lib/api/utterances'
import { UtteranceExpansion } from '../../components/domain/UtteranceExpansion'
import { type FilterId, buildFilters, buildChips, SESSIONS_PER_PAGE } from '../../lib/adminFilters'
import { summarizeBulkResults } from '../../lib/bulkActionResult'
import { getOwnerDisplay } from '../../lib/ownerDisplay'
import { exportMinSaleableDataset } from '../../lib/adminHelpers'
import { exportSingleSession, exportBatch } from '../../lib/api/delivery'
import { FullPackageExportModal } from '../../components/domain/FullPackageExportModal'
import { MinSaleableDownloadPanel } from '../../components/domain/MinSaleableDownloadPanel'
import ExportLogPanel from '../../components/domain/ExportLogPanel'
import { DeliveryPackageModal } from '../../components/domain/DeliveryPackageModal'
import { saveExportLog, createExportLog } from '../../lib/exportLog'
import { useAuth } from '../../lib/AuthContext'
import type { ExportLog } from '../../types/admin'

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}시간 ${m}분`
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

function CopyIdButton({ id }: { id: string }) {
  const toast = useToast()
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success('세션 ID 복사됨')
    } catch {
      toast.error('복사 실패 — 브라우저 클립보드 권한을 확인하세요')
    }
  }, [id, toast])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 text-txt-tertiary hover:text-accent transition-colors focus:outline-none"
      title={`세션 ID 복사: ${id}`}
      aria-label="세션 ID 복사"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    </button>
  )
}

function deriveGrade(score: number | null | undefined): 'A' | 'B' | 'C' | null {
  if (score == null) return null
  return score >= 80 ? 'A' : score >= 50 ? 'B' : 'C'
}

function QualityBadge({
  grade,
  score,
  qualityStatus,
}: {
  grade?: 'A' | 'B' | 'C' | null
  score?: number | null
  qualityStatus?: string | null
}) {
  const g = grade ?? deriveGrade(score)
  if (!g) {
    if (qualityStatus === 'done') {
      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
          title="품질 분석 완료됐으나 점수가 기록되지 않았습니다"
        >
          미집계
        </span>
      )
    }
    return <span className="text-xs text-txt-tertiary">-</span>
  }
  const cls =
    g === 'A'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      : g === 'B'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {g}{score != null ? `·${Math.round(score)}` : ''}
    </span>
  )
}

// ── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { userId } = useAuth()

  const filterId = (searchParams.get('filter') as FilterId) ?? 'all'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const searchQuery = searchParams.get('q') ?? ''

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [uttStats, setUttStats] = useState<UtteranceStatsResponse | null>(null)
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())
  const [deliveryTarget, setDeliveryTarget] = useState<{ id: string; title: string | null } | null>(null)
  const [fullPkgSessionId, setFullPkgSessionId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkStartingReview, setBulkStartingReview] = useState(false)
  const [bulkRejecting, setBulkRejecting] = useState(false)

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [utterancesMap, setUtterancesMap] = useState<Map<string, AdminUtterance[]>>(new Map())
  const [utteranceSelectedMap, setUtteranceSelectedMap] = useState<Map<string, Set<string>>>(new Map())
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [sortBy, setSortBy] = useState<'date' | 'duration' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [inputValue, setInputValue] = useState(searchQuery)
  const [downloading, setDownloading] = useState(false)
  const [deliveryPackageLog, setDeliveryPackageLog] = useState<ExportLog | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (inputValue) next.set('q', inputValue)
        else next.delete('q')
        next.set('page', '1')
        return next
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [inputValue])

  function handleSortClick(col: 'date' | 'duration') {
    if (sortBy === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const [res, uttRes] = await Promise.all([fetchDashboardStats(), fetchUtteranceStats()])
    if (res.data) setStats(res.data)
    if (uttRes.data) setUttStats(uttRes.data)
    setStatsLoading(false)
  }, [])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    const filters = buildFilters(filterId, page, searchQuery || undefined)
    if (sortBy) { filters.sortBy = sortBy; filters.sortDir = sortDir }
    const res = await fetchReviewQueue(filters)
    if (res.data) {
      setSessions(res.data.sessions)
      setTotal(res.data.total)
    } else {
      setError(res.error ?? labels.error.fetchFailed)
    }
    setLoading(false)
  }, [filterId, page, sortBy, sortDir, searchQuery])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    setSelectedIds(new Set())
    loadSessions()
  }, [loadSessions])

  function setFilter(id: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('filter', id)
      next.set('page', '1')
      return next
    })
  }

  function setPage(n: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('filter', filterId)
      next.set('page', String(n))
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === sessions.length && sessions.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)))
    }
  }

  function addActionLoading(id: string) {
    setActionLoading((prev) => new Set(prev).add(id))
  }

  function removeActionLoading(id: string) {
    setActionLoading((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function handleStartReview(sessionId: string) {
    addActionLoading(sessionId)
    const res = await updateReviewStatus(sessionId, 'in_review')
    if (res.data) {
      toast.success(labels.toast.startedReview)
      loadSessions()
      loadStats()
      handleExpandRow(sessionId)
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    removeActionLoading(sessionId)
  }

  async function handleApprove(sessionId: string, note?: string) {
    addActionLoading(sessionId)
    const res = await updateReviewStatus(sessionId, 'approved', note)
    if (res.data) {
      toast.success(labels.toast.approved)
      loadSessions()
      loadStats()
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    removeActionLoading(sessionId)
  }

  async function handleNeedsRevision(sessionId: string, note?: string) {
    addActionLoading(sessionId)
    const res = await updateReviewStatus(sessionId, 'needs_revision', note)
    if (res.data) {
      toast.success(labels.toast.needsRevision)
      loadSessions()
      loadStats()
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    removeActionLoading(sessionId)
  }

  async function handleReject(sessionId: string, note?: string) {
    setRejectTarget(null)
    addActionLoading(sessionId)
    const res = await updateReviewStatus(sessionId, 'rejected', note)
    if (res.data) {
      toast.success(labels.toast.rejected)
      loadSessions()
      loadStats()
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    removeActionLoading(sessionId)
  }

  async function handleBulkStartReview() {
    if (selectedIds.size === 0) return
    const eligible = sessions.filter((s) => {
      if (!selectedIds.has(s.id)) return false
      if (s.review_status === 'needs_revision') return true
      return s.review_status === 'pending' && isPipelineComplete(s)
    })
    const skipped = selectedIds.size - eligible.length
    if (eligible.length === 0) {
      toast.error(`선택한 ${selectedIds.size}건 중 검수 시작 가능한 항목이 없습니다${skipped > 0 ? ` (${skipped}건 건너뜀)` : ''}`)
      return
    }
    setBulkStartingReview(true)
    const results = await Promise.allSettled(
      eligible.map((s) => updateReviewStatus(s.id, 'in_review'))
    )
    const { succeeded, failed, firstError } = summarizeBulkResults(results)
    const skipNote = skipped > 0 ? ` (${skipped}건 건너뜀)` : ''
    if (succeeded === 0) {
      toast.error(`검수 시작 실패 — ${failed}건 실패${firstError ? `: ${firstError}` : ''}${skipNote}`)
    } else {
      toast.success(`검수 시작 ${succeeded}건 성공${failed > 0 ? `, ${failed}건 실패` : ''}${skipNote}`)
    }
    setSelectedIds(new Set())
    loadSessions()
    loadStats()
    setBulkStartingReview(false)
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return
    const eligible = sessions.filter(
      (s) => selectedIds.has(s.id) && s.review_status === 'in_review'
    )
    const skipped = selectedIds.size - eligible.length
    if (eligible.length === 0) {
      toast.error(`선택한 ${selectedIds.size}건 중 승인 가능한 항목이 없습니다${skipped > 0 ? ` (${skipped}건 건너뜀)` : ''}`)
      return
    }
    setBulkApproving(true)
    const results = await Promise.allSettled(
      eligible.map((s) => updateReviewStatus(s.id, 'approved'))
    )
    const { succeeded, failed, firstError } = summarizeBulkResults(results)
    const skipNote = skipped > 0 ? ` (${skipped}건 건너뜀)` : ''
    if (succeeded === 0) {
      toast.error(`승인 실패 — ${failed}건 실패${firstError ? `: ${firstError}` : ''}${skipNote}`)
    } else {
      toast.success(`승인 ${succeeded}건 성공${failed > 0 ? `, ${failed}건 실패` : ''}${skipNote}`)
    }
    setSelectedIds(new Set())
    loadSessions()
    loadStats()
    setBulkApproving(false)
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return
    const eligible = sessions.filter(
      (s) => selectedIds.has(s.id) && s.review_status === 'in_review'
    )
    const skipped = selectedIds.size - eligible.length
    if (eligible.length === 0) {
      toast.error(`선택한 ${selectedIds.size}건 중 거절 가능한 항목이 없습니다${skipped > 0 ? ` (${skipped}건 건너뜀)` : ''}`)
      return
    }
    setBulkRejecting(true)
    const results = await Promise.allSettled(
      eligible.map((s) => updateReviewStatus(s.id, 'rejected'))
    )
    const { succeeded, failed, firstError } = summarizeBulkResults(results)
    const skipNote = skipped > 0 ? ` (${skipped}건 건너뜀)` : ''
    if (succeeded === 0) {
      toast.error(`거절 실패 — ${failed}건 실패${firstError ? `: ${firstError}` : ''}${skipNote}`)
    } else {
      toast.success(`거절 ${succeeded}건 성공${failed > 0 ? `, ${failed}건 실패` : ''}${skipNote}`)
    }
    setSelectedIds(new Set())
    loadSessions()
    loadStats()
    setBulkRejecting(false)
  }

  async function handleExpandRow(sessionId: string) {
    if (expandedRows.has(sessionId)) {
      setExpandedRows((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
      return
    }
    setExpandedRows((prev) => new Set(prev).add(sessionId))
    if (!utterancesMap.has(sessionId)) {
      const res = await fetchUtterances({ sessionId, limit: 200 })
      if (res.data) {
        setUtterancesMap((prev) => new Map(prev).set(sessionId, res.data!.utterances))
      }
    }
  }

  function handleToggleUtterance(sessionId: string, utteranceId: string) {
    setUtteranceSelectedMap((prev) => {
      const set = new Set(prev.get(sessionId) ?? [])
      if (set.has(utteranceId)) set.delete(utteranceId)
      else set.add(utteranceId)
      return new Map(prev).set(sessionId, set)
    })
  }

  function handleSelectAllUtterances(sessionId: string) {
    const utts = utterancesMap.get(sessionId) ?? []
    const includable = utts.filter((u) => u.review_status !== 'excluded')
    const selected = utteranceSelectedMap.get(sessionId) ?? new Set<string>()
    const allSelected = includable.length > 0 && selected.size === includable.length
    setUtteranceSelectedMap((prev) => {
      const next = new Map(prev)
      next.set(sessionId, allSelected ? new Set() : new Set(includable.map((u) => u.id)))
      return next
    })
  }

  async function handleToggleReview(sessionId: string, u: AdminUtterance) {
    setUpdatingId(u.id)
    const isIncluded = u.review_status === 'excluded'
    const newStatus: AdminUtterance['review_status'] = isIncluded ? 'pending' : 'excluded'
    const res = await updateUtteranceReviewStatus(u.id, isIncluded)
    if (res.data) {
      setUtterancesMap((prev) => {
        const updated = (prev.get(sessionId) ?? []).map((existing) =>
          existing.id === u.id ? { ...existing, review_status: newStatus } : existing
        )
        return new Map(prev).set(sessionId, updated)
      })
    } else {
      toast.error(res.error ?? labels.error.saveFailed)
    }
    setUpdatingId(null)
  }

  function handleLabelSaved(sessionId: string, utteranceId: string, updatedFields: Partial<AdminUtterance>) {
    setUtterancesMap((prev) => {
      const updated = (prev.get(sessionId) ?? []).map((u) =>
        u.id === utteranceId ? { ...u, ...updatedFields } : u
      )
      return new Map(prev).set(sessionId, updated)
    })
  }

  const saleStatusMap = useMemo<Map<string, SaleStatus>>(() => {
    const map = new Map<string, SaleStatus>()
    for (const s of sessions) {
      const utts = utterancesMap.has(s.id) ? utterancesMap.get(s.id) : undefined
      const uttCount = utts?.length
      const includedCount = utts?.filter((u) => u.review_status !== 'excluded').length
      map.set(s.id, getSaleStatus(s, uttCount, includedCount))
    }
    return map
  }, [sessions, utterancesMap])

  const panelStats = useMemo(() => {
    let sellable = 0, restricted = 0, locked = 0
    let utteranceCount = 0, totalSecs = 0, estimatedRevenue = 0
    for (const s of sessions) {
      const st = saleStatusMap.get(s.id) ?? 'locked'
      if (st === 'sellable') { sellable++; totalSecs += s.duration_seconds }
      else if (st === 'restricted') { restricted++; totalSecs += s.duration_seconds }
      else locked++
      const utts = utterancesMap.get(s.id) ?? []
      const includable = utts.filter((u) => u.review_status !== 'excluded')
      utteranceCount += includable.length
      if (st !== 'locked') {
        estimatedRevenue += includable.reduce((sum, u) => sum + (u.unit_price_krw ?? 0), 0)
      }
    }
    return { sellable, restricted, locked, utteranceCount, totalSecs, estimatedRevenue }
  }, [sessions, saleStatusMap, utterancesMap])

  const chips = buildChips(stats)
  const totalPages = Math.ceil(total / SESSIONS_PER_PAGE)
  const r = stats?.review
  const failedCount = stats?.alerts.pipelineFailedCount ?? 0
  const bulkBusy = bulkApproving || bulkStartingReview || bulkRejecting

  async function handleDownloadSelected(options: { includeRestricted: boolean }) {
    const targetSessions = sessions.filter(
      (s) => selectedIds.has(s.id) && (saleStatusMap.get(s.id) ?? 'locked') !== 'locked'
    )
    if (targetSessions.length === 0) {
      toast.error('선택된 세션 중 다운로드 가능한 항목이 없습니다')
      return
    }
    setDownloading(true)
    try {
      const localMap = new Map(utterancesMap)
      await Promise.all(
        targetSessions
          .filter((s) => !localMap.has(s.id))
          .map(async (s) => {
            const res = await fetchUtterances({ sessionId: s.id, limit: 200 })
            if (res.data) localMap.set(s.id, res.data.utterances)
          })
      )
      setUtterancesMap(localMap)
      const utterancesBySessionId: Record<string, AdminUtterance[]> = {}
      for (const s of targetSessions) {
        utterancesBySessionId[s.id] = localMap.get(s.id) ?? []
      }
      const exportedUtteranceCount = targetSessions.reduce((sum, s) => {
        const status = saleStatusMap.get(s.id) ?? 'locked'
        if (status === 'restricted' && !options.includeRestricted) return sum
        return sum + (utterancesBySessionId[s.id] ?? []).filter((u) => u.review_status !== 'excluded').length
      }, 0)
      let resultStatus: 'success' | 'failed' = 'failed'
      let errorMessage: string | undefined
      let callCount = 0
      try {
        const result = await exportMinSaleableDataset({
          sessions: targetSessions,
          utterancesBySessionId,
          exportType: 'selected',
          includeRestricted: options.includeRestricted,
          exportedBy: userId,
        })
        callCount = result.count
        if (result.count === 0) {
          toast.error('내보낼 데이터가 없습니다')
        } else if (result.error) {
          errorMessage = result.error
          toast.error(`내보내기 실패: ${result.error}`)
        } else {
          resultStatus = 'success'
          toast.success(`${result.count}건 다운로드 완료`)
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : '알 수 없는 오류'
        toast.error(`내보내기 실패: ${errorMessage}`)
      }
      saveExportLog(createExportLog({
        export_type: 'selected',
        session_ids: targetSessions.map((s) => s.id),
        call_count: callCount,
        utterance_count: exportedUtteranceCount,
        included_sale_status: options.includeRestricted ? ['sellable', 'restricted'] : ['sellable'],
        excluded_sale_status: ['locked'],
        include_restricted: options.includeRestricted,
        exported_by: userId,
        file_name: null, // TODO: exportMinSaleableDataset가 파일명 반환 시 연동
        filters_snapshot: null,
        result_status: resultStatus,
        error_message: errorMessage,
      }))
    } finally {
      setDownloading(false)
    }
  }

  async function handleDownloadAll(options: { includeRestricted: boolean }) {
    const targetSessions = sessions.filter(
      (s) => (saleStatusMap.get(s.id) ?? 'locked') !== 'locked'
    )
    if (targetSessions.length === 0) {
      toast.error('다운로드 가능한 세션이 없습니다')
      return
    }
    setDownloading(true)
    try {
      const localMap = new Map(utterancesMap)
      await Promise.all(
        targetSessions
          .filter((s) => !localMap.has(s.id))
          .map(async (s) => {
            const res = await fetchUtterances({ sessionId: s.id, limit: 200 })
            if (res.data) localMap.set(s.id, res.data.utterances)
          })
      )
      setUtterancesMap(localMap)
      const utterancesBySessionId: Record<string, AdminUtterance[]> = {}
      for (const s of targetSessions) {
        utterancesBySessionId[s.id] = localMap.get(s.id) ?? []
      }
      const exportedUtteranceCount = targetSessions.reduce((sum, s) => {
        const status = saleStatusMap.get(s.id) ?? 'locked'
        if (status === 'restricted' && !options.includeRestricted) return sum
        return sum + (utterancesBySessionId[s.id] ?? []).filter((u) => u.review_status !== 'excluded').length
      }, 0)
      let resultStatus: 'success' | 'failed' = 'failed'
      let errorMessage: string | undefined
      let callCount = 0
      try {
        const result = await exportMinSaleableDataset({
          sessions: targetSessions,
          utterancesBySessionId,
          exportType: 'all_filtered',
          includeRestricted: options.includeRestricted,
          exportedBy: userId,
        })
        callCount = result.count
        if (result.count === 0) {
          toast.error('내보낼 데이터가 없습니다')
        } else if (result.error) {
          errorMessage = result.error
          toast.error(`내보내기 실패: ${result.error}`)
        } else {
          resultStatus = 'success'
          toast.success(`${result.count}건 다운로드 완료`)
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : '알 수 없는 오류'
        toast.error(`내보내기 실패: ${errorMessage}`)
      }
      saveExportLog(createExportLog({
        export_type: 'all_filtered',
        session_ids: targetSessions.map((s) => s.id),
        call_count: callCount,
        utterance_count: exportedUtteranceCount,
        included_sale_status: options.includeRestricted ? ['sellable', 'restricted'] : ['sellable'],
        excluded_sale_status: ['locked'],
        include_restricted: options.includeRestricted,
        exported_by: userId,
        file_name: null, // TODO: exportMinSaleableDataset가 파일명 반환 시 연동
        filters_snapshot: null,
        result_status: resultStatus,
        error_message: errorMessage,
      }))
    } finally {
      setDownloading(false)
    }
  }

  async function handleZipSingle(sessionId: string) {
    addActionLoading(sessionId)
    const res = await exportSingleSession(sessionId)
    removeActionLoading(sessionId)
    if (res.error) {
      toast.error(`ZIP 내보내기 실패: ${res.error}`)
      return
    }
    if (res.jobId) {
      toast.success('ZIP 내보내기가 시작되었습니다')
    }
  }

  // ── v2 단건 풀 패키지 export ──────────────────────────────────────────
  // row "풀 패키지" 버튼 → FullPackageExportModal 오픈 (reference_only 동기 / embedded 비동기 job).
  function openFullPackage(sessionId: string) {
    setFullPkgSessionId(sessionId)
  }

  async function handleBulkZip() {
    const approved = sessions.filter(
      (s) => selectedIds.has(s.id) && s.review_status === 'approved'
    )
    if (approved.length === 0) {
      toast.error('선택 항목 중 승인된 세션이 없습니다')
      return
    }
    const sessionIds = approved.flatMap((s) => [s.id])
    setDownloading(true)
    const res = await exportBatch(sessionIds)
    setDownloading(false)
    if (res.error) {
      toast.error(`ZIP 묶음 내보내기 실패: ${res.error}`)
      return
    }
    toast.success(`ZIP 묶음 내보내기 시작 — ${approved.length}건`)
    setSelectedIds(new Set())
  }

  async function handleDownloadSingle(sessionId: string) {
    const status = saleStatusMap.get(sessionId) ?? 'locked'
    if (status === 'locked') {
      toast.error('잠금 상태입니다. 다운로드 불가')
      return
    }
    setDownloading(true)
    try {
      const localMap = new Map(utterancesMap)
      if (!localMap.has(sessionId)) {
        const res = await fetchUtterances({ sessionId, limit: 200 })
        if (res.data) {
          localMap.set(sessionId, res.data.utterances)
          setUtterancesMap(localMap)
        }
      }
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return
      const utterancesForSession = localMap.get(sessionId) ?? []
      const exportedUtteranceCount = utterancesForSession.filter((u) => u.review_status !== 'excluded').length
      let resultStatus: 'success' | 'failed' = 'failed'
      let errorMessage: string | undefined
      let callCount = 0
      try {
        const result = await exportMinSaleableDataset({
          sessions: [session],
          utterancesBySessionId: { [sessionId]: utterancesForSession },
          exportType: 'single',
          includeRestricted: true,
          exportedBy: userId,
        })
        callCount = result.count
        if (result.count === 0) {
          toast.error('내보낼 발화가 없습니다')
        } else if (result.error) {
          errorMessage = result.error
          toast.error(`내보내기 실패: ${result.error}`)
        } else {
          resultStatus = 'success'
          toast.success(`1건 다운로드 완료`)
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : '알 수 없는 오류'
        toast.error(`내보내기 실패: ${errorMessage}`)
      }
      saveExportLog(createExportLog({
        export_type: 'single',
        session_ids: [sessionId],
        call_count: callCount,
        utterance_count: exportedUtteranceCount,
        included_sale_status: ['sellable', 'restricted'],
        excluded_sale_status: ['locked'],
        include_restricted: true,
        exported_by: userId,
        file_name: null, // TODO: exportMinSaleableDataset가 파일명 반환 시 연동
        filters_snapshot: null,
        result_status: resultStatus,
        error_message: errorMessage,
      }))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold text-txt">재고 · 통화</h1>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <BigStat
          title="사용자 수"
          value={statsLoading ? '…' : (stats?.consent.userCount ?? 0).toLocaleString()}
        />
        <BigStat
          title="전체 통화"
          value={statsLoading ? '…' : (stats?.consent.bothAgreedCount ?? 0).toLocaleString()}
          sub={stats ? formatDuration(stats.consent.totalDurationSec) : undefined}
        />
        <BigStat
          title="검수 대기"
          value={statsLoading ? '…' : (r?.pending ?? 0).toLocaleString()}
          onClick={() => setFilter('pending')}
        />
        <BigStat
          title="검수승인"
          value={statsLoading ? '…' : (r?.approved ?? 0).toLocaleString()}
          sub={(r?.approved ?? 0) > 0 ? '납품 대기 중' : undefined}
          onClick={() => setFilter('approved')}
        />
        <BigStat
          title="납품 완료"
          value={statsLoading ? '…' : (stats?.delivery.total ?? 0).toLocaleString()}
          sub={stats?.delivery.recentRevenue ? `최근 ₩${stats.delivery.recentRevenue.toLocaleString()}` : undefined}
        />
        <BigStat
          title="처리 오류"
          value={statsLoading ? '…' : failedCount.toLocaleString()}
          sub={failedCount > 0 ? '즉시 확인 필요' : undefined}
          tone={failedCount > 0 ? 'danger' : undefined}
          onClick={failedCount > 0 ? () => setFilter('failed') : undefined}
        />
      </div>

      {/* 발화 KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <BigStat
          title="총 발화건수"
          value={statsLoading ? '…' : (uttStats?.total ?? 0).toLocaleString()}
          sub={uttStats ? formatDuration(uttStats.totalDurationSec) : undefined}
        />
        <BigStat
          title="납품 완료발화"
          value={statsLoading ? '…' : (uttStats?.deliveredCount ?? 0).toLocaleString()}
        />
        <BigStat
          title="납품전 발화건수"
          value={statsLoading ? '…' : ((uttStats?.total ?? 0) - (uttStats?.deliveredCount ?? 0)).toLocaleString()}
        />
        <BigStat
          title="예상 매출"
          value={statsLoading ? '…' : uttStats ? `₩${uttStats.estimatedRevenueKrw.toLocaleString()}` : '-'}
        />
      </div>

      {/* 세션 검색 */}
      <input
        type="search"
        placeholder="통화 번호 · 세션 ID · 가입자 ID 검색"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-line rounded-lg bg-bg text-txt placeholder:text-txt-sub focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {/* 필터 칩 */}
      <FilterChips chips={chips} active={filterId} onChange={setFilter} />

      {/* 판매 데이터셋 Export 패널 */}
      <MinSaleableDownloadPanel
        sellableCount={panelStats.sellable}
        restrictedCount={panelStats.restricted}
        lockedCount={panelStats.locked}
        includedUtteranceCount={panelStats.utteranceCount}
        totalDurationLabel={formatDuration(panelStats.totalSecs)}
        estimatedRevenueLabel={panelStats.estimatedRevenue > 0 ? `₩${panelStats.estimatedRevenue.toLocaleString()}` : '-'}
        selectedCount={selectedIds.size}
        isDownloading={downloading}
        onDownloadSelected={handleDownloadSelected}
        onDownloadAllSellable={handleDownloadAll}
      />

      {/* 다운로드 로그 */}
      <ExportLogPanel onRegisterDelivery={setDeliveryPackageLog} />

      {/* 일괄 처리 바 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-accent/10 border border-accent/30 rounded-lg">
          <span className="text-sm text-txt font-medium">{selectedIds.size}건 선택됨</span>
          <Button variant="secondary" size="sm" onClick={handleBulkStartReview} disabled={bulkBusy}>
            {bulkStartingReview ? '처리 중…' : '일괄 검수시작'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleBulkApprove} disabled={bulkBusy}>
            {bulkApproving ? '처리 중…' : '일괄 승인'}
          </Button>
          <Button variant="danger" size="sm" onClick={handleBulkReject} disabled={bulkBusy}>
            {bulkRejecting ? '처리 중…' : '일괄 거절'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleBulkZip} disabled={bulkBusy || downloading}>
            {downloading ? '처리 중…' : 'ZIP 묶음 내보내기'}
          </Button>
          <button
            className="ml-auto text-sm text-txt-sub hover:text-txt focus:outline-none"
            onClick={() => setSelectedIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 세션 테이블 */}
      {error ? (
        <ErrorBanner message={error} onRetry={loadSessions} />
      ) : loading ? (
        <SessionTableSkeleton />
      ) : sessions.length === 0 ? (
        <EmptyState
          title={labels.empty.sessions}
          description={labels.empty.sessionsHint}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm table-fixed min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-txt-sub text-left">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sessions.length && sessions.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-accent"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="px-2 py-3 w-6" />
                <th
                  className="px-4 py-3 font-medium cursor-pointer select-none hover:text-txt"
                  onClick={() => handleSortClick('date')}
                >
                  통화명{sortBy === 'date' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                </th>
                <th
                  className="px-4 py-3 font-medium w-24 cursor-pointer select-none hover:text-txt"
                  onClick={() => handleSortClick('duration')}
                >
                  길이{sortBy === 'duration' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                </th>
                <th className="px-4 py-3 font-medium w-44">처리 흐름</th>
                <th className="px-4 py-3 font-medium w-20">품질</th>
                <th className="px-4 py-3 font-medium w-40">상태</th>
                <th className="px-4 py-3 font-medium w-20">판매상태</th>
                <th className="px-4 py-3 font-medium w-20">Owner 추정</th>
                <th className="px-4 py-3 font-medium w-16 text-center">내보내기</th>
                <th className="px-4 py-3 font-medium w-64 text-right">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  selected={selectedIds.has(session.id)}
                  actionLoading={actionLoading.has(session.id)}
                  expanded={expandedRows.has(session.id)}
                  utterances={utterancesMap.get(session.id) ?? []}
                  utteranceSelected={utteranceSelectedMap.get(session.id) ?? new Set()}
                  updatingId={updatingId}
                  saleStatus={saleStatusMap.get(session.id) ?? 'locked'}
                  onToggle={() => toggleSelect(session.id)}
                  onToggleExpand={() => handleExpandRow(session.id)}
                  onStartReview={() => handleStartReview(session.id)}
                  onApprove={() => handleApprove(session.id)}
                  onNeedsRevision={() => handleNeedsRevision(session.id)}
                  onReject={() => setRejectTarget(session.id)}
                  onApprovePanel={(note) => handleApprove(session.id, note)}
                  onNeedsRevisionPanel={(note) => handleNeedsRevision(session.id, note)}
                  onRejectPanel={(note) => handleReject(session.id, note)}
                  onDeliver={() =>
                    setDeliveryTarget({ id: session.id, title: session.title ?? null })
                  }
                  onToggleUtterance={(uid) => handleToggleUtterance(session.id, uid)}
                  onSelectAllUtterances={() => handleSelectAllUtterances(session.id)}
                  onToggleReview={(u) => handleToggleReview(session.id, u)}
                  onLabelSaved={(uid, fields) => handleLabelSaved(session.id, uid, fields)}
                  onDownloadSingle={() => handleDownloadSingle(session.id)}
                  onZipDownload={() => handleZipSingle(session.id)}
                  onZipDownloadV2={() => openFullPackage(session.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-txt-sub">
          <span>총 {total.toLocaleString()}건</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              이전
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              다음
            </Button>
          </div>
        </div>
      )}

      {/* 납품 모달 */}
      <SessionDeliveryModal
        sessionId={deliveryTarget?.id ?? ''}
        sessionTitle={deliveryTarget?.title ?? null}
        open={deliveryTarget !== null}
        onClose={() => setDeliveryTarget(null)}
        onSuccess={() => {
          setDeliveryTarget(null)
          loadStats()
          loadSessions()
        }}
      />

      <FullPackageExportModal
        open={fullPkgSessionId !== null}
        sessionId={fullPkgSessionId}
        onClose={() => setFullPkgSessionId(null)}
      />

      {deliveryPackageLog && (
        <DeliveryPackageModal
          log={deliveryPackageLog}
          open={true}
          onClose={() => setDeliveryPackageLog(null)}
          onSuccess={() => {
            setDeliveryPackageLog(null)
            loadStats()
          }}
        />
      )}

      {/* 거절 확인 다이얼로그 */}
      <ConfirmDialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) handleReject(rejectTarget)
        }}
        title={labels.confirm.rejectTitle}
        body={labels.confirm.rejectBody}
        confirmLabel="거절"
        variant="danger"
      />
    </div>
  )
}

// ── 로컬 서브 컴포넌트 ───────────────────────────────────────────────────────

function SaleStatusBadge({ status }: { status: SaleStatus }) {
  if (status === 'sellable')
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        판매 가능
      </span>
    )
  if (status === 'restricted')
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
        제한
      </span>
    )
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      잠금
    </span>
  )
}

function SessionTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-surface-alt rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

interface SessionRowProps {
  session: AdminSession
  selected: boolean
  actionLoading: boolean
  expanded: boolean
  utterances: AdminUtterance[]
  utteranceSelected: Set<string>
  updatingId: string | null
  saleStatus: SaleStatus
  onToggle: () => void
  onToggleExpand: () => void
  onStartReview: () => void
  onApprove: () => void
  onNeedsRevision: () => void
  onReject: () => void
  onDeliver: () => void
  onToggleUtterance: (utteranceId: string) => void
  onSelectAllUtterances: () => void
  onToggleReview: (u: AdminUtterance) => void
  onLabelSaved: (id: string, updatedFields: Partial<AdminUtterance>) => void
  onApprovePanel: (note?: string) => void
  onNeedsRevisionPanel: (note?: string) => void
  onRejectPanel: (note?: string) => void
  onDownloadSingle: () => void
  onZipDownload: () => void
  onZipDownloadV2: () => void
}

function SessionRow({
  session,
  selected,
  actionLoading,
  expanded,
  utterances,
  utteranceSelected,
  updatingId,
  saleStatus,
  onToggle,
  onToggleExpand,
  onStartReview,
  onApprove,
  onNeedsRevision,
  onReject,
  onDeliver,
  onToggleUtterance,
  onSelectAllUtterances,
  onToggleReview,
  onLabelSaved,
  onApprovePanel,
  onNeedsRevisionPanel,
  onRejectPanel,
  onDownloadSingle,
  onZipDownload,
  onZipDownloadV2,
}: SessionRowProps) {
  const piiFlag = session.pii_flag ?? false
  const piiCount = session.pii_count ?? 0
  const rowBg = selected
    ? 'bg-accent/5'
    : piiFlag
    ? 'bg-red-50 dark:bg-red-900/10'
    : ''

  return (
    <>
      <tr className={`hover:bg-surface-alt transition-colors ${rowBg}`}>
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="accent-accent"
            aria-label={`선택: ${session.title ?? session.id}`}
          />
        </td>
        <td className="px-2 py-3 text-center">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-txt-sub hover:text-txt transition-colors focus:outline-none"
            aria-label={expanded ? '접기' : '펼치기'}
          >
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </td>
        <td className="px-4 py-3 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-txt truncate">
              {session.title ?? `통화 ${session.id.slice(-6)}`}
            </span>
            <CopyIdButton id={session.id} />
          </div>
          <div className="text-xs text-txt-tertiary">
            {new Date(session.date).toLocaleDateString('ko-KR')}
          </div>
        </td>
        <td className="px-4 py-3 text-txt-sub tabular-nums">
          {formatDuration(session.duration_seconds)}
        </td>
        <td className="px-4 py-3">
          <SessionPipelineCells session={session} />
        </td>
        <td className="px-4 py-3">
          <QualityBadge
            grade={session.quality_grade_min}
            score={session.quality_score_avg}
            qualityStatus={session.quality_status}
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge kind="review" value={session.review_status} />
            {piiFlag && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                ⚠ PII {piiCount}건
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <SaleStatusBadge status={saleStatus} />
        </td>
        <td className="px-4 py-3 text-xs text-txt-sub tabular-nums">
          {getOwnerDisplay(session)}
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={onDownloadSingle}
              disabled={saleStatus === 'locked'}
              className="text-sm text-accent hover:text-accent-hover disabled:text-txt-tertiary disabled:cursor-not-allowed focus:outline-none"
              title={saleStatus === 'locked' ? '잠금 상태 — 다운로드 불가' : '메타데이터 ZIP (음성 미포함)'}
            >
              ↓
            </button>
            {session.review_status === 'approved' && (
              <>
                <button
                  type="button"
                  onClick={onZipDownload}
                  className="text-xs font-medium text-accent hover:text-accent-hover focus:outline-none"
                  title="ZIP 내보내기 (서버 — 레거시 작업)"
                >
                  ZIP
                </button>
                {session.consent_status === 'both_agreed' && (
                  <button
                    type="button"
                    onClick={onZipDownloadV2}
                    disabled={actionLoading}
                    className="text-xs font-medium text-accent hover:text-accent-hover disabled:text-txt-tertiary disabled:cursor-not-allowed focus:outline-none"
                    title="풀 패키지 ZIP · 전사/라벨/메타데이터 전체 (참조만 또는 음성 WAV 동봉 선택)"
                  >
                    풀 패키지
                  </button>
                )}
              </>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <RowActions
            pipelineState={getPipelineState(session)}
            activeStageLabel={getActiveStageLabel(session)}
            autoLabelStatus={session.auto_label_status}
            reviewStatus={session.review_status}
            loading={actionLoading}
            onStartReview={onStartReview}
            onApprove={onApprove}
            onNeedsRevision={onNeedsRevision}
            onReject={onReject}
            onDeliver={onDeliver}
          />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={11} className="p-0">
            <UtteranceExpansion
              session={session}
              utterances={utterances}
              selectedSet={utteranceSelected}
              updatingId={updatingId}
              actionLoading={actionLoading}
              onToggleUtterance={onToggleUtterance}
              onSelectAll={onSelectAllUtterances}
              onToggleReview={onToggleReview}
              onLabelSaved={onLabelSaved}
              onApprove={onApprovePanel}
              onNeedsRevision={onNeedsRevisionPanel}
              onRejectPanel={onRejectPanel}
            />
          </td>
        </tr>
      )}
    </>
  )
}

interface RowActionsProps {
  pipelineState: PipelineState
  activeStageLabel: string | null
  autoLabelStatus?: string
  reviewStatus: AdminSession['review_status']
  loading: boolean
  onStartReview: () => void
  onApprove: () => void
  onNeedsRevision: () => void
  onReject: () => void
  onDeliver: () => void
}

function RowActions({
  pipelineState,
  activeStageLabel,
  autoLabelStatus,
  reviewStatus,
  loading,
  onStartReview,
  onApprove,
  onNeedsRevision,
  onReject,
  onDeliver,
}: RowActionsProps) {
  switch (reviewStatus) {
    case 'pending':
      switch (pipelineState) {
        case 'ready':
          return autoLabelStatus === 'skipped' ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onStartReview} disabled={loading} loading={loading}>
                검수 시작
              </Button>
              <span className="text-xs text-yellow-600">⚠ 라벨 누락</span>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={onStartReview} disabled={loading} loading={loading}>
              검수 시작
            </Button>
          )
        case 'idle':
          return <span className="text-xs text-txt-sub">처리 대기</span>
        case 'waiting':
          return <span className="text-xs text-amber-600">처리 중단{activeStageLabel ? ` (${activeStageLabel})` : ''}</span>
        case 'stuck':
          return <span className="text-xs text-amber-600">⚠ 병목{activeStageLabel ? ` (${activeStageLabel})` : ''}</span>
        case 'failed':
          return <span className="text-xs text-red-600">❌ 실패</span>
        default:
          return <span className="text-xs text-txt-sub">⏳ 처리 중{activeStageLabel ? ` (${activeStageLabel})` : ''}</span>
      }
    case 'in_review':
      return (
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onApprove} disabled={loading} loading={loading}>
            승인
          </Button>
          <Button variant="secondary" size="sm" onClick={onNeedsRevision} disabled={loading}>
            수정필요
          </Button>
          <Button variant="danger" size="sm" onClick={onReject} disabled={loading}>
            거절
          </Button>
        </div>
      )
    case 'needs_revision':
      return (
        <Button variant="secondary" size="sm" onClick={onStartReview} disabled={loading} loading={loading}>
          재검수 시작
        </Button>
      )
    case 'approved':
      return (
        <Button variant="secondary" size="sm" onClick={onDeliver} disabled={loading}>
          납품 등록
        </Button>
      )
    case 'rejected':
      return <span className="text-xs text-txt-tertiary">거절됨</span>
    default:
      return null
  }
}
