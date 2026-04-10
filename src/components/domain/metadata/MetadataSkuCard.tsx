import type { MetadataSkuInventory } from '../../../lib/api/admin'

interface MetadataSkuCardProps {
  sku: MetadataSkuInventory
  selected: boolean
  onToggle: (schemaId: string) => void
}

function getEventBadgeColor(count: number): { bg: string; text: string } {
  if (count >= 500) return { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' }
  if (count >= 100) return { bg: 'rgba(234,179,8,0.15)', text: '#eab308' }
  return { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' }
}

export default function MetadataSkuCard({ sku, selected, onToggle }: MetadataSkuCardProps) {
  const badge = getEventBadgeColor(sku.totalEvents)
  const skuCode = sku.schemaId.replace(/-v\d+$/, '')

  return (
    <button
      type="button"
      onClick={() => onToggle(sku.schemaId)}
      className="w-full text-left rounded-xl p-4 transition-all"
      style={{
        backgroundColor: selected ? 'rgba(139,92,246,0.08)' : '#1b1e2e',
        border: selected
          ? '2px solid rgba(139,92,246,0.5)'
          : '2px solid transparent',
        outline: 'none',
      }}
    >
      {/* Header: SKU code + selection indicator */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-mono font-semibold"
          style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}
        >
          {skuCode}
        </span>
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: selected ? '#8b5cf6' : 'rgba(255,255,255,0.08)',
            border: selected ? 'none' : '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {selected && (
            <span className="material-symbols-outlined text-white text-sm">check</span>
          )}
        </div>
      </div>

      {/* Display name */}
      <p
        className="text-sm font-medium mb-3 truncate"
        style={{ color: 'rgba(255,255,255,0.85)' }}
      >
        {sku.displayName}
      </p>

      {/* Stats row: events + devices */}
      <div className="flex items-center gap-3">
        <span
          className="px-2 py-0.5 rounded-md text-xs font-mono font-medium"
          style={{ backgroundColor: badge.bg, color: badge.text }}
        >
          {sku.totalEvents.toLocaleString()} events
        </span>
        <span
          className="text-xs font-mono"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          <span className="material-symbols-outlined text-xs align-middle mr-0.5">
            devices
          </span>
          {sku.deviceCount.toLocaleString()}
        </span>
      </div>
    </button>
  )
}
