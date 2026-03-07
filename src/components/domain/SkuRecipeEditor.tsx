import { useState, useMemo } from 'react'
import { type SkuRecipe, type SkuRecipeFilters, SKU_CATALOG } from '../../types/sku'
import { type ExportFieldGroup } from '../../types/dataset'
import { LABEL_FIELDS } from '../../lib/adminHelpers'
import { DOMAIN_OPTIONS } from '../../lib/labelOptions'
import { EXPORT_FIELD_CATALOG, FIELD_GROUP_LABELS } from '../../lib/exportFields'

type Props = {
  isOpen: boolean
  recipe: SkuRecipe
  onSave: (recipe: SkuRecipe) => void
  onReset: () => void
  onClose: () => void
}

const QUALITY_OPTIONS = [
  { value: null, label: '없음' },
  { value: 'C' as const, label: 'C 이상' },
  { value: 'B' as const, label: 'B 이상' },
  { value: 'A' as const, label: 'A만' },
]

export default function SkuRecipeEditor({ isOpen, recipe, onSave, onReset, onClose }: Props) {
  const [filters, setFilters] = useState<SkuRecipeFilters>(() => ({ ...recipe.filters }))
  const [exportFields, setExportFields] = useState<Set<string>>(() => new Set(recipe.exportFields))
  const [preferredFormat, setPreferredFormat] = useState(recipe.preferredFormat)

  const skuDef = SKU_CATALOG.find(s => s.id === recipe.skuId)

  const fieldGroups = useMemo(() => {
    const groups = new Map<ExportFieldGroup, typeof EXPORT_FIELD_CATALOG>()
    for (const f of EXPORT_FIELD_CATALOG) {
      const arr = groups.get(f.group) ?? []
      arr.push(f)
      groups.set(f.group, arr)
    }
    return groups
  }, [])

  // requireLabels의 현재 모드 판정
  const labelMode: 'none' | 'any' | 'specific' =
    filters.requireLabels === false ? 'none' :
    filters.requireLabels === true ? 'any' : 'specific'

  const specificLabelFields = Array.isArray(filters.requireLabels) ? filters.requireLabels : []

  function updateFilter<K extends keyof SkuRecipeFilters>(key: K, value: SkuRecipeFilters[K]) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function toggleDomain(d: string) {
    setFilters(prev => {
      const arr = prev.domainFilter.includes(d)
        ? prev.domainFilter.filter(x => x !== d)
        : [...prev.domainFilter, d]
      return { ...prev, domainFilter: arr }
    })
  }

  function toggleExportField(key: string) {
    setExportFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setLabelMode(mode: 'none' | 'any' | 'specific') {
    if (mode === 'none') updateFilter('requireLabels', false)
    else if (mode === 'any') updateFilter('requireLabels', true)
    else updateFilter('requireLabels', [])
  }

  function toggleSpecificLabelField(fieldKey: string) {
    const current = Array.isArray(filters.requireLabels) ? [...filters.requireLabels] : []
    const idx = current.indexOf(fieldKey)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(fieldKey)
    updateFilter('requireLabels', current)
  }

  function handleSave() {
    onSave({
      skuId: recipe.skuId,
      filters,
      exportFields: [...exportFields],
      preferredFormat,
    })
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#1b1e2e', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#7b9aff' }}
            >
              {recipe.skuId}
            </span>
            <h3 className="text-sm font-semibold text-white">{skuDef?.nameKo ?? recipe.skuId} 설정</h3>
          </div>
          <button onClick={onClose}>
            <span className="material-symbols-outlined text-base" style={{ color: 'rgba(255,255,255,0.4)' }}>close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5" style={{ maxHeight: 'calc(85vh - 120px)' }}>
          {/* 소스 필터 */}
          <section>
            <p className="text-xs font-medium text-white mb-2">소스 필터</p>

            <div className="space-y-2">
              <ToggleRow label="오디오 필수" value={filters.requireAudio} onChange={v => updateFilter('requireAudio', v)} />
              <ToggleRow label="공개 동의 필수" value={filters.requirePublicConsent} onChange={v => updateFilter('requirePublicConsent', v)} />
              <ToggleRow label="PII 처리 완료" value={filters.requirePiiCleaned} onChange={v => updateFilter('requirePiiCleaned', v)} />

              {/* 라벨 필수 */}
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>라벨 필수</p>
                <div className="flex gap-1">
                  {(['none', 'any', 'specific'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setLabelMode(m)}
                      className="text-[11px] px-2 py-1 rounded transition-colors"
                      style={{
                        backgroundColor: labelMode === m ? '#1337ec' : 'rgba(255,255,255,0.06)',
                        color: labelMode === m ? 'white' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {m === 'none' ? '없음' : m === 'any' ? '아무거나' : '특정 필드'}
                    </button>
                  ))}
                </div>
                {labelMode === 'specific' && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {LABEL_FIELDS.map(f => (
                      <button
                        key={f.key}
                        onClick={() => toggleSpecificLabelField(f.key)}
                        className="text-[10px] px-2 py-0.5 rounded transition-colors"
                        style={{
                          backgroundColor: specificLabelFields.includes(f.key) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                          color: specificLabelFields.includes(f.key) ? '#22c55e' : 'rgba(255,255,255,0.3)',
                        }}
                      >
                        {f.labelKo}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 최소 품질 등급 */}
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>최소 품질 등급</p>
                <div className="flex gap-1">
                  {QUALITY_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => updateFilter('minQualityGrade', opt.value)}
                      className="text-[11px] px-2 py-1 rounded transition-colors"
                      style={{
                        backgroundColor: filters.minQualityGrade === opt.value ? '#1337ec' : 'rgba(255,255,255,0.06)',
                        color: filters.minQualityGrade === opt.value ? 'white' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 도메인 필터 */}
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>도메인 (빈칸=전체)</p>
                <div className="flex flex-wrap gap-1">
                  {DOMAIN_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDomain(d)}
                      className="text-[10px] px-2 py-0.5 rounded transition-colors"
                      style={{
                        backgroundColor: filters.domainFilter.includes(d) ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.04)',
                        color: filters.domainFilter.includes(d) ? '#7b9aff' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 출력 필드 */}
          <section>
            <p className="text-xs font-medium text-white mb-2">출력 필드 ({exportFields.size}개)</p>
            <div className="space-y-2">
              {[...fieldGroups.entries()].map(([group, groupFields]) => (
                <div key={group}>
                  <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {FIELD_GROUP_LABELS[group]}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {groupFields.map(f => (
                      <button
                        key={f.key}
                        onClick={() => toggleExportField(f.key)}
                        className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                        style={{
                          backgroundColor: exportFields.has(f.key) ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.04)',
                          color: exportFields.has(f.key) ? '#7b9aff' : 'rgba(255,255,255,0.25)',
                        }}
                      >
                        {f.labelKo}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 선호 포맷 */}
          <section>
            <p className="text-xs font-medium text-white mb-2">선호 포맷</p>
            <div className="flex gap-1">
              {(['json', 'jsonl', 'csv'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setPreferredFormat(fmt)}
                  className="text-xs px-3 py-1 rounded transition-colors"
                  style={{
                    backgroundColor: preferredFormat === fmt ? '#1337ec' : 'rgba(255,255,255,0.06)',
                    color: preferredFormat === fmt ? 'white' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button
            onClick={onReset}
            className="px-3 py-2 text-xs rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
          >
            초기화
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: '#1337ec' }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 내부 토글 컴포넌트 ──

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-1"
    >
      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <div
        className="w-8 h-4 rounded-full relative transition-colors"
        style={{ backgroundColor: value ? '#1337ec' : 'rgba(255,255,255,0.12)' }}
      >
        <div
          className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
          style={{ left: value ? '18px' : '2px' }}
        />
      </div>
    </button>
  )
}
