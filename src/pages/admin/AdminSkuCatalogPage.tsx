import { useState, useEffect, useMemo, useRef } from 'react'
import { type SkuPreset, type SkuComponentId, type LabelRequirement, type LabelValueFilter } from '../../types/admin'
import { type SkuId, SKU_CATALOG, SKU_COMPONENT_CATALOG } from '../../types/sku'
import { type ExportFieldGroup } from '../../types/dataset'
import { LABEL_FIELDS } from '../../lib/adminHelpers'
import { DOMAIN_OPTIONS } from '../../lib/labelOptions'
import { EXPORT_FIELD_CATALOG, FIELD_GROUP_LABELS } from '../../lib/exportFields'
import { loadSkuPresets, saveSkuPreset, deleteSkuPreset } from '../../lib/adminStore'

const MVP_SKUS = SKU_CATALOG.filter(s => s.isAvailableMvp)
const MVP_COMPONENTS = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)

/** SKU baseRate 중간값을 기본 단가로 사용 */
function defaultPriceForSku(skuId: string): number | null {
  const sku = SKU_CATALOG.find(s => s.id === skuId)
  if (!sku) return null
  return Math.round((sku.baseRateLow + sku.baseRateHigh) / 2)
}
const QUALITY_OPTIONS: { value: 'A' | 'B' | 'C' | ''; label: string }[] = [
  { value: '', label: '없음' },
  { value: 'C', label: 'C 이상' },
  { value: 'B', label: 'B 이상' },
  { value: 'A', label: 'A만' },
]

type FormData = {
  name: string
  baseSkuId: SkuId | ''
  componentIds: SkuComponentId[]
  // 소스 필터
  requireAudio: boolean
  labelMode: 'none' | 'any' | 'specific'
  specificLabelFields: string[]
  labelValueFilter: LabelValueFilter
  requireConsent: boolean
  requirePiiCleaned: boolean
  minQualityGrade: 'A' | 'B' | 'C' | ''
  domainFilter: string[]
  // 출력 설정
  exportFields: Set<string>
  preferredFormat: 'json' | 'jsonl' | 'csv'
  // 가격/메타
  suggestedPricePerUnit: string
  notes: string
}

function makeEmptyForm(): FormData {
  return {
    name: '', baseSkuId: '', componentIds: ['BASIC'],
    requireAudio: true, labelMode: 'none', specificLabelFields: [],
    labelValueFilter: {},
    requireConsent: true, requirePiiCleaned: false,
    minQualityGrade: '', domainFilter: [],
    exportFields: new Set(EXPORT_FIELD_CATALOG.filter(f => f.defaultOn).map(f => f.key)),
    preferredFormat: 'jsonl',
    suggestedPricePerUnit: '', notes: '',
  }
}

function presetToForm(p: SkuPreset): FormData {
  const labelMode: FormData['labelMode'] =
    p.requireLabels === false ? 'none' :
    p.requireLabels === true ? 'any' : 'specific'
  const specificLabelFields = Array.isArray(p.requireLabels) ? p.requireLabels : []

  return {
    name: p.name,
    baseSkuId: p.baseSkuId,
    componentIds: [...p.componentIds],
    requireAudio: p.requireAudio,
    labelMode,
    specificLabelFields,
    labelValueFilter: { ...p.labelValueFilter },
    requireConsent: p.requireConsent,
    requirePiiCleaned: p.requirePiiCleaned,
    minQualityGrade: p.minQualityGrade ?? '',
    domainFilter: [...p.domainFilter],
    exportFields: new Set(p.exportFields.length > 0 ? p.exportFields : EXPORT_FIELD_CATALOG.filter(f => f.defaultOn).map(f => f.key)),
    preferredFormat: p.preferredFormat,
    suggestedPricePerUnit: p.suggestedPricePerUnit != null ? String(p.suggestedPricePerUnit) : '',
    notes: p.notes ?? '',
  }
}

function formToLabelRequirement(form: FormData): LabelRequirement {
  if (form.labelMode === 'none') return false
  if (form.labelMode === 'any') return true
  return form.specificLabelFields
}

export default function AdminSkuCatalogPage() {
  const [presets, setPresets] = useState<SkuPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(makeEmptyForm)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'presets' | 'catalog'>('presets')
  const hasLoadedRef = useRef(false)

  const fieldGroups = useMemo(() => {
    const groups = new Map<ExportFieldGroup, typeof EXPORT_FIELD_CATALOG>()
    for (const f of EXPORT_FIELD_CATALOG) {
      const arr = groups.get(f.group) ?? []
      arr.push(f)
      groups.set(f.group, arr)
    }
    return groups
  }, [])

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await loadSkuPresets()
      setPresets(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  function openNew() {
    setEditingId(null)
    setForm(makeEmptyForm())
    setShowForm(true)
  }

  function openEdit(p: SkuPreset) {
    setEditingId(p.id)
    setForm(presetToForm(p))
    setShowForm(true)
  }

  function toggleComponent(cid: SkuComponentId) {
    if (cid === 'BASIC') return
    setForm(prev => ({
      ...prev,
      componentIds: prev.componentIds.includes(cid)
        ? prev.componentIds.filter(c => c !== cid)
        : [...prev.componentIds, cid],
    }))
  }

  function toggleDomain(d: string) {
    setForm(prev => ({
      ...prev,
      domainFilter: prev.domainFilter.includes(d)
        ? prev.domainFilter.filter(x => x !== d)
        : [...prev.domainFilter, d],
    }))
  }

  function toggleLabelField(key: string) {
    setForm(prev => {
      const next = prev.specificLabelFields.includes(key)
        ? prev.specificLabelFields.filter(k => k !== key)
        : [...prev.specificLabelFields, key]
      return { ...prev, specificLabelFields: next }
    })
  }

  function toggleExportField(key: string) {
    setForm(prev => {
      const next = new Set(prev.exportFields)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, exportFields: next }
    })
  }

  function toggleLabelValue(fieldKey: string, value: string) {
    setForm(prev => {
      const current = prev.labelValueFilter[fieldKey] ?? []
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      const filter = { ...prev.labelValueFilter }
      if (next.length === 0) {
        delete filter[fieldKey]
      } else {
        filter[fieldKey] = next
      }
      return { ...prev, labelValueFilter: filter }
    })
  }

  // labelMode 변경 시 표시할 라벨 필드 목록
  const visibleLabelFields = form.labelMode === 'none' ? [] :
    form.labelMode === 'any' ? LABEL_FIELDS :
    LABEL_FIELDS.filter(f => form.specificLabelFields.includes(f.key))

  async function handleSave() {
    if (!form.name.trim() || !form.baseSkuId) return
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const existing = editingId ? presets.find(p => p.id === editingId) : null
      // labelValueFilter에서 선택된 필드만 유지
      const cleanedFilter: LabelValueFilter = {}
      for (const [k, v] of Object.entries(form.labelValueFilter)) {
        if (v.length > 0) cleanedFilter[k] = v
      }
      const preset: SkuPreset = {
        id: editingId ?? `sp_${Date.now()}`,
        name: form.name.trim(),
        baseSkuId: form.baseSkuId as SkuId,
        componentIds: form.componentIds.length > 0 ? form.componentIds : ['BASIC'],
        requireAudio: form.requireAudio,
        requireLabels: formToLabelRequirement(form),
        labelValueFilter: cleanedFilter,
        requireConsent: form.requireConsent,
        requirePiiCleaned: form.requirePiiCleaned,
        minQualityGrade: (form.minQualityGrade as 'A' | 'B' | 'C') || null,
        domainFilter: form.domainFilter,
        exportFields: [...form.exportFields],
        preferredFormat: form.preferredFormat,
        suggestedPricePerUnit: form.suggestedPricePerUnit ? parseInt(form.suggestedPricePerUnit, 10) : null,
        notes: form.notes.trim() || null,
        isActive: true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      await saveSkuPreset(preset)
      setShowForm(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteSkuPreset(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function skuName(id: string) {
    return SKU_CATALOG.find(s => s.id === id)?.nameKo ?? id
  }

  function compName(cid: string) {
    return SKU_COMPONENT_CATALOG.find(c => c.id === cid)?.nameKo ?? cid
  }

  function labelSummary(rl: LabelRequirement): string {
    if (rl === false) return '불필요'
    if (rl === true) return '아무 라벨'
    if (rl.length === 0) return '특정 필드 (미선택)'
    return rl.map(k => LABEL_FIELDS.find(f => f.key === k)?.labelKo ?? k).join(', ')
  }

  return (
    <div className="p-4 space-y-4">
      {/* Tab toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('presets')}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{
            backgroundColor: tab === 'presets' ? 'rgba(19,55,236,0.2)' : 'rgba(255,255,255,0.06)',
            color: tab === 'presets' ? '#1337ec' : 'rgba(255,255,255,0.5)',
          }}
        >
          커스텀 프리셋 ({presets.length})
        </button>
        <button
          onClick={() => setTab('catalog')}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{
            backgroundColor: tab === 'catalog' ? 'rgba(19,55,236,0.2)' : 'rgba(255,255,255,0.06)',
            color: tab === 'catalog' ? '#1337ec' : 'rgba(255,255,255,0.5)',
          }}
        >
          기본 카탈로그 ({SKU_CATALOG.length})
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">error</span>
          <div>
            <p className="font-medium">오류</p>
            <p className="mt-0.5 opacity-80">{error}</p>
            {error.includes('sku_presets') && error.includes('does not exist') && (
              <p className="mt-1 opacity-60">Supabase에서 004_sku_presets.sql 마이그레이션을 실행하세요</p>
            )}
          </div>
        </div>
      )}

      {/* === Presets Tab === */}
      {tab === 'presets' && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
              커스텀 SKU 프리셋
            </h2>
            <button
              onClick={openNew}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ backgroundColor: '#1337ec' }}
            >
              <span className="material-symbols-outlined text-sm">add</span>
              새 프리셋
            </button>
          </div>

          {/* ===== Preset Form ===== */}
          {showForm && (
            <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(19,55,236,0.3)' }}>
              <h3 className="text-sm font-semibold text-white">
                {editingId ? '프리셋 수정' : '새 프리셋'}
              </h3>

              {/* Name */}
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="프리셋 이름 * (예: 음성+라벨 골드팩)"
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              />

              {/* Base SKU */}
              <div>
                <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>기본 SKU *</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {MVP_SKUS.map(s => {
                    const selected = form.baseSkuId === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          const dp = defaultPriceForSku(s.id)
                          setForm({
                            ...form,
                            baseSkuId: s.id,
                            suggestedPricePerUnit: form.suggestedPricePerUnit || (dp != null ? String(dp) : ''),
                          })
                        }}
                        className="text-left text-xs px-3 py-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: selected ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${selected ? 'rgba(19,55,236,0.4)' : 'rgba(255,255,255,0.06)'}`,
                          color: selected ? '#fff' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        <span className="font-medium">{s.id}</span>
                        <span className="text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {s.baseRateLow.toLocaleString()}~{s.baseRateHigh.toLocaleString()}원
                        </span>
                        <br />
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.nameKo}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Components */}
              <div>
                <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>컴포넌트</p>
                <div className="flex flex-wrap gap-1.5">
                  {MVP_COMPONENTS.map(comp => {
                    const selected = form.componentIds.includes(comp.id)
                    return (
                      <button
                        key={comp.id}
                        onClick={() => toggleComponent(comp.id)}
                        disabled={comp.id === 'BASIC'}
                        className="text-xs px-2.5 py-1 rounded-lg transition-colors disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: selected ? 'rgba(19,55,236,0.2)' : 'rgba(255,255,255,0.05)',
                          color: selected ? '#1337ec' : 'rgba(255,255,255,0.4)',
                          border: `1px solid ${selected ? 'rgba(19,55,236,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        {comp.nameKo}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── 소스 필터 ── */}
              <div className="space-y-2.5 pt-1">
                <p className="text-xs font-medium text-white">소스 필터</p>

                <ToggleRow label="오디오 필수" value={form.requireAudio} onChange={v => setForm({ ...form, requireAudio: v })} />
                <ToggleRow label="공개 동의 필수" value={form.requireConsent} onChange={v => setForm({ ...form, requireConsent: v })} />
                <ToggleRow label="PII 처리 완료" value={form.requirePiiCleaned} onChange={v => setForm({ ...form, requirePiiCleaned: v })} />

                {/* Label requirement */}
                <div>
                  <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>라벨 필수</p>
                  <div className="flex gap-1">
                    {(['none', 'any', 'specific'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setForm({ ...form, labelMode: m, specificLabelFields: m === 'specific' ? form.specificLabelFields : [] })}
                        className="text-[11px] px-2 py-1 rounded transition-colors"
                        style={{
                          backgroundColor: form.labelMode === m ? '#1337ec' : 'rgba(255,255,255,0.06)',
                          color: form.labelMode === m ? 'white' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        {m === 'none' ? '없음' : m === 'any' ? '아무거나' : '특정 필드'}
                      </button>
                    ))}
                  </div>
                  {form.labelMode === 'specific' && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {LABEL_FIELDS.map(f => (
                        <button
                          key={f.key}
                          onClick={() => toggleLabelField(f.key)}
                          className="text-[10px] px-2 py-0.5 rounded transition-colors"
                          style={{
                            backgroundColor: form.specificLabelFields.includes(f.key) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                            color: form.specificLabelFields.includes(f.key) ? '#22c55e' : 'rgba(255,255,255,0.3)',
                          }}
                        >
                          {f.labelKo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Per-field label value filter */}
                {visibleLabelFields.length > 0 && (
                  <div className="rounded-lg p-3 space-y-2.5" style={{ backgroundColor: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                    <p className="text-[11px] font-medium" style={{ color: '#8b5cf6' }}>
                      라벨 값 필터 (선택 안하면 전체 허용)
                    </p>
                    {visibleLabelFields.map(field => {
                      const selected = form.labelValueFilter[field.key] ?? []
                      return (
                        <div key={field.key}>
                          <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            {field.labelKo}
                            {selected.length > 0 && (
                              <span style={{ color: '#8b5cf6' }}> ({selected.length}개 선택)</span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {field.options.map(opt => {
                              const active = selected.includes(opt)
                              return (
                                <button
                                  key={opt}
                                  onClick={() => toggleLabelValue(field.key, opt)}
                                  className="text-[10px] px-2 py-0.5 rounded transition-colors"
                                  style={{
                                    backgroundColor: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: active ? '#a78bfa' : 'rgba(255,255,255,0.3)',
                                    border: `1px solid ${active ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
                                  }}
                                >
                                  {opt}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Min quality grade */}
                <div>
                  <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>최소 품질 등급</p>
                  <div className="flex gap-1">
                    {QUALITY_OPTIONS.map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => setForm({ ...form, minQualityGrade: opt.value })}
                        className="text-[11px] px-2 py-1 rounded transition-colors"
                        style={{
                          backgroundColor: form.minQualityGrade === opt.value ? '#1337ec' : 'rgba(255,255,255,0.06)',
                          color: form.minQualityGrade === opt.value ? 'white' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Domain filter */}
                <div>
                  <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>도메인 (빈칸=전체)</p>
                  <div className="flex flex-wrap gap-1">
                    {DOMAIN_OPTIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => toggleDomain(d)}
                        className="text-[10px] px-2 py-0.5 rounded transition-colors"
                        style={{
                          backgroundColor: form.domainFilter.includes(d) ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.04)',
                          color: form.domainFilter.includes(d) ? '#7b9aff' : 'rgba(255,255,255,0.3)',
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── 출력 필드 ── */}
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-white">출력 필드 ({form.exportFields.size}개)</p>
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
                            backgroundColor: form.exportFields.has(f.key) ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.04)',
                            color: form.exportFields.has(f.key) ? '#7b9aff' : 'rgba(255,255,255,0.25)',
                          }}
                        >
                          {f.labelKo}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── 선호 포맷 ── */}
              <div>
                <p className="text-xs font-medium text-white mb-1.5">선호 포맷</p>
                <div className="flex gap-1">
                  {(['json', 'jsonl', 'csv'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setForm({ ...form, preferredFormat: fmt })}
                      className="text-xs px-3 py-1 rounded transition-colors"
                      style={{
                        backgroundColor: form.preferredFormat === fmt ? '#1337ec' : 'rgba(255,255,255,0.06)',
                        color: form.preferredFormat === fmt ? 'white' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── 가격/메모 ── */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>참고 단가 (원/유닛)</p>
                  <input
                    type="number"
                    value={form.suggestedPricePerUnit}
                    onChange={e => setForm({ ...form, suggestedPricePerUnit: e.target.value })}
                    placeholder="미정"
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>
                <div>
                  <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>메모</p>
                  <input
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="옵션"
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.baseSkuId}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: '#1337ec' }}
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}

          {/* Preset list */}
          {loading ? (
            <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
            </div>
          ) : presets.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="material-symbols-outlined text-4xl">tune</span>
              <p className="text-sm mt-2">등록된 프리셋이 없습니다</p>
              <p className="text-xs mt-1">기본 SKU에서 라벨/필터/출력 필드를 커스텀하여 프리셋을 만드세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {presets.map(p => (
                <div key={p.id} className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e', opacity: p.isActive ? 1 : 0.5 }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-white">{p.name}</h3>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {p.baseSkuId} - {skuName(p.baseSkuId)}
                      </p>
                    </div>
                    <div className="text-right">
                      {p.suggestedPricePerUnit != null && (
                        <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {p.suggestedPricePerUnit.toLocaleString()}원/유닛
                        </span>
                      )}
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {p.preferredFormat.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {/* Component chips */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.componentIds.map(cid => (
                      <span
                        key={cid}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#1337ec' }}
                      >
                        {compName(cid)}
                      </span>
                    ))}
                  </div>

                  {/* Filter tags */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.requireAudio && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                        오디오 필수
                      </span>
                    )}
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: p.requireLabels === false ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.15)',
                        color: p.requireLabels === false ? 'rgba(255,255,255,0.4)' : '#8b5cf6',
                      }}
                    >
                      라벨: {labelSummary(p.requireLabels)}
                    </span>
                    {p.minQualityGrade && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                        최소 {p.minQualityGrade}등급
                      </span>
                    )}
                    {p.requireConsent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                        동의 필수
                      </span>
                    )}
                    {p.requirePiiCleaned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
                        PII 정제
                      </span>
                    )}
                    {p.domainFilter.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(19,55,236,0.1)', color: '#7b9aff' }}>
                        도메인: {p.domainFilter.join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Label value filter display */}
                  {Object.keys(p.labelValueFilter).length > 0 && (
                    <div className="mb-2 space-y-1">
                      {Object.entries(p.labelValueFilter).map(([fieldKey, values]) => {
                        const fieldLabel = LABEL_FIELDS.find(f => f.key === fieldKey)?.labelKo ?? fieldKey
                        return (
                          <div key={fieldKey} className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9px]" style={{ color: 'rgba(139,92,246,0.7)' }}>{fieldLabel}:</span>
                            {values.map(v => (
                              <span
                                key={v}
                                className="text-[9px] px-1 py-0.5 rounded"
                                style={{ backgroundColor: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Export fields summary */}
                  {p.exportFields.length > 0 && (
                    <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      출력 필드 {p.exportFields.length}개
                    </p>
                  )}

                  {p.notes && (
                    <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{p.notes}</p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <button onClick={() => openEdit(p)} className="text-xs px-2 py-1 rounded" style={{ color: '#1337ec' }}>
                      수정
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-xs px-2 py-1 rounded" style={{ color: '#ef4444' }}>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* === Base Catalog Tab === */}
      {tab === 'catalog' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            기본 SKU 정의 (수정 불가). 프리셋 탭에서 라벨/필터/출력 필드를 커스텀한 구성을 만드세요.
          </p>
          {SKU_CATALOG.map(sku => (
            <div key={sku.id} className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e', opacity: sku.isAvailableMvp ? 1 : 0.4 }}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <span className="text-xs font-mono font-medium text-white">{sku.id}</span>
                  <span className="text-xs ml-2 text-white">{sku.nameKo}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: sku.policyRisk === 'Low' ? 'rgba(34,197,94,0.1)' : sku.policyRisk === 'Med' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
                      color: sku.policyRisk === 'Low' ? '#22c55e' : sku.policyRisk === 'Med' ? '#eab308' : '#ef4444',
                    }}
                  >
                    리스크 {sku.policyRisk}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    {sku.category}
                  </span>
                </div>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{sku.descriptionKo}</p>
              <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span>{sku.baseRateLow.toLocaleString()}~{sku.baseRateHigh.toLocaleString()}원/시간</span>
                <span>라벨 배수 x{sku.labelMultiplierMax}</span>
              </div>
              {!sku.isAvailableMvp && sku.unavailableReason && (
                <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{sku.unavailableReason}</p>
              )}

              {/* 예상 구매자 */}
              {sku.buyersKo && sku.buyersKo.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>예상 구매자</p>
                  <div className="flex flex-wrap gap-1">
                    {sku.buyersKo.map(b => (
                      <span
                        key={b}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(19,55,236,0.1)', color: '#7b9aff' }}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 활용도 */}
              {sku.useCasesKo && sku.useCasesKo.length > 0 && (
                <div className="mt-1.5">
                  <p className="text-[10px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>활용도</p>
                  <div className="flex flex-wrap gap-1">
                    {sku.useCasesKo.map(u => (
                      <span
                        key={u}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 차별점 */}
              {sku.differentiatorKo && (
                <p className="text-[10px] mt-1.5 italic" style={{ color: 'rgba(34,197,94,0.7)' }}>
                  {sku.differentiatorKo}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Internal toggle component ──

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
