import { useState, useCallback, useMemo } from 'react'
import { type ExportUtterance, type UtteranceLabels } from '../../types/export'

type Props = {
  utterances: ExportUtterance[]
  selectedIds: Set<string>
  onUpdateLabels: (utteranceIds: string[], labels: Partial<UtteranceLabels>) => void
  /** SKU ID — 기본 탭 결정에 사용 (U-A02→a02, U-A03→a03) */
  skuId?: string
}

const LABEL_DEFS = {
  relationship: {
    label: '관계',
    options: ['가족', '친구', '직장', '서비스', '기타'],
  },
  purpose: {
    label: '목적',
    options: ['일상대화', '업무', '상담', '기타'],
  },
  domain: {
    label: '도메인',
    options: ['일상', '금융', '의료', '교육', 'IT', '기타'],
  },
  tone: {
    label: '감정',
    options: ['평온', '화남', '슬픔', '기쁨', '놀람'],
  },
  noise: {
    label: '소음',
    options: ['조용', '약간소음', '많은소음'],
  },
} as const

const DIALOG_ACT_OPTIONS = ['진술', '질문', '요청', '명령', '감탄', '인사'] as const
const DIALOG_INTENSITY_OPTIONS = [
  { value: 1, label: '약' },
  { value: 2, label: '보통' },
  { value: 3, label: '강' },
] as const

type LabelKey = keyof typeof LABEL_DEFS

export default function UtteranceLabelingPanel({ utterances, selectedIds, onUpdateLabels, skuId }: Props) {
  const [currentLabels, setCurrentLabels] = useState<Partial<UtteranceLabels>>({})
  const [activeTab, setActiveTab] = useState<'a02' | 'a03'>(skuId === 'U-A03' ? 'a03' : 'a02')

  const targetIds = useMemo(() => Array.from(selectedIds), [selectedIds])

  const handleChipSelect = useCallback((key: LabelKey, value: string) => {
    setCurrentLabels(prev => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }))
  }, [])

  const handleDialogActSelect = useCallback((value: string) => {
    setCurrentLabels(prev => ({
      ...prev,
      dialogAct: prev.dialogAct === value ? undefined : value,
    }))
  }, [])

  const handleIntensitySelect = useCallback((value: number) => {
    setCurrentLabels(prev => ({
      ...prev,
      dialogIntensity: prev.dialogIntensity === value ? undefined : value,
    }))
  }, [])

  const handleApply = useCallback(() => {
    if (targetIds.length === 0) return
    const labelsWithSource: Partial<UtteranceLabels> = {
      ...currentLabels,
      labelSource: 'admin',
    }
    onUpdateLabels(targetIds, labelsWithSource)
  }, [targetIds, currentLabels, onUpdateLabels])

  const hasLabels = Object.values(currentLabels).some(v => v != null)

  // 선택된 발화들의 기존 라벨 요약
  const existingLabelSummary = useMemo(() => {
    const targets = utterances.filter(u => targetIds.includes(u.utteranceId))
    const labeled = targets.filter(u => u.labels && Object.keys(u.labels).length > 0)
    return { total: targets.length, labeled: labeled.length }
  }, [utterances, targetIds])

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={{ color: '#a78bfa' }}>label</span>
          <span className="text-xs font-medium text-white">라벨링</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
            {selectedIds.size > 0 ? `${selectedIds.size}건 선택` : '선택 없음'}
          </span>
        </div>
        {existingLabelSummary.labeled > 0 && (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            라벨 완료 {existingLabelSummary.labeled}/{existingLabelSummary.total}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-1">
        <button
          onClick={() => setActiveTab('a02')}
          className="text-[10px] px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: activeTab === 'a02' ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: activeTab === 'a02' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
          }}
        >
          A02 라벨
        </button>
        <button
          onClick={() => setActiveTab('a03')}
          className="text-[10px] px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: activeTab === 'a03' ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: activeTab === 'a03' ? '#a78bfa' : 'rgba(255,255,255,0.4)',
          }}
        >
          A03 대화행위
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {activeTab === 'a02' && (
          <>
            {(Object.entries(LABEL_DEFS) as [LabelKey, typeof LABEL_DEFS[LabelKey]][]).map(([key, def]) => (
              <div key={key}>
                <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{def.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {def.options.map(opt => {
                    const active = currentLabels[key] === opt
                    return (
                      <button
                        key={opt}
                        onClick={() => handleChipSelect(key, opt)}
                        className="text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                        style={{
                          backgroundColor: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                          color: active ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                          border: active ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'a03' && (
          <>
            <div>
              <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>대화행위</p>
              <div className="flex flex-wrap gap-1.5">
                {DIALOG_ACT_OPTIONS.map(act => {
                  const active = currentLabels.dialogAct === act
                  return (
                    <button
                      key={act}
                      onClick={() => handleDialogActSelect(act)}
                      className="text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                      style={{
                        backgroundColor: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                        color: active ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                        border: active ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                      }}
                    >
                      {act}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>강도</p>
              <div className="flex gap-1.5">
                {DIALOG_INTENSITY_OPTIONS.map(({ value, label }) => {
                  const active = currentLabels.dialogIntensity === value
                  return (
                    <button
                      key={value}
                      onClick={() => handleIntensitySelect(value)}
                      className="text-[10px] px-3 py-1 rounded-lg transition-colors"
                      style={{
                        backgroundColor: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                        color: active ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                        border: active ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                      }}
                    >
                      {value} ({label})
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Apply button */}
      <div className="px-4 py-3 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleApply}
          disabled={!hasLabels || targetIds.length === 0}
          className="w-full text-xs py-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
          style={{
            backgroundColor: !hasLabels || targetIds.length === 0 ? 'rgba(255,255,255,0.06)' : '#8b5cf6',
            color: !hasLabels || targetIds.length === 0 ? 'rgba(255,255,255,0.3)' : '#ffffff',
          }}
        >
          <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>check</span>
          {targetIds.length === 0
            ? '음성을 체크 해주세요'
            : `선택 ${targetIds.length}건에 적용`}
        </button>
        {targetIds.length > 0 && !hasLabels && (
          <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
            위에서 라벨 칩을 하나 이상 선택하면 적용할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}
