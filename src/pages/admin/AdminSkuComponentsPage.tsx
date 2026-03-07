import { SKU_COMPONENT_CATALOG } from '../../types/sku'

export default function AdminSkuComponentsPage() {
  const mvp = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)
  const future = SKU_COMPONENT_CATALOG.filter(c => !c.isEnabledMvp)

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
        SKU 부가옵션 ({SKU_COMPONENT_CATALOG.length}개)
      </p>

      {/* MVP 활성 컴포넌트 */}
      <div className="space-y-2">
        {mvp.map(comp => (
          <div key={comp.id} className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#7b9aff' }}
              >
                {comp.id}
              </span>
              <span className="text-sm font-medium text-white">{comp.nameKo}</span>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{comp.descriptionKo}</p>
            {Object.keys(comp.filterCriteria).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {comp.filterCriteria.minQualityGrade && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                    등급 {comp.filterCriteria.minQualityGrade}+
                  </span>
                )}
                {comp.filterCriteria.labelSource && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                    라벨: {comp.filterCriteria.labelSource.join('/')}
                  </span>
                )}
                {comp.filterCriteria.requirePiiCleaned && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
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
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>준비 중</p>
          <div className="space-y-2 opacity-50">
            {future.map(comp => (
              <div key={comp.id} className="rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
                    {comp.id}
                  </span>
                  <span className="text-xs text-white">{comp.nameKo}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded ml-auto" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
                    coming soon
                  </span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{comp.descriptionKo}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
