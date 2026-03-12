import { useState, useMemo } from 'react'
import { type ExportFieldSelection, type ExportFieldGroup } from '../../types/dataset'
import { type SkuId, SKU_CATALOG } from '../../types/sku'
import { EXPORT_FIELD_CATALOG, FIELD_GROUP_LABELS, SKU_FIELD_PRESETS, resolveExportFields } from '../../lib/exportFields'

type ExportFormat = 'json' | 'jsonl' | 'csv' | 'audio' | 'wav' | 'transcript' | 'wav+transcript'

type Props = {
  isOpen: boolean
  onClose: () => void
  onExport: (format: ExportFormat, fieldSelection: ExportFieldSelection) => void
  sessionCount: number
}

const FORMAT_OPTIONS: { key: ExportFormat; label: string; icon: string }[] = [
  { key: 'json', label: 'JSON', icon: 'data_object' },
  { key: 'jsonl', label: 'JSONL', icon: 'view_stream' },
  { key: 'csv', label: 'CSV', icon: 'table_chart' },
  { key: 'audio', label: '오디오', icon: 'audio_file' },
  { key: 'wav', label: 'WAV', icon: 'music_note' },
  { key: 'transcript', label: 'STT 자막', icon: 'subtitles' },
  { key: 'wav+transcript', label: 'WAV+자막', icon: 'movie' },
]

const MVP_SKUS = SKU_CATALOG.filter(s => s.isAvailableMvp && SKU_FIELD_PRESETS[s.id])

export default function ExportOptionsPanel({ isOpen, onClose, onExport, sessionCount }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null)
  const [fieldMode, setFieldMode] = useState<'all' | 'preset' | 'custom'>('all')
  const [presetSkuId, setPresetSkuId] = useState<SkuId>('U-A01')
  const [customKeys, setCustomKeys] = useState<Set<string>>(
    () => new Set(EXPORT_FIELD_CATALOG.filter(f => f.defaultOn).map(f => f.key)),
  )

  const fieldSelection: ExportFieldSelection = useMemo(() => {
    switch (fieldMode) {
      case 'all': return { mode: 'all', selectedKeys: EXPORT_FIELD_CATALOG.map(f => f.key) }
      case 'preset': return { mode: 'preset', presetSkuId, selectedKeys: SKU_FIELD_PRESETS[presetSkuId] ?? [] }
      case 'custom': return { mode: 'custom', selectedKeys: [...customKeys] }
    }
  }, [fieldMode, presetSkuId, customKeys])

  const resolvedFields = useMemo(() => resolveExportFields(fieldSelection), [fieldSelection])

  const fieldGroups = useMemo(() => {
    const groups = new Map<ExportFieldGroup, typeof EXPORT_FIELD_CATALOG>()
    for (const f of EXPORT_FIELD_CATALOG) {
      const arr = groups.get(f.group) ?? []
      arr.push(f)
      groups.set(f.group, arr)
    }
    return groups
  }, [])

  function handleExport() {
    if (!selectedFormat) return
    onExport(selectedFormat, fieldSelection)
    setSelectedFormat(null)
  }

  function toggleCustomKey(key: string) {
    setCustomKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!isOpen) return null

  const showFieldSelection = selectedFormat && selectedFormat !== 'wav'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl overflow-hidden"
        style={{ backgroundColor: '#1b1e2e', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold text-white">
            {showFieldSelection ? '필드 선택' : '내보내기'}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {sessionCount}건
            </span>
            {showFieldSelection && (
              <button
                onClick={() => setSelectedFormat(null)}
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
              >
                포맷 변경
              </button>
            )}
            <button onClick={onClose}>
              <span className="material-symbols-outlined text-base" style={{ color: 'rgba(255,255,255,0.4)' }}>close</span>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
          {/* Step 1: 포맷 선택 */}
          {!showFieldSelection && (
            <div className="p-4 grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map(f => (
                <button
                  key={f.key}
                  onClick={() => f.key === 'wav' ? onExport('wav', fieldSelection) : setSelectedFormat(f.key)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <span className="material-symbols-outlined text-xl" style={{ color: '#1337ec' }}>{f.icon}</span>
                  <span className="text-xs text-white">{f.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: 필드 선택 */}
          {showFieldSelection && (
            <div className="p-4 space-y-4">
              {/* 모드 탭 */}
              <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                {(['all', 'preset', 'custom'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setFieldMode(mode)}
                    className="flex-1 text-xs py-1.5 rounded-md transition-colors"
                    style={{
                      backgroundColor: fieldMode === mode ? '#1337ec' : 'transparent',
                      color: fieldMode === mode ? 'white' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {mode === 'all' ? '전체' : mode === 'preset' ? 'SKU 프리셋' : '커스텀'}
                  </button>
                ))}
              </div>

              {/* 프리셋 모드: SKU 칩 선택 */}
              {fieldMode === 'preset' && (
                <div className="flex flex-wrap gap-2">
                  {MVP_SKUS.map(sku => (
                    <button
                      key={sku.id}
                      onClick={() => setPresetSkuId(sku.id)}
                      className="text-xs px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        backgroundColor: presetSkuId === sku.id ? '#1337ec' : 'rgba(255,255,255,0.06)',
                        color: presetSkuId === sku.id ? 'white' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {sku.id}
                    </button>
                  ))}
                  <p className="w-full text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {SKU_CATALOG.find(s => s.id === presetSkuId)?.nameKo}
                  </p>
                </div>
              )}

              {/* 필드 목록 (preset: readOnly, custom: 체크박스) */}
              <div className="space-y-3">
                {[...fieldGroups.entries()].map(([group, groupFields]) => (
                  <div key={group}>
                    <p className="text-[10px] font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {FIELD_GROUP_LABELS[group]}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {groupFields.map(f => {
                        const included = resolvedFields.has(f.key)
                        const isCustom = fieldMode === 'custom'
                        return (
                          <button
                            key={f.key}
                            onClick={() => isCustom && toggleCustomKey(f.key)}
                            disabled={!isCustom}
                            className="text-[11px] px-2 py-0.5 rounded transition-colors"
                            style={{
                              backgroundColor: included ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.04)',
                              color: included ? '#7b9aff' : 'rgba(255,255,255,0.25)',
                              cursor: isCustom ? 'pointer' : 'default',
                            }}
                          >
                            {f.labelKo}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {resolvedFields.size}개 필드 선택됨
              </p>
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        {showFieldSelection && (
          <div className="px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <button
              onClick={handleExport}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ backgroundColor: '#1337ec' }}
            >
              {selectedFormat?.toUpperCase()} 내보내기 ({resolvedFields.size}개 필드)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
