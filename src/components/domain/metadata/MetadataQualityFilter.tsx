import { useState, useEffect, useRef } from 'react'
import { fetchMetadataPreview } from '../../../lib/api/admin'

export interface MetadataFilterState {
  excludeSparse: boolean
  excludeStaleDevices: boolean
  dateFrom: string
  dateTo: string
  selectedPseudoIds: string[]
}

interface MetadataQualityFilterProps {
  schemaId?: string
  availableDevices: Array<{ pseudoId: string; eventCount: number; syncStatus: string }>
  totalEvents: number
  onFilterChange: (filter: MetadataFilterState) => void
}

const DEFAULT_FILTER: MetadataFilterState = {
  excludeSparse: false,
  excludeStaleDevices: false,
  dateFrom: '',
  dateTo: '',
  selectedPseudoIds: [],
}

function estimateExcluded(
  filter: MetadataFilterState,
  devices: MetadataQualityFilterProps['availableDevices'],
  totalEvents: number,
): { included: number; excluded: number } {
  let excludedDeviceEvents = 0

  for (const device of devices) {
    const isStale = device.syncStatus === 'stale'
    const isSparse = device.eventCount < 10

    const deviceSelected =
      filter.selectedPseudoIds.length === 0 ||
      filter.selectedPseudoIds.includes(device.pseudoId)

    if (!deviceSelected) {
      excludedDeviceEvents += device.eventCount
      continue
    }

    if (filter.excludeStaleDevices && isStale) {
      excludedDeviceEvents += device.eventCount
    } else if (filter.excludeSparse && isSparse) {
      excludedDeviceEvents += device.eventCount
    }
  }

  const excluded = Math.min(excludedDeviceEvents, totalEvents)
  return { included: totalEvents - excluded, excluded }
}

export default function MetadataQualityFilter({
  schemaId,
  availableDevices,
  totalEvents,
  onFilterChange,
}: MetadataQualityFilterProps) {
  const [filter, setFilter] = useState<MetadataFilterState>(DEFAULT_FILTER)
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false)
  const [serverTotal, setServerTotal] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!deviceDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDeviceDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [deviceDropdownOpen])

  useEffect(() => {
    onFilterChange(filter)
  }, [filter, onFilterChange])

  // 날짜/디바이스 필터 변경 시 preview API로 실제 카운트 조회 (300ms 디바운스)
  useEffect(() => {
    if (!schemaId) { setServerTotal(null); return }
    const hasActiveFilter = filter.dateFrom || filter.dateTo || filter.selectedPseudoIds.length > 0

    if (!hasActiveFilter) {
      setServerTotal(null)
      return
    }

    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(() => {
      fetchMetadataPreview(schemaId, {
        limit: 1,
        offset: 0,
        dateFrom: filter.dateFrom || undefined,
        dateTo: filter.dateTo || undefined,
        pseudoId: filter.selectedPseudoIds[0] || undefined,
      }).then(({ data }) => {
        if (data) setServerTotal(data.total)
      })
    }, 300)

    return () => { if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current) }
  }, [schemaId, filter.dateFrom, filter.dateTo, filter.selectedPseudoIds])

  // 서버 카운트가 있으면 사용, 없으면 클라이언트 추정
  const clientEstimate = estimateExcluded(filter, availableDevices, totalEvents)
  const included = serverTotal !== null ? serverTotal : clientEstimate.included
  const excluded = serverTotal !== null ? (totalEvents - serverTotal) : clientEstimate.excluded

  const updateFilter = (patch: Partial<MetadataFilterState>) => {
    setFilter(prev => ({ ...prev, ...patch }))
  }

  const toggleDevice = (pseudoId: string) => {
    setFilter(prev => {
      const has = prev.selectedPseudoIds.includes(pseudoId)
      return {
        ...prev,
        selectedPseudoIds: has
          ? prev.selectedPseudoIds.filter(id => id !== pseudoId)
          : [...prev.selectedPseudoIds, pseudoId],
      }
    })
  }

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text-sub)' }}>
        검수 필터
      </h3>

      {/* Toggle filters */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filter.excludeSparse}
            onChange={e => updateFilter({ excludeSparse: e.target.checked })}
            className="rounded accent-purple-500"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
            sparse 이벤트 제외
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            (이벤트 10건 미만 디바이스)
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filter.excludeStaleDevices}
            onChange={e => updateFilter({ excludeStaleDevices: e.target.checked })}
            className="rounded accent-purple-500"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
            동기화 지연 디바이스 제외
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            (stale 상태)
          </span>
        </label>
      </div>

      {/* Date range (month picker — compatible with both YYYY-MM and YYYY-MM-DD buckets) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            시작월
          </label>
          <input
            type="month"
            value={filter.dateFrom}
            onChange={e => updateFilter({ dateFrom: e.target.value })}
            className="w-full rounded-lg px-2 py-1.5 text-xs font-mono"
            style={{
              backgroundColor: 'var(--color-surface-alt)',
              color: 'var(--color-text-sub)',
              border: '1px solid var(--color-border-light)',
            }}
          />
        </div>
        <div>
          <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            종료월
          </label>
          <input
            type="month"
            value={filter.dateTo}
            onChange={e => updateFilter({ dateTo: e.target.value })}
            className="w-full rounded-lg px-2 py-1.5 text-xs font-mono"
            style={{
              backgroundColor: 'var(--color-surface-alt)',
              color: 'var(--color-text-sub)',
              border: '1px solid var(--color-border-light)',
            }}
          />
        </div>
      </div>

      {/* Device selector */}
      {availableDevices.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <label className="text-[10px] block mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            디바이스 선택
          </label>
          <button
            onClick={() => setDeviceDropdownOpen(prev => !prev)}
            className="w-full rounded-lg px-2 py-1.5 text-xs text-left flex items-center justify-between"
            style={{
              backgroundColor: 'var(--color-surface-alt)',
              color: 'var(--color-text-sub)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            <span className="font-mono">
              {filter.selectedPseudoIds.length === 0
                ? `전체 (${availableDevices.length}개)`
                : `${filter.selectedPseudoIds.length}개 선택`}
            </span>
            <span
              className="material-symbols-outlined text-sm transition-transform"
              style={{
                color: 'var(--color-text-tertiary)',
                transform: deviceDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              expand_more
            </span>
          </button>

          {deviceDropdownOpen && (
            <div
              className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden shadow-lg"
              style={{
                backgroundColor: '#252838',
                border: '1px solid var(--color-border-light)',
                maxHeight: '160px',
                overflowY: 'auto',
              }}
            >
              {availableDevices.map(device => {
                const isSelected =
                  filter.selectedPseudoIds.length === 0 ||
                  filter.selectedPseudoIds.includes(device.pseudoId)
                return (
                  <button
                    key={device.pseudoId}
                    onClick={() => toggleDevice(device.pseudoId)}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-sub)' }}>
                      {device.pseudoId.slice(0, 8)}…
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                        {device.eventCount.toLocaleString()}건
                      </span>
                      {isSelected && (
                        <span className="material-symbols-outlined text-sm" style={{ color: '#8b5cf6' }}>
                          check
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Included / Excluded count */}
      <div
        className="rounded-lg p-2 flex items-center justify-between"
        style={{ backgroundColor: 'var(--color-surface-alt)' }}
      >
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-sm font-bold font-mono" style={{ color: '#22c55e' }}>
              {included.toLocaleString()}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>포함</p>
          </div>
          <div
            className="w-px h-6"
            style={{ backgroundColor: 'var(--color-border-light)' }}
          />
          <div className="text-center">
            <p className="text-sm font-bold font-mono" style={{ color: '#ef4444' }}>
              {excluded.toLocaleString()}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>제외</p>
          </div>
        </div>
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          {totalEvents > 0 ? Math.round((included / totalEvents) * 100) : 0}% 포함
        </span>
      </div>
    </div>
  )
}
