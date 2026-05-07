import { SKU_COMPONENT_CATALOG } from '../../types/sku'

export default function AdminSkuComponentsPage() {
  const mvp = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)
  const future = SKU_COMPONENT_CATALOG.filter(c => !c.isEnabledMvp)

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        SKU 부가옵션 ({SKU_COMPONENT_CATALOG.length}개)
      </p>

      {/* MVP 활성 컴포넌트 */}
      <div className="space-y-2">
        {mvp.map(comp => (
          <div key={comp.id} className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#7b9aff' }}
              >
                {comp.id}
              </span>
              <span className="text-sm font-medium text-txt">{comp.nameKo}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{comp.descriptionKo}</p>
            {Object.keys(comp.filterCriteria).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {comp.filterCriteria.minQualityGrade && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)' }}>
                    등급 {comp.filterCriteria.minQualityGrade}+
                  </span>
                )}
                {comp.filterCriteria.labelSource && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)' }}>
                    라벨: {comp.filterCriteria.labelSource.join('/')}
                  </span>
                )}
                {comp.filterCriteria.requirePiiCleaned && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)' }}>
                    PII 정제 필수
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 비활성 컴포넌트 */}
      {future.length > 0 && (
        <>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>준비 중</p>
          <div className="space-y-2 opacity-50">
            {future.map(comp => (
              <div key={comp.id} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-tertiary)' }}>
                    {comp.id}
                  </span>
                  <span className="text-xs text-txt">{comp.nameKo}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded ml-auto" style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-tertiary)' }}>
                    coming soon
                  </span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{comp.descriptionKo}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
