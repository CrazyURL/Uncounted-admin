import { useEffect, useState } from 'react'
import {
  type MetadataSkuInventory,
  type MetadataSkuStats,
  type MetadataDeviceStats,
  fetchMetadataSkuStats,
} from '../../../lib/api/admin'

interface MetadataInventoryPanelProps {
  sku: MetadataSkuInventory
}

function computePeriodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return '-'
  // Monthly buckets (YYYY-MM): count months
  if (start.length === 7 && end.length === 7) {
    const [sy, sm] = start.split('-').map(Number)
    const [ey, em] = end.split('-').map(Number)
    const months = (ey - sy) * 12 + (em - sm) + 1
    return `${months}개월`
  }
  // Daily buckets (YYYY-MM-DD): count days
  const d1 = new Date(start)
  const d2 = new Date(end)
  const days = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (days <= 31) return `${days}일`
  return `${Math.round(days / 30)}개월`
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return '방금 전'
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hour}:${min}`
  } catch {
    return iso.slice(0, 16)
  }
}

function SyncStatusBadge({ status, lastSyncAt }: { status: MetadataDeviceStats['syncStatus']; lastSyncAt: string | null }) {
  const isUpToDate = status === 'up_to_date'
  const label = isUpToDate ? '최신' : (lastSyncAt ? formatRelativeTime(lastSyncAt) : '-')
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        backgroundColor: isUpToDate ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
        color: isUpToDate ? '#22c55e' : '#eab308',
      }}
    >
      {label}
    </span>
  )
}

export default function MetadataInventoryPanel({ sku }: MetadataInventoryPanelProps) {
  const [stats, setStats] = useState<MetadataSkuStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStats(null)
    setLoading(true)
    setError(null)

    let cancelled = false
    fetchMetadataSkuStats(sku.schemaId).then(({ data, error: err }) => {
      if (cancelled) return
      if (err || !data) {
        setError(err ?? '통계 조회 실패')
      } else {
        setStats(data)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [sku.schemaId])

  const skuCode = sku.schemaId.replace(/-v\d+$/, '')

  return (
    <div className="space-y-4">
      {/* Panel header */}
      <div className="flex items-center gap-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-mono font-semibold"
          style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}
        >
          {skuCode}
        </span>
        <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {sku.displayName}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-base font-bold font-mono" style={{ color: '#8b5cf6' }}>{sku.totalEvents.toLocaleString()}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>총 이벤트</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-base font-bold font-mono" style={{ color: '#22c55e' }}>{sku.deviceCount.toLocaleString()}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>디바이스</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-base font-bold font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {computePeriodLabel(sku.periodStart, sku.periodEnd)}
          </p>
          {sku.periodStart && sku.periodEnd && (
            <p className="text-[9px] mt-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {sku.periodStart} ~ {sku.periodEnd}
            </p>
          )}
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>기간</p>
        </div>
      </div>

      {/* Device sync table */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
        <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
            디바이스 동기화 현황
          </h3>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-2xl animate-spin" style={{ color: '#8b5cf6' }}>
              progress_activity
            </span>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
          </div>
        ) : !stats || stats.devices.length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <p className="text-xs">디바이스 데이터 없음</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th className="text-left p-3 font-medium text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Pseudo ID
                </th>
                <th className="text-right p-3 font-medium text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  이벤트 수
                </th>
                <th className="text-right p-3 font-medium text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  마지막 동기화
                </th>
                <th className="text-center p-3 font-medium text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  상태
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.devices.map(device => (
                <tr key={device.pseudoId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="p-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {device.pseudoId.slice(0, 8)}…
                  </td>
                  <td className="p-3 text-right font-mono text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {device.eventCount.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {formatDate(device.lastSyncAt)}
                  </td>
                  <td className="p-3 text-center">
                    <SyncStatusBadge status={device.syncStatus} lastSyncAt={device.lastSyncAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 히트맵+분포+샘플은 이벤트 프리뷰 단계(Step 3m)에서 표시 */}
    </div>
  )
}
