// ── 메타 이벤트 단위 (Event Unit) ─────────────────────────────────────────────
// 음성 BU(1 effective minute) 와 병렬인 메타 이벤트(1 collector record = 1건) 단위.
// localStorage 컬렉터 레코드 → harvestEventUnits() → EventUnit[] 변환 후 사용.

import { type SkuId } from './sku'

// ── EventUnit: 수확된 개별 이벤트 ─────────────────────────────────────────────

export type EventUnit = {
  id: string                    // evt_{skuId}_{dateBucket}_{timeBucket}_{idx}
  skuId: SkuId
  eventType: string             // collector-specific event type
  dateBucket: string            // YYYY-MM-DD
  timeBucket: string            // 00-02, 02-04, ...
  pseudoId: string              // 비식별 기기 ID
  sourceKey: string             // localStorage key
  quality: 'good' | 'partial' | 'sparse'  // 버킷 커버리지 기반
  harvestedAt: string           // ISO timestamp
}

// ── 일별 집계 ────────────────────────────────────────────────────────────────

export type EventUnitStats = {
  skuId: SkuId
  date: string                  // YYYY-MM-DD
  eventCount: number
  uniqueTimeBuckets: number     // 12개(2h × 12 = 24h) 중 몇 개 커버
}

// ── 전체 요약 ────────────────────────────────────────────────────────────────

export type EventInventorySummary = {
  totalEvents: number
  bySkuId: Record<string, number>
  dailyStats: EventUnitStats[]
  lastHarvestAt: string | null
}

// ── 메타 이벤트 정산 파라미터 ────────────────────────────────────────────────

/** 메타 이벤트 사용자 배분율 (음성 60% 대비) */
export const META_PAYOUT_RATIO = 0.40

export type MetaEventTier = 'Bronze' | 'Silver' | 'Gold' | 'Verified'

export const META_TIER_MULTIPLIER: Record<MetaEventTier, number> = {
  Bronze: 1.0,
  Silver: 1.1,
  Gold: 1.25,
  Verified: 1.4,
}
