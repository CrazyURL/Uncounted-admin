// ── Admin API Client ───────────────────────────────────────────────────
// 백엔드 Admin API 호출 레이어

import { apiFetch } from './client'

// ── Admin Auth ───────────────────────────────────────────────────────────

/**
 * 서버에서 admin 권한 여부를 확인
 * 200 → admin, 403 → unauthorized, 401 → unauthenticated
 */
export async function checkAdminMe() {
  const result = await apiFetch<{ user: { id: string; email: string } }>('/api/admin/me')
  // 백엔드가 { user: {...} } 직접 반환 시 data로 정규화
  if (!result.data && !result.error && (result as any).user) {
    return { ...result, data: { user: (result as any).user as { id: string; email: string } } }
  }
  return result
}

// ── Clients ─────────────────────────────────────────────────────────────

export async function loadClientsApi() {
  return apiFetch<any[]>('/api/admin/clients')
}

export async function saveClientApi(client: any) {
  return apiFetch('/api/admin/clients', {
    method: 'POST',
    body: JSON.stringify(client),
  })
}

export async function deleteClientApi(id: string) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: 'DELETE',
  })
}

// ── Delivery Profiles ───────────────────────────────────────────────────

export async function loadDeliveryProfilesApi(clientId?: string) {
  const params = clientId ? `?clientId=${clientId}` : ''
  return apiFetch<any[]>(`/api/admin/delivery-profiles${params}`)
}

export async function saveDeliveryProfileApi(profile: any) {
  return apiFetch('/api/admin/delivery-profiles', {
    method: 'POST',
    body: JSON.stringify(profile),
  })
}

export async function deleteDeliveryProfileApi(id: string) {
  return apiFetch(`/api/admin/delivery-profiles/${id}`, {
    method: 'DELETE',
  })
}

// ── Client SKU Rules ────────────────────────────────────────────────────

export async function loadClientSkuRulesApi(clientId: string) {
  return apiFetch<any[]>(`/api/admin/client-sku-rules?clientId=${clientId}`)
}

export async function saveClientSkuRuleApi(rule: any) {
  return apiFetch('/api/admin/client-sku-rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  })
}

export async function deleteClientSkuRuleApi(id: string) {
  return apiFetch(`/api/admin/client-sku-rules/${id}`, {
    method: 'DELETE',
  })
}

// ── SKU Presets ─────────────────────────────────────────────────────────

export async function loadSkuPresetsApi() {
  return apiFetch<any[]>('/api/admin/sku-presets')
}

export async function saveSkuPresetApi(preset: any) {
  return apiFetch('/api/admin/sku-presets', {
    method: 'POST',
    body: JSON.stringify(preset),
  })
}

export async function deleteSkuPresetApi(id: string) {
  return apiFetch(`/api/admin/sku-presets/${id}`, {
    method: 'DELETE',
  })
}

// ── Export Jobs ─────────────────────────────────────────────────────────

export async function loadExportJobsApi() {
  return apiFetch<any[]>('/api/admin/export-jobs')
}

export async function getExportJobApi(id: string) {
  return apiFetch<any>(`/api/admin/export-jobs/${id}`)
}

export async function saveExportJobApi(job: any) {
  return apiFetch('/api/admin/export-jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  })
}

export async function appendJobLogApi(jobId: string, log: any) {
  return apiFetch(`/api/admin/export-jobs/${jobId}/logs`, {
    method: 'POST',
    body: JSON.stringify({ log }),
  })
}

export async function deleteExportJobApi(id: string) {
  return apiFetch(`/api/admin/export-jobs/${id}`, {
    method: 'DELETE',
  })
}

// ── Billable Units ──────────────────────────────────────────────────────

export type BillableUnitFilters = {
  qualityGrade?: ('A' | 'B' | 'C')[]
  qualityTier?: string[]
  consentStatus?: string
  lockStatus?: string
  sessionDate?: { from: string; to: string }
  userId?: string
  limit?: number
  offset?: number
}

export async function loadBillableUnitsApi(filters?: BillableUnitFilters) {
  const params = new URLSearchParams()

  if (filters?.qualityGrade?.length) {
    params.set('qualityGrade', filters.qualityGrade.join(','))
  }
  if (filters?.qualityTier?.length) {
    params.set('qualityTier', filters.qualityTier.join(','))
  }
  if (filters?.consentStatus) {
    params.set('consentStatus', filters.consentStatus)
  }
  if (filters?.lockStatus) {
    params.set('lockStatus', filters.lockStatus)
  }
  if (filters?.userId) {
    params.set('userId', filters.userId)
  }
  if (filters?.sessionDate) {
    params.set('dateFrom', filters.sessionDate.from)
    params.set('dateTo', filters.sessionDate.to)
  }
  if (filters?.limit != null) {
    params.set('limit', String(filters.limit))
  }
  if (filters?.offset != null) {
    params.set('offset', String(filters.offset))
  }

  const query = params.toString()
  return apiFetch<any[]>(`/api/admin/billable-units${query ? `?${query}` : ''}`)
}

export async function upsertBillableUnitsApi(units: any[]) {
  return apiFetch<{ count: number }>('/api/admin/billable-units', {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}

export async function lockUnitsForJobApi(unitIds: string[], jobId: string) {
  return apiFetch<{ locked: number }>('/api/admin/billable-units/lock', {
    method: 'POST',
    body: JSON.stringify({ unitIds, jobId }),
  })
}

export async function unlockUnitsForJobApi(jobId: string) {
  return apiFetch('/api/admin/billable-units/unlock', {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  })
}

export async function markUnitsDeliveredApi(jobId: string) {
  return apiFetch('/api/admin/billable-units/mark-delivered', {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  })
}

// ── Ledger Entries ──────────────────────────────────────────────────────

export type LedgerEntryApiFilters = {
  userId?: string
  status?: string
  exportJobId?: string
  buIds?: string[]
}

export async function loadLedgerEntriesApi(filters?: LedgerEntryApiFilters) {
  const params = new URLSearchParams()
  if (filters?.userId) params.set('userId', filters.userId)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.exportJobId) params.set('exportJobId', filters.exportJobId)
  if (filters?.buIds?.length) params.set('buIds', filters.buIds.join(','))
  const query = params.toString()
  return apiFetch<any[]>(`/api/admin/ledger-entries${query ? `?${query}` : ''}`)
}

export async function upsertLedgerEntriesApi(entries: any[]) {
  return apiFetch<{ count: number }>('/api/admin/ledger-entries', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

export async function updateLedgerStatusApi(
  ids: string[],
  status: string,
  confirmedAmount?: number,
) {
  return apiFetch<{ updated: number }>('/api/admin/ledger-entries/update-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status, confirmedAmount }),
  })
}

export async function confirmJobLedgerEntriesApi(exportJobId: string, totalPayment: number) {
  return apiFetch<{ confirmed: number }>('/api/admin/ledger-entries/confirm-job', {
    method: 'POST',
    body: JSON.stringify({ exportJobId, totalPayment }),
  })
}

// ── Delivery Records ─────────────────────────────────────────────────────

export async function loadDeliveryRecordsApi(clientId: string) {
  return apiFetch<any[]>(`/api/admin/delivery-records?clientId=${encodeURIComponent(clientId)}`)
}

export async function insertDeliveryRecordsApi(
  buIds: string[],
  clientId: string,
  exportJobId: string,
) {
  return apiFetch<{ count: number }>('/api/admin/delivery-records', {
    method: 'POST',
    body: JSON.stringify({ buIds, clientId, exportJobId }),
  })
}

// ── Admin Storage ───────────────────────────────────────────────────────

export type StorageWavEntry = {
  userId: string
  sessionId: string
  path: string
}

/** 전체 유저 WAV 목록 조회 (어드민 전용) */
export async function listStorageWavsApi() {
  return apiFetch<StorageWavEntry[]>('/api/admin/storage/wavs')
}

export type StorageMetaEntry = {
  userId: string
  batchId: string
  path: string
}

/** 전체 유저 Meta JSONL 목록 조회 (어드민 전용) */
export async function listStorageMetasApi() {
  return apiFetch<StorageMetaEntry[]>('/api/admin/storage/metas')
}

/** Admin Meta JSONL signed URL 생성 */
export async function getAdminMetaSignedUrlApi(storagePath: string, expiresIn = 300) {
  return apiFetch<{ signedUrl: string }>('/api/admin/storage/signed-url', {
    method: 'POST',
    body: JSON.stringify({ storagePath, expiresIn, bucket: 'meta' }),
  })
}

// ── Session Chunks ───────────────────────────────────────────────────────

export type ChunkSignedUrlEntry = {
  sessionId: string
  minuteIndex: number
  storagePath: string
  signedUrl: string
  durationSeconds: number
}

/**
 * session_chunks 테이블의 청크 목록을 조회하고 각 storage_path의 Signed URL을 일괄 반환
 * 백엔드: POST /api/admin/session-chunks/batch-signed-urls
 */
export async function fetchChunkSignedUrlsApi(sessionIds: string[]) {
  return apiFetch<ChunkSignedUrlEntry[]>(
    '/api/admin/session-chunks/batch-signed-urls',
    {
      method: 'POST',
      body: JSON.stringify({ sessionIds }),
    },
  )
}

/** Admin signed URL 생성 (RLS 우회) */
export async function getAdminSignedUrlApi(storagePath: string, expiresIn = 300) {
  return apiFetch<{ signedUrl: string }>('/api/admin/storage/signed-url', {
    method: 'POST',
    body: JSON.stringify({ storagePath, expiresIn }),
  })
}

/** storage WAV → sessions.audio_url 동기화 */
export async function syncAudioUrlsApi() {
  return apiFetch<{ updated: number; total: number }>('/api/admin/sync-audio-urls', {
    method: 'POST',
  })
}

// ── Admin Transcripts ───────────────────────────────────────────────────

/** transcript 있는 session_id 목록 반환 */
export async function fetchTranscriptIdsApi() {
  return apiFetch<string[]>('/api/admin/transcript-ids')
}

/** 세션별 transcript 일괄 조회 */
export async function bulkFetchTranscriptsApi(sessionIds: string[]) {
  return apiFetch<{ sessionId: string; text: string; words?: unknown[]; summary?: string; source?: string }[]>(
    '/api/admin/transcripts/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ sessionIds }),
    },
  )
}

// ── Admin Sessions (필터 + 페이징) ──────────────────────────────────────

import { type Session } from '../../types/session'
import { type UserGroupSummary } from '../adminHelpers'

export type AdminSessionsQuery = {
  limit?: number
  offset?: number
  domains?: string[]
  qualityGrades?: string[]
  labelStatus?: 'labeled' | 'unlabeled'
  publicStatus?: 'public' | 'private'
  piiCleanedOnly?: boolean
  hasAudioUrl?: boolean
  diarizationStatus?: 'done' | 'none'
  transcriptStatus?: 'done' | 'none'
  uploadStatuses?: string[]
  dateFrom?: string
  dateTo?: string
  sortBy?: 'date' | 'qaScore' | 'duration'
  sortDir?: 'asc' | 'desc'
}

export type AdminUsersStatsQuery = Omit<AdminSessionsQuery, 'sortBy'> & {
  sortBy?: 'sessionCount' | 'totalDuration' | 'avgQaScore'
}

function buildAdminSessionParams(query: AdminSessionsQuery | AdminUsersStatsQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.offset != null) params.set('offset', String(query.offset))
  if (query.domains?.length) query.domains.forEach(d => params.append('domains', d))
  if (query.qualityGrades?.length) query.qualityGrades.forEach(g => params.append('qualityGrades', g))
  if (query.labelStatus) params.set('labelStatus', query.labelStatus)
  if (query.publicStatus) params.set('publicStatus', query.publicStatus)
  if (query.piiCleanedOnly) params.set('piiCleanedOnly', 'true')
  if (query.hasAudioUrl) params.set('hasAudioUrl', 'true')
  if (query.diarizationStatus) params.set('diarizationStatus', query.diarizationStatus)
  if (query.transcriptStatus) params.set('transcriptStatus', query.transcriptStatus)
  if (query.uploadStatuses?.length) query.uploadStatuses.forEach(s => params.append('uploadStatuses', s))
  if (query.dateFrom) params.set('dateFrom', query.dateFrom)
  if (query.dateTo) params.set('dateTo', query.dateTo)
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.sortDir) params.set('sortDir', query.sortDir)
  return params
}

/** GET /api/admin/sessions — 필터·정렬·페이징 지원 (flat 탭용) */
export async function fetchAdminSessionsApi(query: AdminSessionsQuery = {}) {
  const params = buildAdminSessionParams(query)
  return apiFetch<Session[]>(`/api/admin/sessions?${params}`)
}

/** GET /api/admin/users/stats — 사용자별 집계 + 페이징 (byUser 탭용) */
export async function fetchAdminUserStatsApi(query: AdminUsersStatsQuery = {}) {
  const params = buildAdminSessionParams(query)
  return apiFetch<UserGroupSummary[]>(`/api/admin/users/stats?${params}`)
}

// ── Reset All ───────────────────────────────────────────────────────────

export async function resetAllApi() {
  return apiFetch<{ tables: Record<string, number | string> }>('/api/admin/reset-all', {
    method: 'DELETE',
  })
}
