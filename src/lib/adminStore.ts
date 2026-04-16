import {
  type BillableUnit,
  type BillableUnitStats,
  type Client,
  type DeliveryProfile,
  type ClientSkuRule,
  type SkuPreset,
  type ExportJob,
  type ExportJobLog,
  type DeliveryRecord,
} from '../types/admin'
import * as AdminAPI from './api/admin'
import { type LedgerEntry, type LedgerStatus } from '../types/ledger'

// ── helpers ──────────────────────────────────────────────────────────────────

function isApiConfigured(): boolean {
  return import.meta.env.VITE_API_URL !== undefined
}

// ── Clients ──────────────────────────────────────────────────────────────────

export async function loadClients(): Promise<Client[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadClientsApi()
  if (error) throw new Error(`loadClients: ${error}`)
  return (data ?? []).map(clientFromRow)
}

export async function saveClient(client: Client): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.saveClientApi(clientToRow(client))
  if (error) throw new Error(`saveClient: ${error}`)
}

export async function deleteClient(id: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.deleteClientApi(id)
  if (error) throw new Error(`deleteClient: ${error}`)
}

function clientFromRow(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: row.name as string,
    contactName: (row.contact_name as string) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    notes: (row.notes as string) ?? null,
    isActive: (row.is_active as boolean) ?? true,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  }
}

function clientToRow(c: Client) {
  return {
    id: c.id,
    name: c.name,
    contact_name: c.contactName,
    contact_email: c.contactEmail,
    notes: c.notes,
    is_active: c.isActive,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

// ── Delivery Profiles ────────────────────────────────────────────────────────

export async function loadDeliveryProfiles(clientId?: string): Promise<DeliveryProfile[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadDeliveryProfilesApi(clientId)
  if (error) throw new Error(`loadDeliveryProfiles: ${error}`)
  return (data ?? []).map(dpFromRow)
}

export async function saveDeliveryProfile(dp: DeliveryProfile): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.saveDeliveryProfileApi(dpToRow(dp))
  if (error) throw new Error(`saveDeliveryProfile: ${error}`)
}

export async function deleteDeliveryProfile(id: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.deleteDeliveryProfileApi(id)
  if (error) throw new Error(`deleteDeliveryProfile: ${error}`)
}

function dpFromRow(row: Record<string, unknown>): DeliveryProfile {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    name: row.name as string,
    format: (row.format as DeliveryProfile['format']) ?? 'jsonl',
    fieldset: (row.fieldset as string[]) ?? [],
    channelKo: (row.channel_ko as string) ?? '직접 전달',
    requiresPiiCleaned: (row.requires_pii_cleaned as boolean) ?? false,
    requiresConsentVerified: (row.requires_consent_verified as boolean) ?? true,
    minQualityGrade: (row.min_quality_grade as DeliveryProfile['minQualityGrade']) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  }
}

function dpToRow(dp: DeliveryProfile) {
  return {
    id: dp.id,
    client_id: dp.clientId,
    name: dp.name,
    format: dp.format,
    fieldset: dp.fieldset,
    channel_ko: dp.channelKo,
    requires_pii_cleaned: dp.requiresPiiCleaned,
    requires_consent_verified: dp.requiresConsentVerified,
    min_quality_grade: dp.minQualityGrade,
    notes: dp.notes,
    created_at: dp.createdAt,
    updated_at: dp.updatedAt,
  }
}

// ── Client SKU Rules ─────────────────────────────────────────────────────────

export async function loadClientSkuRules(clientId: string): Promise<ClientSkuRule[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadClientSkuRulesApi(clientId)
  if (error) throw new Error(`loadClientSkuRules: ${error}`)
  return (data ?? []).map(csrFromRow)
}

export async function saveClientSkuRule(rule: ClientSkuRule): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.saveClientSkuRuleApi(csrToRow(rule))
  if (error) throw new Error(`saveClientSkuRule: ${error}`)
}

export async function deleteClientSkuRule(id: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.deleteClientSkuRuleApi(id)
  if (error) throw new Error(`deleteClientSkuRule: ${error}`)
}

function csrFromRow(row: Record<string, unknown>): ClientSkuRule {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    skuId: row.sku_id as ClientSkuRule['skuId'],
    presetId: (row.preset_id as string) ?? null,
    componentIds: (row.component_ids as string[]) ?? ['BASIC'],
    maxUnitsPerMonth: (row.max_units_month as number) ?? null,
    pricePerUnit: (row.price_per_unit as number) ?? null,
    discountPct: (row.discount_pct as number) ?? 0,
    isActive: (row.is_active as boolean) ?? true,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  }
}

function csrToRow(r: ClientSkuRule) {
  return {
    id: r.id,
    client_id: r.clientId,
    sku_id: r.skuId,
    preset_id: r.presetId,
    component_ids: r.componentIds,
    max_units_month: r.maxUnitsPerMonth,
    price_per_unit: r.pricePerUnit,
    discount_pct: r.discountPct,
    is_active: r.isActive,
    created_at: r.createdAt,
  }
}

// ── SKU Presets ──────────────────────────────────────────────────────────────

export async function loadSkuPresets(): Promise<SkuPreset[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadSkuPresetsApi()
  if (error) throw new Error(`loadSkuPresets: ${error}`)
  return (data ?? []).map(spFromRow)
}

export async function saveSkuPreset(preset: SkuPreset): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.saveSkuPresetApi(spToRow(preset))
  if (error) throw new Error(`saveSkuPreset: ${error}`)
}

export async function deleteSkuPreset(id: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.deleteSkuPresetApi(id)
  if (error) throw new Error(`deleteSkuPreset: ${error}`)
}

function spFromRow(row: Record<string, unknown>): SkuPreset {
  // require_labels: JSONB stored as false | true | string[]
  let requireLabels: SkuPreset['requireLabels'] = false
  const rl = row.require_labels
  if (rl === true) requireLabels = true
  else if (Array.isArray(rl)) requireLabels = rl as string[]

  return {
    id: row.id as string,
    name: row.name as string,
    baseSkuId: row.base_sku_id as SkuPreset['baseSkuId'],
    componentIds: (row.component_ids as SkuPreset['componentIds']) ?? ['BASIC'],
    requireAudio: (row.require_audio as boolean) ?? true,
    requireLabels,
    labelValueFilter: (row.label_value_filter as Record<string, string[]>) ?? {},
    requireConsent: (row.require_consent as boolean) ?? true,
    requirePiiCleaned: (row.require_pii_cleaned as boolean) ?? false,
    minQualityGrade: (row.min_quality_grade as SkuPreset['minQualityGrade']) ?? null,
    domainFilter: (row.domain_filter as string[]) ?? [],
    exportFields: (row.export_fields as string[]) ?? [],
    preferredFormat: (row.preferred_format as SkuPreset['preferredFormat']) ?? 'jsonl',
    suggestedPricePerUnit: (row.suggested_price_per_unit as number) ?? null,
    notes: (row.notes as string) ?? null,
    isActive: (row.is_active as boolean) ?? true,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  }
}

function spToRow(p: SkuPreset) {
  return {
    id: p.id,
    name: p.name,
    base_sku_id: p.baseSkuId,
    component_ids: p.componentIds,
    require_audio: p.requireAudio,
    require_labels: p.requireLabels,
    label_value_filter: p.labelValueFilter,
    require_consent: p.requireConsent,
    require_pii_cleaned: p.requirePiiCleaned,
    min_quality_grade: p.minQualityGrade,
    domain_filter: p.domainFilter,
    export_fields: p.exportFields,
    preferred_format: p.preferredFormat,
    suggested_price_per_unit: p.suggestedPricePerUnit,
    notes: p.notes,
    is_active: p.isActive,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }
}

// ── Export Jobs ───────────────────────────────────────────────────────────────

export async function loadExportJobs(): Promise<ExportJob[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadExportJobsApi()
  if (error) { console.warn('loadExportJobs error:', error); return [] }
  return (data ?? []).map(ejFromRow)
}

export async function getExportJob(id: string): Promise<ExportJob | null> {
  if (!isApiConfigured()) return null
  const { data, error } = await AdminAPI.getExportJobApi(id)
  if (error || !data) return null
  return ejFromRow(data)
}

export async function saveExportJob(job: ExportJob): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.saveExportJobApi(ejToRow(job))
  if (error) console.warn('saveExportJob error:', error)
}

export async function appendJobLog(jobId: string, log: ExportJobLog): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.appendJobLogApi(jobId, log)
  if (error) console.warn('appendJobLog error:', error)
}

export async function deleteExportJob(id: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.deleteExportJobApi(id)
  if (error) console.warn('deleteExportJob error:', error)
}

function ejFromRow(row: Record<string, unknown>): ExportJob {
  return {
    id: row.id as string,
    clientId: (row.client_id as string) ?? null,
    skuId: row.sku_id as ExportJob['skuId'],
    componentIds: (row.component_ids as ExportJob['componentIds']) ?? ['BASIC'],
    deliveryProfileId: (row.delivery_profile_id as string) ?? null,
    requestedUnits: (row.requested_units as number) ?? 0,
    actualUnits: (row.actual_units as number) ?? 0,
    samplingStrategy: (row.sampling_strategy as ExportJob['samplingStrategy']) ?? 'all',
    filters: (row.filters as ExportJob['filters']) ?? {
      minQualityGrade: null, qualityTier: null, labelSource: null,
      requireConsent: true, requirePiiCleaned: false, dateRange: null, userIds: [],
    },
    status: (row.status as ExportJob['status']) ?? 'draft',
    selectionManifest: (row.selection_manifest as string[]) ?? null,
    outputFormat: (row.output_format as ExportJob['outputFormat']) ?? 'jsonl',
    logs: (row.logs as ExportJobLog[]) ?? [],
    errorMessage: (row.error_message as string) ?? null,
    packagingStage: (row.packaging_stage as string) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
  }
}

function ejToRow(j: ExportJob) {
  return {
    id: j.id,
    client_id: j.clientId,
    sku_id: j.skuId,
    component_ids: j.componentIds,
    delivery_profile_id: j.deliveryProfileId,
    requested_units: j.requestedUnits,
    actual_units: j.actualUnits,
    sampling_strategy: j.samplingStrategy,
    filters: j.filters,
    status: j.status,
    selection_manifest: j.selectionManifest,
    output_format: j.outputFormat,
    logs: j.logs,
    error_message: j.errorMessage,
    created_at: j.createdAt,
    started_at: j.startedAt,
    completed_at: j.completedAt,
  }
}

// ── Billable Units ───────────────────────────────────────────────────────────

export type BillableUnitFilters = {
  qualityGrade?: ('A' | 'B' | 'C')[]
  qualityTier?: string[]
  consentStatus?: string
  lockStatus?: string
  sessionDate?: { from: string; to: string }
  userId?: string
}

export async function loadBillableUnits(filters?: BillableUnitFilters): Promise<BillableUnit[]> {
  if (!isApiConfigured()) return []

  const { data, error } = await AdminAPI.loadBillableUnitsApi(filters)
  if (error) {
    console.warn('loadBillableUnits error:', error)
    return []
  }

  return (data ?? []).map(buFromRow)
}

export async function upsertBillableUnits(units: BillableUnit[]): Promise<void> {
  if (!isApiConfigured() || units.length === 0) return

  const rows = units.map(buToRow)
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await AdminAPI.upsertBillableUnitsApi(batch)
    if (error) {
      throw new Error(`upsertBillableUnits: ${error}`)
    }
  }
}

export async function lockUnitsForJob(unitIds: string[], jobId: string): Promise<number> {
  if (!isApiConfigured() || unitIds.length === 0) return 0

  const { data, error } = await AdminAPI.lockUnitsForJobApi(unitIds, jobId)
  if (error) {
    console.warn('lockUnitsForJob error:', error)
    return 0
  }

  return data?.locked ?? 0
}

export async function unlockUnitsForJob(jobId: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.unlockUnitsForJobApi(jobId)
  if (error) console.warn('unlockUnitsForJob error:', error)
}

export async function markUnitsDelivered(jobId: string): Promise<void> {
  if (!isApiConfigured()) return
  const { error } = await AdminAPI.markUnitsDeliveredApi(jobId)
  if (error) console.warn('markUnitsDelivered error:', error)
}

export async function getBillableUnitStats(): Promise<BillableUnitStats> {
  const empty: BillableUnitStats = {
    total: 0, available: 0, locked: 0, delivered: 0,
    byGrade: { A: 0, B: 0, C: 0 },
    byTier: { basic: 0, verified: 0, gold: 0 },
    byConsent: { consented: 0, private: 0 },
  }
  if (!isApiConfigured()) return empty

  const units = await loadBillableUnits()
  const stats = { ...empty }
  stats.total = units.length

  for (const u of units) {
    if (u.lockStatus === 'available') stats.available++
    else if (u.lockStatus === 'locked_for_job') stats.locked++
    else if (u.lockStatus === 'delivered') stats.delivered++

    stats.byGrade[u.qualityGrade]++
    stats.byTier[u.qualityTier]++

    if (u.consentStatus === 'PUBLIC_CONSENTED') stats.byConsent.consented++
    else stats.byConsent.private++
  }

  return stats
}

function buFromRow(row: Record<string, unknown>): BillableUnit {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    minuteIndex: row.minute_index as number,
    effectiveSeconds: Number(row.effective_seconds ?? 0),
    qualityGrade: (row.quality_grade as BillableUnit['qualityGrade']) ?? 'C',
    qaScore: (row.qa_score as number) ?? 0,
    qualityTier: (row.quality_tier as BillableUnit['qualityTier']) ?? 'basic',
    labelSource: (row.label_source as BillableUnit['labelSource']) ?? null,
    hasLabels: (row.has_labels as boolean) ?? false,
    consentStatus: (row.consent_status as BillableUnit['consentStatus']) ?? 'PRIVATE',
    piiStatus: (row.pii_status as BillableUnit['piiStatus']) ?? 'CLEAR',
    lockStatus: (row.lock_status as BillableUnit['lockStatus']) ?? 'available',
    lockedByJobId: (row.locked_by_job_id as string) ?? null,
    sessionDate: (row.session_date as string) ?? '',
    userId: (row.user_id as string) ?? null,
  }
}

function buToRow(u: BillableUnit) {
  return {
    id: u.id,
    session_id: u.sessionId,
    minute_index: u.minuteIndex,
    effective_seconds: u.effectiveSeconds,
    quality_grade: u.qualityGrade,
    qa_score: u.qaScore,
    quality_tier: u.qualityTier,
    label_source: u.labelSource,
    has_labels: u.hasLabels,
    consent_status: u.consentStatus,
    pii_status: u.piiStatus,
    // lock_status / locked_by_job_id 는 전용 엔드포인트(/lock, /unlock, /mark-delivered)로만 관리.
    // upsert에 포함하면 process 후 locked BU가 available로 덮어씌워지는 버그 발생.
    session_date: u.sessionDate,
    user_id: u.userId,
  }
}

// ── Ledger Entries ──────────────────────────────────────────────────────────

export type LedgerEntryFilters = {
  userId?: string
  status?: LedgerStatus
  exportJobId?: string
  buIds?: string[]
}

export async function loadLedgerEntries(filters?: LedgerEntryFilters): Promise<LedgerEntry[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadLedgerEntriesApi(filters)
  if (error) { console.warn('loadLedgerEntries error:', error); return [] }
  return (data ?? []).map(ledgerEntryFromRow)
}

export async function upsertLedgerEntries(entries: LedgerEntry[]): Promise<void> {
  if (!isApiConfigured() || entries.length === 0) return
  const rows = entries.map(ledgerEntryToRow)
  const { error } = await AdminAPI.upsertLedgerEntriesApi(rows)
  if (error) console.warn('upsertLedgerEntries error:', error)
}

export async function updateLedgerStatus(
  entryIds: string[],
  status: LedgerStatus,
  confirmedAmount?: number,
): Promise<number> {
  if (!isApiConfigured() || entryIds.length === 0) return 0
  const { data, error } = await AdminAPI.updateLedgerStatusApi(entryIds, status, confirmedAmount)
  if (error) { console.warn('updateLedgerStatus error:', error); return 0 }
  return data?.updated ?? 0
}

/** 특정 ExportJob의 ledger entries를 confirmed로 전환 (매출 금액 비례 배분) */
export async function confirmJobLedgerEntries(
  exportJobId: string,
  totalPayment: number,
): Promise<number> {
  if (!isApiConfigured()) return 0
  const { data, error } = await AdminAPI.confirmJobLedgerEntriesApi(exportJobId, totalPayment)
  if (error) { console.warn('confirmJobLedgerEntries error:', error); return 0 }
  return data?.confirmed ?? 0
}

function ledgerEntryFromRow(row: Record<string, unknown>): LedgerEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    buId: (row.bu_id as string) ?? null,
    sessionId: (row.session_id as string) ?? null,
    ledgerType: row.ledger_type as LedgerEntry['ledgerType'],
    amountLow: (row.amount_low as number) ?? 0,
    amountHigh: (row.amount_high as number) ?? 0,
    amountConfirmed: (row.amount_confirmed as number) ?? null,
    status: (row.status as LedgerEntry['status']) ?? 'estimated',
    exportJobId: (row.export_job_id as string) ?? null,
    campaignId: (row.campaign_id as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    confirmedAt: (row.confirmed_at as string) ?? null,
    withdrawableAt: (row.withdrawable_at as string) ?? null,
    paidAt: (row.paid_at as string) ?? null,
  }
}

function ledgerEntryToRow(e: LedgerEntry) {
  return {
    id: e.id,
    user_id: e.userId,
    bu_id: e.buId,
    session_id: e.sessionId,
    ledger_type: e.ledgerType,
    amount_low: e.amountLow,
    amount_high: e.amountHigh,
    amount_confirmed: e.amountConfirmed,
    status: e.status,
    export_job_id: e.exportJobId,
    campaign_id: e.campaignId,
    metadata: e.metadata,
    created_at: e.createdAt,
    confirmed_at: e.confirmedAt,
    withdrawable_at: e.withdrawableAt,
    paid_at: e.paidAt,
  }
}

// ── Delivery Records (Per-client 납품 이력) ────────────────────────────────

export async function loadDeliveryRecords(clientId: string): Promise<DeliveryRecord[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadDeliveryRecordsApi(clientId)
  if (error) { console.warn('loadDeliveryRecords error:', error); return [] }
  return (data ?? []).map(drFromRow)
}

export async function loadDeliveredBuIdsForClient(clientId: string): Promise<Set<string>> {
  if (!isApiConfigured()) return new Set()
  const records = await loadDeliveryRecords(clientId)
  return new Set(records.map(r => r.buId))
}

export async function insertDeliveryRecords(
  buIds: string[],
  clientId: string,
  exportJobId: string,
): Promise<void> {
  if (!isApiConfigured() || buIds.length === 0) return
  const { error } = await AdminAPI.insertDeliveryRecordsApi(buIds, clientId, exportJobId)
  if (error) console.warn('insertDeliveryRecords error:', error)
}

function drFromRow(row: Record<string, unknown>): DeliveryRecord {
  return {
    id: row.id as string,
    buId: row.bu_id as string,
    clientId: row.client_id as string,
    exportJobId: row.export_job_id as string,
    deliveredAt: (row.delivered_at as string) ?? new Date().toISOString(),
  }
}

// ── Bulk Label Update ──────────────────────────────────────────────────

export async function bulkUpdateLabels(
  unitIds: string[],
  labels: Record<string, string | null>,
): Promise<number> {
  if (!isApiConfigured() || unitIds.length === 0) return 0
  const { data, error } = await AdminAPI.bulkUpdateLabelsApi(unitIds, labels)
  if (error) throw new Error(`bulkUpdateLabels: ${error}`)
  return data?.updated ?? 0
}

// ── Export Requests (Phase 1) ──────────────────────────────────────────

import type {
  ExportRequest,
  ExportPreview,
  ExportUtterance,
  SkuInventory,
} from '../types/export'

export async function previewExportRequest(id: string): Promise<ExportPreview> {
  if (!isApiConfigured()) throw new Error('API not configured')
  const { data, error } = await AdminAPI.previewExportRequestApi(id)
  if (error || !data) throw new Error(`previewExportRequest: ${error ?? 'no data'}`)
  return data
}

export async function confirmExportRequest(id: string): Promise<ExportRequest> {
  if (!isApiConfigured()) throw new Error('API not configured')
  const { data, error } = await AdminAPI.confirmExportRequestApi(id)
  if (error || !data) throw new Error(`confirmExportRequest: ${error ?? 'no data'}`)
  return data
}

export async function processExportRequest(id: string): Promise<ExportRequest> {
  if (!isApiConfigured()) throw new Error('API not configured')
  const { data, error } = await AdminAPI.processExportRequestApi(id)
  if (error || !data) throw new Error(`processExportRequest: ${error ?? 'no data'}`)
  return data
}

export async function loadExportUtterances(id: string): Promise<ExportUtterance[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadExportUtterancesApi(id)
  if (error) throw new Error(`loadExportUtterances: ${error}`)
  return data ?? []
}

export async function reviewExportUtterances(
  id: string,
  updates: Array<{ utteranceId: string; isIncluded: boolean; excludeReason?: string }>,
): Promise<AdminAPI.ReviewUtterancesResult> {
  if (!isApiConfigured()) {
    return { updated: updates.length, failed: 0, total: updates.length }
  }
  const { data, error } = await AdminAPI.reviewExportUtterancesApi(id, updates)
  if (error) throw new Error(`reviewExportUtterances: ${error}`)
  // 202 fire-and-forget: data는 { queued: true, updated: 0, failed: 0, total: N }
  return data ?? { updated: 0, failed: 0, total: updates.length }
}

/**
 * 패키징 확정 트리거 → 202 Accepted (백그라운드 실행).
 * 이미 진행 중(409)인 경우에도 throw 하지 않고 폴링으로 진행하도록 한다.
 *
 * 완료 여부는 waitForExportJobReady()로 폴링한다.
 */
export async function finalizeExportRequest(id: string): Promise<{ status: string }> {
  if (!isApiConfigured()) throw new Error('API not configured')
  const { data, error } = await AdminAPI.finalizeExportRequestApi(id)
  if (data) return { status: data.status ?? 'packaging' }
  // 409: 이미 패키징 진행 중 → 폴링으로 처리
  if (error && error.includes('이미 패키징')) return { status: 'packaging' }
  throw new Error(`finalizeExportRequest: ${error ?? 'no data'}`)
}

/**
 * export job이 ready/failed/delivered로 전환될 때까지 폴링한다.
 * @returns 최종 ExportJob (성공 시 status='ready' 또는 'delivered')
 * @throws 실패 또는 타임아웃 시
 */
export async function waitForExportJobReady(
  id: string,
  options: {
    intervalMs?: number
    timeoutMs?: number
    onProgress?: (job: ExportJob) => void
  } = {},
): Promise<ExportJob> {
  const intervalMs = options.intervalMs ?? 3000
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000 // 30분
  const startedAt = Date.now()

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('패키징이 너무 오래 걸립니다. 페이지를 새로고침해 상태를 확인해 주세요.')
    }

    const job = await getExportJob(id)
    if (!job) {
      throw new Error('작업을 찾을 수 없습니다.')
    }

    options.onProgress?.(job)

    if (job.status === 'ready' || job.status === 'delivered' || job.status === 'completed') {
      return job
    }
    if (job.status === 'failed') {
      throw new Error(job.errorMessage ?? '패키징에 실패했습니다.')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export async function downloadExportRequest(id: string): Promise<{ downloadUrl: string; expiresAt: string }> {
  if (!isApiConfigured()) throw new Error('API not configured')
  const { data, error } = await AdminAPI.downloadExportRequestApi(id)
  if (error || !data) throw new Error(`downloadExportRequest: ${error ?? 'no data'}`)
  return data
}

export async function loadSkuInventory(): Promise<SkuInventory[]> {
  if (!isApiConfigured()) return []
  const { data, error } = await AdminAPI.loadSkuInventoryApi()
  if (error) throw new Error(`loadSkuInventory: ${error}`)
  return Array.isArray(data) ? data : []
}
