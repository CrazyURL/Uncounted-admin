import { useEffect, useState } from 'react'
import {
  type MetadataSkuInventory,
  type MetadataSkuStats,
  fetchMetadataInventory,
  fetchMetadataSkuStats,
} from '../../../lib/api/admin'
import type { MetadataFilterState } from './MetadataQualityFilter'
import MetadataInventoryPanel from './MetadataInventoryPanel'
import MetadataQualityFilter from './MetadataQualityFilter'
import MetadataEventPreview from './MetadataEventPreview'

// ── Step 2m: 재고 + 필터 ────────────────────────────────────────────

export interface MetadataStepInventoryProps {
  selectedSkuId: string
  metaSkus: MetadataSkuInventory[]
  setMetaSkus: (skus: MetadataSkuInventory[]) => void
  selectedMetaSkuIds: Set<string>
  setSelectedMetaSkuIds: (ids: Set<string>) => void
  setMetaFilter: (f: MetadataFilterState) => void
  metaStatsCache: Record<string, MetadataSkuStats>
  setMetaStatsCache: (c: Record<string, MetadataSkuStats>) => void
  metaInventoryLoaded: boolean
  setMetaInventoryLoaded: (v: boolean) => void
}

export function MetadataStepInventory({
  selectedSkuId,
  metaSkus,
  setMetaSkus,
  selectedMetaSkuIds,
  setSelectedMetaSkuIds,
  setMetaFilter,
  metaStatsCache,
  setMetaStatsCache,
  metaInventoryLoaded,
  setMetaInventoryLoaded,
}: MetadataStepInventoryProps) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (metaInventoryLoaded) return
    setLoading(true)
    fetchMetadataInventory().then(({ data }) => {
      if (data?.skus) {
        setMetaSkus(data.skus)
        const schemaId = data.skus.find((s: MetadataSkuInventory) => s.schemaId.startsWith(selectedSkuId))?.schemaId
        if (schemaId) {
          setSelectedMetaSkuIds(new Set([schemaId]))
        }
      }
      setMetaInventoryLoaded(true)
      setLoading(false)
    })
  }, [metaInventoryLoaded, selectedSkuId])

  useEffect(() => {
    const idsToFetch = [...selectedMetaSkuIds].filter(id => !metaStatsCache[id])
    for (const schemaId of idsToFetch) {
      fetchMetadataSkuStats(schemaId).then(({ data }) => {
        if (data) {
          setMetaStatsCache({ ...metaStatsCache, [schemaId]: data })
        }
      })
    }
  }, [selectedMetaSkuIds])

  const selectSku = (schemaId: string) => {
    // 단일 선택: 같은 SKU 클릭 시 해제, 다른 SKU 클릭 시 교체
    const current = [...selectedMetaSkuIds][0]
    if (current === schemaId) {
      setSelectedMetaSkuIds(new Set())
    } else {
      setSelectedMetaSkuIds(new Set([schemaId]))
    }
  }

  const selectedSchemaId = [...selectedMetaSkuIds][0] ?? null

  const selectedDevices = selectedSchemaId
    ? (metaStatsCache[selectedSchemaId]?.devices ?? []).map((d: MetadataSkuStats['devices'][number]) => ({ ...d, syncStatus: d.syncStatus as string }))
    : []

  const totalEvents = selectedSchemaId
    ? (metaSkus.find(s => s.schemaId === selectedSchemaId)?.totalEvents ?? 0)
    : 0

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
        <p className="text-xs mt-2">메타데이터 인벤토리 로딩 중...</p>
      </div>
    )
  }

  const focusedSku = selectedSchemaId ? metaSkus.find(s => s.schemaId === selectedSchemaId) : null

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>메타데이터 SKU 선택</p>

      <div className="grid grid-cols-2 gap-2">
        {metaSkus.map(sku => {
          const selected = selectedSchemaId === sku.schemaId
          const skuCode = sku.schemaId.replace(/-v\d+$/, '')
          return (
            <button
              key={sku.schemaId}
              onClick={() => selectSku(sku.schemaId)}
              className="text-left p-3 rounded-xl transition-colors"
              style={{
                backgroundColor: selected ? 'rgba(139,92,246,0.12)' : '#1b1e2e',
                border: selected ? '2px solid rgba(139,92,246,0.5)' : '2px solid transparent',
              }}
            >
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}
              >
                {skuCode}
              </span>
              <p className="text-xs text-white mt-1">{sku.displayName}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {sku.totalEvents.toLocaleString()} events · {sku.deviceCount} devices
              </p>
            </button>
          )
        })}
      </div>

      {focusedSku && <MetadataInventoryPanel sku={focusedSku} />}

      {selectedSchemaId && (
        <MetadataQualityFilter
          schemaId={selectedSchemaId}
          availableDevices={selectedDevices}
          totalEvents={totalEvents}
          onFilterChange={setMetaFilter}
        />
      )}
    </div>
  )
}

// ── Step 3m: 이벤트 프리뷰 ──────────────────────────────────────────

export interface MetadataStepPreviewProps {
  schemaId: string
  metaStatsCache: Record<string, MetadataSkuStats>
  filters?: {
    dateFrom?: string
    dateTo?: string
    pseudoId?: string
    excludeSparse?: boolean
  }
}

export function MetadataStepPreview({ schemaId, metaStatsCache, filters }: MetadataStepPreviewProps) {
  const stats = metaStatsCache[schemaId]

  // Map wizard filter state to preview API query params
  const previewFilters = filters ? {
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    pseudoId: filters.pseudoId || undefined,
  } : undefined

  return (
    <div className="space-y-4">
      <MetadataEventPreview
        key={`${schemaId}-${JSON.stringify(previewFilters)}`}
        schemaId={schemaId}
        heatmap={stats?.heatmap ?? []}
        filters={previewFilters}
      />
    </div>
  )
}
