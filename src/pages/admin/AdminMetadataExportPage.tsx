import { useEffect, useState, useRef, useCallback } from 'react'
import {
  type MetadataSkuInventory,
  type MetadataSkuStats,
  fetchMetadataInventory,
  fetchMetadataSkuStats,
} from '../../lib/api/admin'
import MetadataSkuCard from '../../components/domain/metadata/MetadataSkuCard'
import MetadataInventoryPanel from '../../components/domain/metadata/MetadataInventoryPanel'
import MetadataQualityFilter, {
  type MetadataFilterState,
} from '../../components/domain/metadata/MetadataQualityFilter'
import MetadataExportConfirm from '../../components/domain/metadata/MetadataExportConfirm'

export default function AdminMetadataExportPage() {
  const [skus, setSkus] = useState<MetadataSkuInventory[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [focusedSkuId, setFocusedSkuId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MetadataFilterState>({
    excludeSparse: false,
    excludeStaleDevices: false,
    dateFrom: '',
    dateTo: '',
    selectedPseudoIds: [],
  })
  const [statsCache, setStatsCache] = useState<Record<string, MetadataSkuStats>>({})
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    fetchMetadataInventory().then(({ data, error: err }) => {
      if (err || !data) {
        setError(err ?? '인벤토리 조회 실패')
      } else {
        setSkus(data.skus)
      }
      setLoading(false)
    })
  }, [])

  // Fetch stats for selected SKUs to get device info for filters
  useEffect(() => {
    const idsToFetch = [...selectedIds].filter(id => !statsCache[id])
    if (idsToFetch.length === 0) return

    idsToFetch.forEach(schemaId => {
      fetchMetadataSkuStats(schemaId).then(({ data }) => {
        if (data) {
          setStatsCache(prev => ({ ...prev, [schemaId]: data }))
        }
      })
    })
  }, [selectedIds, statsCache])

  const handleFilterChange = useCallback((f: MetadataFilterState) => {
    setFilter(f)
  }, [])

  const handleToggle = useCallback((schemaId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(schemaId)) {
        next.delete(schemaId)
      } else {
        next.add(schemaId)
      }
      return next
    })
    setFocusedSkuId(schemaId)
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === skus.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(skus.map(s => s.schemaId)))
    }
  }, [selectedIds.size, skus])

  const totalEvents = skus
    .filter(s => selectedIds.has(s.schemaId))
    .reduce((sum, s) => sum + s.totalEvents, 0)

  const focusedSku = focusedSkuId
    ? skus.find(s => s.schemaId === focusedSkuId) ?? null
    : null

  // Aggregate devices from all selected SKUs for filter panel
  const selectedDevices = [...selectedIds].flatMap(id => {
    const stats = statsCache[id]
    return stats ? stats.devices.map(d => ({ ...d, syncStatus: d.syncStatus as string })) : []
  })

  // Compute period from selected SKUs
  const selectedSkuList = skus.filter(s => selectedIds.has(s.schemaId))
  const selectedPeriod = (() => {
    const starts = selectedSkuList.map(s => s.periodStart).filter(Boolean) as string[]
    const ends = selectedSkuList.map(s => s.periodEnd).filter(Boolean) as string[]
    if (starts.length === 0 || ends.length === 0) return ''
    const minStart = starts.sort()[0]
    const maxEnd = ends.sort().reverse()[0]
    return `${minStart.slice(5, 10)} ~ ${maxEnd.slice(5, 10)}`
  })()

  if (error && skus.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-sm font-semibold"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            메타데이터 추출
          </h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            SKU를 선택하여 납품 데이터를 구성하세요
          </p>
        </div>

        {skus.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                selectedIds.size === skus.length
                  ? 'rgba(139,92,246,0.2)'
                  : 'rgba(255,255,255,0.06)',
              color:
                selectedIds.size === skus.length
                  ? '#8b5cf6'
                  : 'rgba(255,255,255,0.5)',
            }}
          >
            {selectedIds.size === skus.length ? '전체 해제' : '전체 선택'}
          </button>
        )}
      </div>

      {/* Selection summary */}
      {selectedIds.size > 0 && (
        <div
          className="rounded-xl p-3 flex items-center justify-between"
          style={{
            backgroundColor: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.2)',
          }}
        >
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span className="font-semibold" style={{ color: '#8b5cf6' }}>
              {selectedIds.size}
            </span>
            개 SKU 선택됨 ·{' '}
            <span className="font-mono">
              {totalEvents.toLocaleString()} events
            </span>
          </span>
        </div>
      )}

      {/* SKU Card Grid */}
      {loading ? (
        <div
          className="text-center py-12"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <span className="material-symbols-outlined text-3xl animate-spin">
            progress_activity
          </span>
          <p className="text-xs mt-2">인벤토리 로딩 중...</p>
        </div>
      ) : skus.length === 0 ? (
        <div
          className="text-center py-12"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <span className="material-symbols-outlined text-4xl">
            inventory_2
          </span>
          <p className="text-sm mt-2">등록된 SKU가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {skus.map(sku => (
            <MetadataSkuCard
              key={sku.schemaId}
              sku={sku}
              selected={selectedIds.has(sku.schemaId)}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Inventory detail panel for focused SKU */}
      {focusedSku && (
        <MetadataInventoryPanel sku={focusedSku} />
      )}

      {/* Quality filter + Export confirm */}
      {selectedIds.size > 0 && (
        <>
          <MetadataQualityFilter
            availableDevices={selectedDevices}
            totalEvents={totalEvents}
            onFilterChange={handleFilterChange}
          />

          <MetadataExportConfirm
            selectedSchemaIds={[...selectedIds]}
            filter={filter}
            totalEvents={totalEvents}
            deviceCount={selectedDevices.length}
            period={selectedPeriod}
          />
        </>
      )}
    </div>
  )
}
