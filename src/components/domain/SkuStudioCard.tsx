import { type SkuId, type SkuStudioEntry } from '../../types/sku'

type Props = {
  entry: SkuStudioEntry
  onBuild: (skuId: SkuId) => void
  onCustomize: (skuId: SkuId) => void
}

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#f59e0b',
  C: '#ef4444',
}

const CATEGORY_COLORS: Record<string, string> = {
  voice: 'var(--color-accent)',
  metadata: '#f59e0b',
}

export default function SkuStudioCard({ entry, onBuild, onCustomize }: Props) {
  const { definition: def, matchCount, totalHours, labelCoverage, qualityBreakdown } = entry
  const totalQuality = qualityBreakdown.A + qualityBreakdown.B + qualityBreakdown.C

  return (
    <div
      className="rounded-xl p-3 space-y-3"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${CATEGORY_COLORS[def.category]}20`, color: CATEGORY_COLORS[def.category] }}
          >
            {def.id}
          </span>
          <span className="text-xs font-medium text-txt">{def.nameKo}</span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: matchCount > 0 ? 'rgba(19,55,236,0.15)' : 'var(--color-surface-alt)',
            color: matchCount > 0 ? '#7b9aff' : 'var(--color-text-tertiary)',
          }}
        >
          {matchCount}건
        </span>
      </div>

      {/* 스탯 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>매칭</p>
          <p className="text-sm font-medium text-txt">{matchCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>총 시간</p>
          <p className="text-sm font-medium text-txt">{totalHours.toFixed(1)}h</p>
        </div>
        <div>
          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>라벨률</p>
          <p className="text-sm font-medium text-txt">{Math.round(labelCoverage * 100)}%</p>
        </div>
      </div>

      {/* 품질 미니바 */}
      {totalQuality > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
          {(['A', 'B', 'C'] as const).map(g => {
            const pct = (qualityBreakdown[g] / totalQuality) * 100
            if (pct === 0) return null
            return (
              <div
                key={g}
                style={{ width: `${pct}%`, backgroundColor: GRADE_COLORS[g] }}
                title={`${g}: ${qualityBreakdown[g]}건 (${Math.round(pct)}%)`}
              />
            )
          })}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => onBuild(def.id)}
          disabled={matchCount === 0}
          className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: matchCount > 0 ? 'var(--color-accent)' : 'var(--color-surface-alt)',
            color: matchCount > 0 ? 'white' : 'var(--color-border)',
          }}
        >
          빌드
        </button>
        <button
          onClick={() => onCustomize(def.id)}
          className="flex-1 py-1.5 text-xs font-medium rounded-lg"
          style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)' }}
        >
          설정
        </button>
      </div>
    </div>
  )
}
