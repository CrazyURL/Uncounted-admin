import { type SkuInventory } from '../../types/export'

type Props = {
  inventory: SkuInventory
  skuName?: string
  selected: boolean
  onClick: () => void
}

function hoursColor(hours: number): string {
  if (hours >= 3) return '#22c55e'
  if (hours >= 1) return '#eab308'
  return '#ef4444'
}

export default function SkuInventoryCard({ inventory, skuName, selected, onClick }: Props) {
  const hColor = hoursColor(inventory.availableHours)

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl transition-colors"
      style={{
        backgroundColor: selected ? 'rgba(19,55,236,0.15)' : '#1b1e2e',
        borderWidth: 1,
        borderColor: selected ? '#1337ec' : 'transparent',
      }}
    >
      {/* SKU ID badge */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-sm font-bold"
          style={{ color: '#1337ec' }}
        >
          {inventory.skuId}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${hColor}20`, color: hColor }}
        >
          {inventory.availableHours.toFixed(1)}h 가용
        </span>
      </div>

      {/* SKU name */}
      {skuName && (
        <p className="text-xs text-white mb-2">{skuName}</p>
      )}

      {/* Quality distribution bar */}
      {Object.keys(inventory.qualityDistribution).length > 0 && (
        <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-2">
          {(['A', 'B', 'C'] as const).map(g => {
            const count = inventory.qualityDistribution[g] ?? 0
            const pct = inventory.availableBUs > 0 ? (count / inventory.availableBUs) * 100 : 0
            if (pct === 0) return null
            return (
              <div
                key={g}
                className="h-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#6b7280',
                }}
              />
            )
          })}
        </div>
      )}

      {/* Bottom stats */}
      <div className="flex items-center gap-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span>{inventory.availableBUs.toLocaleString()} BU</span>
        <span>화자 {inventory.speakerCount}명</span>
        {inventory.labelCoverage > 0 && (
          <span>라벨 {(inventory.labelCoverage * 100).toFixed(0)}%</span>
        )}
      </div>
    </button>
  )
}
