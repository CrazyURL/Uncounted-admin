// ── 이벤트 유닛 엔진 (Event Unit Engine) ─────────────────────────────────────
// localStorage 컬렉터 레코드 → EventUnit[] 변환 + 집계.
// 각 레코드(2h 버킷 1건) = 1 EventUnit.

import { type SkuId } from '../types/sku'
import {
  type EventUnit,
  type EventUnitStats,
  type EventInventorySummary,
} from '../types/eventUnit'

// ── localStorage key → SKU 매핑 ────────────────────────────────────────────

const COLLECTOR_SKU_MAP: Record<string, SkuId> = {
  'uncounted_battery_records': 'U-M09',
  'uncounted_network_records': 'U-M10',
  'uncounted_screen_records': 'U-M08',
  'uncounted_motion_records': 'U-M14',
  'uncounted_light_records': 'U-M13',
  'uncounted_media_playback_records': 'U-M18',
  'uncounted_activity_state_records': 'U-M11',
  'uncounted_audio_env_records': 'U-M06',
  'uncounted_device_context_records': 'U-M05',
  'uncounted_call_time_patterns': 'U-M07',
  'uncounted_app_lifecycle_records': 'U-M16',
  'uncounted_photo_pattern_records': 'U-P01',
}

// 공통 레코드 최소 인터페이스 (모든 컬렉터가 이 필드를 가짐)
type CollectorRecord = {
  schema?: string
  pseudoId?: string
  dateBucket?: string       // YYYY-MM-DD
  timeBucket?: string       // 00-02, 02-04, ...
  eventType?: string
  [key: string]: unknown
}

// ── 수확 (harvest) ─────────────────────────────────────────────────────────

/**
 * localStorage 컬렉터 레코드 → EventUnit[] 수확.
 * 원본 데이터를 삭제하지 않음 (read-only).
 */
export function harvestEventUnits(): EventUnit[] {
  const units: EventUnit[] = []
  const now = new Date().toISOString()

  for (const [key, skuId] of Object.entries(COLLECTOR_SKU_MAP)) {
    const raw = localStorage.getItem(key)
    if (!raw) continue

    let records: CollectorRecord[]
    try {
      records = JSON.parse(raw)
      if (!Array.isArray(records)) continue
    } catch {
      continue
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      const dateBucket = r.dateBucket ?? '1970-01-01'
      const timeBucket = r.timeBucket ?? '00-02'
      const pseudoId = r.pseudoId ?? 'unknown'
      const eventType = r.eventType ?? r.schema ?? skuId

      units.push({
        id: `evt_${skuId}_${dateBucket}_${timeBucket}_${i}`,
        skuId,
        eventType: String(eventType),
        dateBucket,
        timeBucket,
        pseudoId: String(pseudoId),
        sourceKey: key,
        quality: 'good',  // 개별 레코드는 일단 good, 날짜별 커버리지로 재평가
        harvestedAt: now,
      })
    }
  }

  // 날짜별 커버리지 기반 quality 재평가
  assignQuality(units)

  return units
}

/** 날짜별 uniqueTimeBuckets 기준으로 quality 재할당 */
function assignQuality(units: EventUnit[]): void {
  // skuId+date별로 timeBucket 집합 수집
  const coverage = new Map<string, Set<string>>()
  for (const u of units) {
    const key = `${u.skuId}_${u.dateBucket}`
    const set = coverage.get(key) ?? new Set()
    set.add(u.timeBucket)
    coverage.set(key, set)
  }

  for (const u of units) {
    const key = `${u.skuId}_${u.dateBucket}`
    const buckets = coverage.get(key)?.size ?? 0
    // 12 time buckets per day (24h / 2h)
    if (buckets >= 8) u.quality = 'good'
    else if (buckets >= 4) u.quality = 'partial'
    else u.quality = 'sparse'
  }
}

// ── 집계 ────────────────────────────────────────────────────────────────────

/** EventUnit[] → SKU별 일별 집계 */
export function aggregateEventStats(units: EventUnit[]): EventUnitStats[] {
  const grouped = new Map<string, { skuId: SkuId; date: string; count: number; buckets: Set<string> }>()

  for (const u of units) {
    const key = `${u.skuId}_${u.dateBucket}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count++
      existing.buckets.add(u.timeBucket)
    } else {
      grouped.set(key, {
        skuId: u.skuId,
        date: u.dateBucket,
        count: 1,
        buckets: new Set([u.timeBucket]),
      })
    }
  }

  const stats: EventUnitStats[] = []
  for (const g of grouped.values()) {
    stats.push({
      skuId: g.skuId,
      date: g.date,
      eventCount: g.count,
      uniqueTimeBuckets: g.buckets.size,
    })
  }

  return stats.sort((a, b) => a.date.localeCompare(b.date) || a.skuId.localeCompare(b.skuId))
}

/** 전체 요약 */
export function summarizeEventInventory(units: EventUnit[]): EventInventorySummary {
  const bySkuId: Record<string, number> = {}
  let lastHarvestAt: string | null = null

  for (const u of units) {
    bySkuId[u.skuId] = (bySkuId[u.skuId] ?? 0) + 1
    if (!lastHarvestAt || u.harvestedAt > lastHarvestAt) {
      lastHarvestAt = u.harvestedAt
    }
  }

  return {
    totalEvents: units.length,
    bySkuId,
    dailyStats: aggregateEventStats(units),
    lastHarvestAt,
  }
}

/** 특정 SKU의 이벤트 수 */
export function getEventCountBySku(units: EventUnit[], skuId: SkuId): number {
  let count = 0
  for (const u of units) {
    if (u.skuId === skuId) count++
  }
  return count
}
