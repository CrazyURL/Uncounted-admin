// ── Admin API Client ───────────────────────────────────────────────────
// 백엔드 Admin API 호출 레이어

import { apiFetch, getAuthToken } from './client'

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

// ── Metadata Inventory (SKU 기반) ───────────────────────────────────────

export interface MetadataSkuInventory {
  schemaId: string
  displayName: string
  totalEvents: number
  deviceCount: number
  periodStart: string | null
  periodEnd: string | null
  qualityDistribution: { good: number; partial: number; sparse: number }
  syncStatus: { upToDate: number; stale: number }
}

/** SKU별 메타데이터 인벤토리 조회 */
export async function fetchMetadataInventory() {
  return apiFetch<{ skus: MetadataSkuInventory[] }>('/api/admin/metadata/inventory')
}

export interface MetadataDeviceStats {
  pseudoId: string
  eventCount: number
  lastSyncAt: string | null
  syncStatus: 'up_to_date' | 'stale'
}

export interface MetadataSkuStats {
  devices: MetadataDeviceStats[]
  fieldDistributions: Record<string, Record<string, number>>
  heatmap: Array<{ dateBucket: string; timeBucket: string; count: number }>
}

/** SKU 상세 통계 (디바이스 목록, 필드 분포, 히트맵) */
export async function fetchMetadataSkuStats(schemaId: string) {
  return apiFetch<MetadataSkuStats>(`/api/admin/metadata/${encodeURIComponent(schemaId)}/stats`)
}

export interface MetadataPreviewResult {
  events: Array<Record<string, unknown>>
  fieldDistributions: Record<string, Record<string, number>>
  total: number
}

export interface MetadataPreviewQuery {
  quality?: string
  dateFrom?: string
  dateTo?: string
  pseudoId?: string
  limit?: number
  offset?: number
}

/** SKU 이벤트 프리뷰 (필터 + 분포) */
export async function fetchMetadataPreview(schemaId: string, query?: MetadataPreviewQuery) {
  const params = new URLSearchParams()
  if (query?.quality) params.set('quality', query.quality)
  if (query?.dateFrom) params.set('dateFrom', query.dateFrom)
  if (query?.dateTo) params.set('dateTo', query.dateTo)
  if (query?.pseudoId) params.set('pseudoId', query.pseudoId)
  if (query?.limit != null) params.set('limit', String(query.limit))
  if (query?.offset != null) params.set('offset', String(query.offset))
  const qs = params.toString()
  return apiFetch<MetadataPreviewResult>(
    `/api/admin/metadata/${encodeURIComponent(schemaId)}/preview${qs ? `?${qs}` : ''}`,
  )
}

// ── Metadata Export (생성/상태/다운로드) ──────────────────────────────────

export interface CreateMetadataExportRequest {
  schemaIds: string[]
  filters?: {
    pseudoIds?: string[]
    dateFrom?: string
    dateTo?: string
    quality?: string
    excludeQuality?: string
    excludeStaleDevices?: boolean
  }
  clientName: string
}

export interface MetadataExportJob {
  jobId: string
  status: 'ready' | 'failed'
  storagePath?: string
  totalEvents?: number
  error?: string
}

export interface MetadataExportJobStatus {
  id: string
  status: string
  type: 'metadata'
  storagePath?: string
  totalEvents?: number
  errorMessage?: string
  createdAt: string
}

/** 메타데이터 Export 작업 생성 (동기 처리) */
export async function createMetadataExport(request: CreateMetadataExportRequest) {
  return apiFetch<MetadataExportJob>('/api/admin/metadata/export', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/** Export 작업 상태 조회 */
export async function fetchMetadataExportStatus(jobId: string) {
  return apiFetch<MetadataExportJobStatus>(
    `/api/admin/metadata/export/${encodeURIComponent(jobId)}/status`,
  )
}

/** Export 다운로드 URL 조회 (24시간 유효 서명 URL) */
export async function fetchMetadataExportDownload(jobId: string) {
  return apiFetch<{ downloadUrl: string; expiresAt: string }>(
    `/api/admin/metadata/export/${encodeURIComponent(jobId)}/download`,
  )
}

// ── Metadata Events (DB) ────────────────────────────────────────────────

export type MetadataEventEntry = {
  id: string
  schema_id: string
  pseudo_id: string
  user_id: string | null
  date_bucket: string | null
  payload: Record<string, unknown>
  received_at: string
}

export type MetadataSummary = {
  totalEvents: number
  uniqueUsers: number
  bySchema: Array<{ schemaId: string; count: number }>
}

/** 메타데이터 요약 조회 (메타 탭 대시보드용) */
export async function fetchMetadataSummary() {
  return apiFetch<MetadataSummary>('/api/admin/metadata/summary')
}

/** 메타데이터 이벤트 조회 (페이지네이션 + 필터) */
export async function fetchMetadataEvents(opts?: {
  schema?: string
  pseudoId?: string
  limit?: number
  offset?: number
}) {
  const params = new URLSearchParams()
  if (opts?.schema) params.set('schema', opts.schema)
  if (opts?.pseudoId) params.set('pseudo_id', opts.pseudoId)
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))

  const qs = params.toString()
  return apiFetch<MetadataEventEntry[]>(
    `/api/admin/metadata/events${qs ? `?${qs}` : ''}`,
  )
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

// ── Bulk Label Update ──────────────────────────────────────────────────

export async function bulkUpdateLabelsApi(
  unitIds: string[],
  labels: Record<string, string | null>,
) {
  return apiFetch<{ updated: number }>('/api/admin/billable-units/bulk-labels', {
    method: 'POST',
    body: JSON.stringify({ unitIds, labels }),
  })
}

// ── Export Requests (Phase 1) ──────────────────────────────────────────

import type {
  ExportRequest,
  ExportPreview,
  ExportUtterance,
  SkuInventory,
} from '../../types/export'

export async function previewExportRequestApi(id: string) {
  return apiFetch<ExportPreview>(`/api/admin/export-requests/${id}/preview`)
}

export async function confirmExportRequestApi(id: string) {
  return apiFetch<ExportRequest>(`/api/admin/export-requests/${id}/confirm`, {
    method: 'PUT',
  })
}

export async function processExportRequestApi(id: string) {
  return apiFetch<ExportRequest>(`/api/admin/export-requests/${id}/process`, {
    method: 'POST',
  })
}

export async function loadExportUtterancesApi(id: string) {
  return apiFetch<ExportUtterance[]>(`/api/admin/export-requests/${id}/utterances`)
}

/**
 * PUT /export-requests/:id/utterances/review 응답.
 *
 * - updated + failed === total 불변식
 * - v3Matched: utterances 테이블에서 실제 영향 받은 행 수 (합계)
 * - legacyMatched: export_package_items에서 실제 영향 받은 행 수 (합계)
 * - failures: 실패한 항목 샘플 (서버에서 최대 10건까지만 내려줌)
 */
export interface ReviewUtterancesResult {
  updated: number
  failed: number
  total: number
  v3Matched?: number
  legacyMatched?: number
  failures?: Array<{ utteranceId: string; reason: string }>
}

export async function reviewExportUtterancesApi(
  id: string,
  updates: Array<{ utteranceId: string; isIncluded: boolean; excludeReason?: string }>,
) {
  return apiFetch<ReviewUtterancesResult>(`/api/admin/export-requests/${id}/utterances/review`, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  })
}

export async function finalizeExportRequestApi(id: string) {
  // 응답: 202 Accepted + { data: { status: 'packaging' } }
  // 또는 409 Conflict (이미 진행 중) → adminStore에서 폴링으로 처리
  return apiFetch<{ status: ExportRequest['status'] }>(`/api/admin/export-requests/${id}/finalize`, {
    method: 'POST',
  })
}

export async function downloadExportRequestApi(id: string) {
  return apiFetch<{ downloadUrl: string; expiresAt: string }>(`/api/admin/export-requests/${id}/download`)
}

export async function loadSkuInventoryApi() {
  return apiFetch<SkuInventory[]>('/api/admin/inventory')
}

// ── PII Masking ────────────────────────────────────────────────────────

export interface PiiInterval {
  id: string
  startSec: number
  endSec: number
  piiType: string
  maskType: 'beep' | 'silence'
  source: 'auto' | 'manual'
}

export async function loadUtterancePiiApi(utteranceId: string, signal?: AbortSignal) {
  return apiFetch<{ piiIntervals: PiiInterval[]; piiReviewedAt: string | null; piiReviewedBy: string | null }>(
    `/api/admin/utterances/${utteranceId}/pii`,
    { signal },
  )
}

export async function saveUtterancePiiApi(utteranceId: string, intervals: PiiInterval[]) {
  return apiFetch<{ ok: boolean }>(`/api/admin/utterances/${utteranceId}/pii`, {
    method: 'PUT',
    body: JSON.stringify({ piiIntervals: intervals }),
  })
}

export async function saveUtteranceLabelsBatchApi(
  utteranceIds: string[],
  labels: Record<string, unknown>,
) {
  return apiFetch<{ updated: number }>(`/api/admin/utterances/labels`, {
    method: 'POST',
    body: JSON.stringify({ utteranceIds, labels }),
  })
}

export async function applyUtteranceMaskApi(utteranceId: string) {
  return apiFetch<{ success: boolean }>(`/api/admin/utterances/${utteranceId}/apply-mask`, {
    method: 'POST',
  })
}

export async function checkUtteranceOriginalBackupApi(utteranceId: string, signal?: AbortSignal) {
  return apiFetch<{ hasBackup: boolean }>(`/api/admin/utterances/${utteranceId}/original-backup`, { signal })
}

export async function restoreUtteranceOriginalApi(utteranceId: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/utterances/${utteranceId}/restore-original`, {
    method: 'POST',
  })
}

export async function loadUtteranceAudioUrlApi(utteranceId: string) {
  return apiFetch<{ signedUrl: string }>(`/api/admin/utterances/${utteranceId}/audio`)
}

/**
 * WAV 바이너리를 Blob으로 프록시 로드 (wavesurfer.js CORS 우회)
 */
export async function loadUtteranceAudioBlobApi(utteranceId: string, signal?: AbortSignal): Promise<Blob> {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
  const token = getAuthToken()

  // cache-bust: 마스킹 적용 후 이전 캐시된 원본이 재사용되는 것 방지
  const cacheBust = Date.now()
  const res = await fetch(`${API_BASE}/api/admin/utterances/${utteranceId}/audio/stream?t=${cacheBust}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    cache: 'no-store',
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Audio stream failed: ${res.status}${body ? ` — ${body}` : ''}`)
  }

  return res.blob()
}

/**
 * PII 구간이 적용된 마스킹 미리보기 WAV Blob 반환 (DB/S3 변경 없음)
 */
export async function previewUtteranceMaskApi(utteranceId: string): Promise<Blob> {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
  const token = getAuthToken()

  const res = await fetch(`${API_BASE}/api/admin/utterances/${utteranceId}/preview-mask`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })

  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error || '미리보기 로드 실패')
  }

  return res.blob()
}

// ── Consent Force Update ────────────────────────────────────────────────

export async function forceUpdateConsentApi(
  sessionIds: string[],
  consentStatus: 'both_agreed',
) {
  return apiFetch<{ updated: number; skipped: number; consentStatus: string }>('/api/admin/sessions/consent-force-update', {
    method: 'PUT',
    body: JSON.stringify({ sessionIds, consentStatus }),
  })
}

// ── Reset All ───────────────────────────────────────────────────────────

export async function resetAllApi() {
  return apiFetch<{ tables: Record<string, number | string> }>('/api/admin/reset-all', {
    method: 'DELETE',
  })
}
