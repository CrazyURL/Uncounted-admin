import { useState, useEffect } from 'react'
import { type Client, type ClientSkuRule, type SkuPreset, type LabelRequirement } from '../../types/admin'
import { type SkuId, SKU_CATALOG, SKU_COMPONENT_CATALOG } from '../../types/sku'
import { LABEL_FIELDS } from '../../lib/adminHelpers'
import { loadClients, loadClientSkuRules, saveClientSkuRule, deleteClientSkuRule, loadSkuPresets } from '../../lib/adminStore'

const MVP_SKUS = SKU_CATALOG.filter(s => s.isAvailableMvp)
const MVP_COMPONENTS = SKU_COMPONENT_CATALOG.filter(c => c.isEnabledMvp)

type FormData = {
  presetId: string | null
  skuId: SkuId | ''
  componentIds: string[]
  maxUnitsPerMonth: string
  pricePerUnit: string
  discountPct: string
}

const EMPTY_FORM: FormData = { presetId: null, skuId: '', componentIds: ['BASIC'], maxUnitsPerMonth: '', pricePerUnit: '', discountPct: '0' }

/** SKU baseRate 중간값을 기본 단가로 사용 */
function defaultPriceForSku(skuId: string): number | null {
  const sku = SKU_CATALOG.find(s => s.id === skuId)
  if (!sku) return null
  return Math.round((sku.baseRateLow + sku.baseRateHigh) / 2)
}

export default function AdminClientSkuMapPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [presets, setPresets] = useState<SkuPreset[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [rules, setRules] = useState<ClientSkuRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([loadClients(), loadSkuPresets().catch(() => [])]).then(([c, p]) => {
      setClients(c)
      setPresets(p)
      if (c.length > 0) setSelectedClientId(c[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (selectedClientId) {
      loadClientSkuRules(selectedClientId).then(setRules)
    } else {
      setRules([])
    }
  }, [selectedClientId])

  async function refresh() {
    if (selectedClientId) {
      const r = await loadClientSkuRules(selectedClientId)
      setRules(r)
    }
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function applyPreset(p: SkuPreset) {
    setEditingId(null)
    const price = p.suggestedPricePerUnit ?? defaultPriceForSku(p.baseSkuId)
    setForm({
      presetId: p.id,
      skuId: p.baseSkuId,
      componentIds: [...p.componentIds],
      maxUnitsPerMonth: '',
      pricePerUnit: price != null ? String(price) : '',
      discountPct: '0',
    })
    setShowForm(true)
  }

  function openEdit(rule: ClientSkuRule) {
    setEditingId(rule.id)
    setForm({
      presetId: rule.presetId,
      skuId: rule.skuId,
      componentIds: rule.componentIds,
      maxUnitsPerMonth: rule.maxUnitsPerMonth != null ? String(rule.maxUnitsPerMonth) : '',
      pricePerUnit: rule.pricePerUnit != null ? String(rule.pricePerUnit) : '',
      discountPct: String(rule.discountPct ?? 0),
    })
    setShowForm(true)
  }

  function toggleComponent(cid: string) {
    if (cid === 'BASIC') return
    setForm(prev => ({
      ...prev,
      componentIds: prev.componentIds.includes(cid)
        ? prev.componentIds.filter(c => c !== cid)
        : [...prev.componentIds, cid],
    }))
  }

  async function handleSave() {
    if (!form.skuId || !selectedClientId) return
    setSaving(true)
    setError(null)
    try {
      const existing = editingId ? rules.find(r => r.id === editingId) : null
      const rule: ClientSkuRule = {
        id: editingId ?? `csr_${Date.now()}`,
        clientId: selectedClientId,
        skuId: form.skuId as SkuId,
        presetId: form.presetId,
        componentIds: form.componentIds.length > 0 ? form.componentIds : ['BASIC'],
        maxUnitsPerMonth: form.maxUnitsPerMonth ? parseInt(form.maxUnitsPerMonth, 10) : null,
        pricePerUnit: form.pricePerUnit ? parseInt(form.pricePerUnit, 10) : null,
        discountPct: Math.min(100, Math.max(0, parseInt(form.discountPct, 10) || 0)),
        isActive: true,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      await saveClientSkuRule(rule)
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
      await deleteClientSkuRule(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function skuName(id: string) {
    return SKU_CATALOG.find(s => s.id === id)?.nameKo ?? id
  }

  function labelSummary(rl: LabelRequirement): string {
    if (rl === false) return '불필요'
    if (rl === true) return '아무 라벨'
    if (rl.length === 0) return '특정 필드 (미선택)'
    return rl.map(k => LABEL_FIELDS.find(f => f.key === k)?.labelKo ?? k).join(', ')
  }

  function getPresetForRule(rule: ClientSkuRule): SkuPreset | undefined {
    return rule.presetId ? presets.find(p => p.id === rule.presetId) : undefined
  }

  const selectedPreset = form.presetId ? presets.find(p => p.id === form.presetId) : undefined

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
      </div>
    )
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-4xl">business</span>
        <p className="text-sm mt-2">먼저 납품처를 등록하세요</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
          고객-SKU 매핑
        </h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ backgroundColor: '#1337ec' }}
        >
          <span className="material-symbols-outlined text-sm">add</span>
          규칙 추가
        </button>
      </div>

      {/* Client selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {clients.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedClientId(c.id)}
            className="text-xs px-3 py-1 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: selectedClientId === c.id ? 'rgba(19,55,236,0.2)' : 'rgba(255,255,255,0.06)',
              color: selectedClientId === c.id ? '#1337ec' : 'rgba(255,255,255,0.5)',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">error</span>
          <p>{error}</p>
        </div>
      )}

      {/* Preset quick-apply */}
      {!showForm && presets.length > 0 && (
        <div>
          <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>프리셋에서 적용</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {presets.filter(p => p.isActive).map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className="flex-shrink-0 text-xs px-3 py-2 rounded-lg text-left"
                style={{ backgroundColor: 'rgba(19,55,236,0.08)', border: '1px solid rgba(19,55,236,0.2)', color: 'rgba(255,255,255,0.7)' }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="ml-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{p.baseSkuId}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{
                      backgroundColor: p.requireLabels === false ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.15)',
                      color: p.requireLabels === false ? 'rgba(255,255,255,0.3)' : '#8b5cf6',
                    }}
                  >
                    라벨: {labelSummary(p.requireLabels)}
                  </span>
                  {p.minQualityGrade && (
                    <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                      {p.minQualityGrade}등급+
                    </span>
                  )}
                  {p.domainFilter.length > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(19,55,236,0.1)', color: '#7b9aff' }}>
                      {p.domainFilter.join(',')}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(19,55,236,0.3)' }}>
          <h3 className="text-sm font-semibold text-white">
            {editingId ? 'SKU 규칙 수정' : '새 SKU 규칙'}
          </h3>

          {/* Linked preset info */}
          {selectedPreset && (
            <div className="rounded-lg p-2.5" style={{ backgroundColor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <p className="text-[10px] font-medium" style={{ color: '#8b5cf6' }}>
                프리셋: {selectedPreset.name}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                  라벨: {labelSummary(selectedPreset.requireLabels)}
                </span>
                {selectedPreset.requireAudio && (
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>오디오 필수</span>
                )}
                {selectedPreset.minQualityGrade && (
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{selectedPreset.minQualityGrade}등급+</span>
                )}
                {selectedPreset.requireConsent && (
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>동의 필수</span>
                )}
                {selectedPreset.domainFilter.length > 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(19,55,236,0.1)', color: '#7b9aff' }}>도메인: {selectedPreset.domainFilter.join(', ')}</span>
                )}
                <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                  {selectedPreset.preferredFormat.toUpperCase()} / 필드 {selectedPreset.exportFields.length}개
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {/* SKU select */}
            <select
              value={form.skuId}
              onChange={e => {
                const skuId = e.target.value as FormData['skuId']
                const dp = skuId ? defaultPriceForSku(skuId) : null
                setForm({
                  ...form,
                  skuId,
                  presetId: null,
                  pricePerUnit: dp != null ? String(dp) : '',
                })
              }}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="">SKU 선택 *</option>
              {MVP_SKUS.map(s => (
                <option key={s.id} value={s.id}>{s.id} — {s.nameKo}</option>
              ))}
            </select>

            {/* Preset selector (for linking) */}
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>프리셋 연결 (라벨/필터/출력 설정 결정)</p>
              <select
                value={form.presetId ?? ''}
                onChange={e => {
                  const pid = e.target.value || null
                  const preset = pid ? presets.find(p => p.id === pid) : null
                  setForm(prev => ({
                    ...prev,
                    presetId: pid,
                    ...(preset ? {
                      skuId: preset.baseSkuId,
                      componentIds: [...preset.componentIds],
                      pricePerUnit: preset.suggestedPricePerUnit != null ? String(preset.suggestedPricePerUnit) : prev.pricePerUnit,
                    } : {}),
                  }))
                }}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <option value="">프리셋 없음 (수동 설정)</option>
                {presets.filter(p => p.isActive).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.baseSkuId})</option>
                ))}
              </select>
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

            {/* Limits + Pricing */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>월 최대 유닛</p>
                <input
                  type="number"
                  value={form.maxUnitsPerMonth}
                  onChange={e => setForm({ ...form, maxUnitsPerMonth: e.target.value })}
                  placeholder="제한 없음"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>기본 단가 (원)</p>
                <input
                  type="number"
                  value={form.pricePerUnit}
                  onChange={e => setForm({ ...form, pricePerUnit: e.target.value })}
                  placeholder="미정"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>할인율 (%)</p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPct}
                  onChange={e => setForm({ ...form, discountPct: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>

            {/* Discounted price preview */}
            {form.pricePerUnit && parseInt(form.discountPct, 10) > 0 && (
              <div className="rounded-lg p-2.5 flex items-center justify-between" style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  적용 단가
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] line-through" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {parseInt(form.pricePerUnit, 10).toLocaleString()}원
                  </span>
                  <span className="text-sm font-medium" style={{ color: '#22c55e' }}>
                    {Math.round(parseInt(form.pricePerUnit, 10) * (1 - (parseInt(form.discountPct, 10) || 0) / 100)).toLocaleString()}원/유닛
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                    -{parseInt(form.discountPct, 10)}%
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.skuId}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: '#1337ec' }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span className="material-symbols-outlined text-4xl">account_tree</span>
          <p className="text-sm mt-2">등록된 SKU 규칙이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const preset = getPresetForRule(rule)
            return (
              <div key={rule.id} className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-white">
                      {rule.skuId} — {skuName(rule.skuId)}
                    </h3>
                    <div className="flex gap-1 mt-1">
                      {rule.componentIds.map(cid => (
                        <span
                          key={cid}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#1337ec' }}
                        >
                          {cid}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: rule.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                      color: rule.isActive ? '#22c55e' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {rule.isActive ? '활성' : '비활성'}
                  </span>
                </div>

                {/* Linked preset details */}
                {preset && (
                  <div className="rounded-lg p-2 mb-2" style={{ backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                    <p className="text-[10px] font-medium mb-1" style={{ color: '#8b5cf6' }}>
                      프리셋: {preset.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className="text-[9px] px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: preset.requireLabels === false ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.15)',
                          color: preset.requireLabels === false ? 'rgba(255,255,255,0.3)' : '#8b5cf6',
                        }}
                      >
                        라벨: {labelSummary(preset.requireLabels)}
                      </span>
                      {preset.minQualityGrade && (
                        <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                          {preset.minQualityGrade}등급+
                        </span>
                      )}
                      {preset.domainFilter.length > 0 && (
                        <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(19,55,236,0.1)', color: '#7b9aff' }}>
                          도메인: {preset.domainFilter.join(', ')}
                        </span>
                      )}
                      <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                        {preset.preferredFormat.toUpperCase()} / 필드 {preset.exportFields.length}개
                      </span>
                    </div>
                    {Object.keys(preset.labelValueFilter).length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {Object.entries(preset.labelValueFilter).map(([fk, vals]) => (
                          <div key={fk} className="flex items-center gap-1 flex-wrap">
                            <span className="text-[8px]" style={{ color: 'rgba(139,92,246,0.6)' }}>
                              {LABEL_FIELDS.find(f => f.key === fk)?.labelKo ?? fk}:
                            </span>
                            {vals.map(v => (
                              <span key={v} className="text-[8px] px-1 rounded" style={{ backgroundColor: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {rule.maxUnitsPerMonth != null && (
                    <span>월 {rule.maxUnitsPerMonth.toLocaleString()}유닛</span>
                  )}
                  {rule.pricePerUnit != null && rule.discountPct > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <span className="line-through" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {rule.pricePerUnit.toLocaleString()}원
                      </span>
                      <span style={{ color: '#22c55e' }}>
                        {Math.round(rule.pricePerUnit * (1 - rule.discountPct / 100)).toLocaleString()}원/유닛
                      </span>
                      <span
                        className="text-[9px] px-1 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
                      >
                        -{rule.discountPct}%
                      </span>
                    </span>
                  ) : rule.pricePerUnit != null ? (
                    <span>{rule.pricePerUnit.toLocaleString()}원/유닛</span>
                  ) : null}
                  {rule.maxUnitsPerMonth == null && rule.pricePerUnit == null && !preset && (
                    <span>제한/단가 미설정</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 mt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <button
                    onClick={() => openEdit(rule)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: '#1337ec' }}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: '#ef4444' }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
