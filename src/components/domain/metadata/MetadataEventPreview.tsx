import { useEffect, useState } from 'react'
import {
  type MetadataPreviewResult,
  type MetadataPreviewQuery,
  fetchMetadataPreview,
} from '../../../lib/api/admin'
import MetadataHeatmap from './MetadataHeatmap'
import MetadataDistributionChart from './MetadataDistributionChart'

interface MetadataEventPreviewProps {
  schemaId: string
  heatmap: Array<{ dateBucket: string; timeBucket: string; count: number }>
  filters?: {
    quality?: string
    dateFrom?: string
    dateTo?: string
    pseudoId?: string
  }
}

const SAMPLE_LIMIT = 20

/** SKU별 샘플 테이블 컬럼 (기획서 섹션 4 Step 3) */
const SKU_DISPLAY_FIELDS: Record<string, string[]> = {
  'U-M01': ['pseudoId', 'dateBucket', 'timeBucket', 'callType', 'durationBucket', 'count'],
  'U-M07': ['pseudoId', 'dateBucket', 'dayOfWeek', 'timeBucket', 'callFrequencyBucket', 'incomingRatio'],
  'U-M08': ['pseudoId', 'dateBucket', 'timeBucket', 'sessionCount', 'frequencyBucket', 'avgLengthBucket'],
  'U-M09': ['pseudoId', 'dateBucket', 'timeBucket', 'eventType', 'batteryLevelBucket', 'chargingSpeedBucket'],
  'U-M10': ['pseudoId', 'dateBucket', 'timeBucket', 'fromNetwork', 'toNetwork', 'transitionCount'],
  'U-M11': ['pseudoId', 'dateBucket', 'timeBucket', 'dominantActivity', 'transitionCount'],
}
const DEFAULT_FIELDS = ['pseudoId', 'dateBucket', 'timeBucket']

function getDisplayFields(schemaId: string): string[] {
  const skuCode = schemaId.replace(/-v\d+$/, '')
  return SKU_DISPLAY_FIELDS[skuCode] ?? DEFAULT_FIELDS
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Build heatmap from preview events — reflects current filters */
function buildHeatmapFromEvents(
  events: Array<Record<string, unknown>>,
  schemaId: string,
): Array<{ dateBucket: string; timeBucket: string; count: number }> {
  if (events.length === 0) return []

  const isMonthly = schemaId.startsWith('U-M01')
  const heatMap = new Map<string, number>()

  for (const ev of events) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>
    const timeBucket = String(payload.timeBucket ?? '')
    if (!timeBucket) continue

    let rowKey: string
    if (isMonthly) {
      rowKey = String(ev.date_bucket ?? '')
    } else {
      // Use payload dayOfWeek or derive from date
      const dow = payload.dayOfWeek as string | undefined
      if (dow) {
        rowKey = dow
      } else {
        const dateBucket = String(ev.date_bucket ?? '')
        if (dateBucket.length >= 10) {
          const d = new Date(dateBucket + 'T00:00:00')
          rowKey = isNaN(d.getTime()) ? 'unknown' : DAY_NAMES[d.getDay()]
        } else {
          rowKey = 'unknown'
        }
      }
    }

    const key = `${rowKey}|${timeBucket}`
    heatMap.set(key, (heatMap.get(key) ?? 0) + 1)
  }

  return Array.from(heatMap.entries()).map(([key, count]) => {
    const [dateBucket, timeBucket] = key.split('|')
    return { dateBucket, timeBucket, count }
  })
}

export default function MetadataEventPreview({
  schemaId,
  heatmap,
  filters,
}: MetadataEventPreviewProps) {
  const [preview, setPreview] = useState<MetadataPreviewResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const query: MetadataPreviewQuery = {
      limit: SAMPLE_LIMIT,
      offset: 0,
      ...filters,
    }

    fetchMetadataPreview(schemaId, query).then(({ data, error: err }) => {
      if (err || !data) {
        setError(err ?? '프리뷰 조회 실패')
      } else {
        setPreview(data)
      }
      setLoading(false)
    })
  }, [schemaId, filters?.dateFrom, filters?.dateTo, filters?.pseudoId, filters?.quality])

  if (loading) {
    return (
      <div className="text-center py-8">
        <span className="material-symbols-outlined text-2xl animate-spin" style={{ color: '#8b5cf6' }}>
          progress_activity
        </span>
        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>프리뷰 로딩 중...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
        <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
      </div>
    )
  }

  if (!preview) return null

  const { events, fieldDistributions } = preview
  const displayFields = getDisplayFields(schemaId)

  // 필터가 적용된 경우: preview events로 히트맵 계산 (0건이면 빈 히트맵)
  // 필터 없는 경우: stats heatmap 사용
  const hasFilters = filters && (filters.dateFrom || filters.dateTo || filters.pseudoId || filters.quality)
  const heatmapData = hasFilters
    ? buildHeatmapFromEvents(events, schemaId)
    : heatmap

  // Render all available distributions dynamically
  const distEntries = Object.entries(fieldDistributions).filter(([, v]) => Object.keys(v).length > 0)

  return (
    <div className="space-y-4">
      {/* Heatmap */}
      <MetadataHeatmap data={heatmapData} />

      {/* Distribution charts — dynamic per SKU */}
      {distEntries.map(([key, dist]) => (
        <MetadataDistributionChart
          key={key}
          title={`${key} 분포`}
          distribution={dist}
        />
      ))}

      {/* Sample event table — columns per SKU */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
            샘플 이벤트
          </h3>
          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {events.length} / {preview.total.toLocaleString()}건
          </span>
        </div>

        {events.length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <p className="text-xs">이벤트 없음</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {displayFields.map(field => (
                    <th
                      key={field}
                      className="text-left p-2 font-medium text-[10px] whitespace-nowrap"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev: Record<string, unknown>, idx: number) => {
                  const payload = (ev.payload ?? {}) as Record<string, unknown>
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {displayFields.map(field => {
                        // pseudoId는 top-level, 나머지는 payload 안
                        const value = field === 'pseudoId'
                          ? ev.pseudo_id
                          : field === 'dateBucket'
                            ? ev.date_bucket
                            : payload[field]
                        return (
                          <td
                            key={field}
                            className="p-2 font-mono text-[11px] whitespace-nowrap"
                            style={{ color: 'rgba(255,255,255,0.6)' }}
                          >
                            {value != null ? String(value) : '-'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
