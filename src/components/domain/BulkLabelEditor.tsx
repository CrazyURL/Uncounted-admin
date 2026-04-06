import { useState, useRef, useEffect } from 'react'
import { type BillableUnit } from '../../types/admin'
import { RELATIONSHIP_OPTIONS, PURPOSE_OPTIONS, DOMAIN_OPTIONS, TONE_OPTIONS, NOISE_OPTIONS } from '../../lib/labelOptions'
import { getAdminSignedUrlApi } from '../../lib/api/admin'

type LabelValues = {
  relationship: string | null
  purpose: string | null
  domain: string | null
  tone: string | null
  noise: string | null
}

type Props = {
  sessionId: string
  audioUrl: string | null
  units: BillableUnit[]
  onSave: (sessionId: string, labels: LabelValues) => Promise<void>
  onClose: () => void
}

const LABEL_FIELDS: {
  key: keyof LabelValues
  labelKo: string
  options: readonly string[]
}[] = [
  { key: 'relationship', labelKo: '관계', options: RELATIONSHIP_OPTIONS },
  { key: 'purpose', labelKo: '목적', options: PURPOSE_OPTIONS },
  { key: 'domain', labelKo: '도메인', options: DOMAIN_OPTIONS },
  { key: 'tone', labelKo: '톤', options: TONE_OPTIONS },
  { key: 'noise', labelKo: '소음', options: NOISE_OPTIONS },
]

export default function BulkLabelEditor({ sessionId, audioUrl, units, onSave, onClose }: Props) {
  const [labels, setLabels] = useState<LabelValues>({
    relationship: null,
    purpose: null,
    domain: null,
    tone: null,
    noise: null,
  })
  const [saving, setSaving] = useState(false)
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!audioUrl) return
    let cancelled = false
    setAudioLoading(true)
    getAdminSignedUrlApi(audioUrl, 600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) {
          setSignedAudioUrl(data.signedUrl)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAudioLoading(false) })
    return () => {
      cancelled = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [audioUrl])

  function handleChipToggle(field: keyof LabelValues, value: string) {
    setLabels(prev => ({
      ...prev,
      [field]: prev[field] === value ? null : value,
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(sessionId, labels)
    } catch (err) {
      console.error('[BulkLabelEditor] save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const filledCount = Object.values(labels).filter(v => v !== null).length

  return (
    <div
      className="rounded-xl p-4 space-y-4 mt-2"
      style={{ backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm" style={{ color: '#8b5cf6' }}>label</span>
          <span className="text-xs font-medium text-white">
            벌크 라벨링 — {units.length}개 BU
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
            {sessionId.slice(0, 8)}...
          </span>
        </div>
        <button
          onClick={onClose}
          className="material-symbols-outlined text-sm"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          close
        </button>
      </div>

      {/* Audio Player */}
      {audioUrl && (
        <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          {audioLoading ? (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm animate-spin" style={{ color: '#8b5cf6' }}>progress_activity</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>오디오 로딩 중...</span>
            </div>
          ) : signedAudioUrl ? (
            <audio
              ref={audioRef}
              controls
              src={signedAudioUrl}
              className="w-full h-8"
              style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }}
            />
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>오디오를 불러올 수 없습니다</span>
          )}
        </div>
      )}

      {/* Label Fields */}
      <div className="space-y-3">
        {LABEL_FIELDS.map(field => (
          <div key={field.key}>
            <p className="text-[10px] font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {field.labelKo}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {field.options.map(opt => {
                const selected = labels[field.key] === opt
                return (
                  <button
                    key={opt}
                    onClick={() => handleChipToggle(field.key, opt)}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      backgroundColor: selected ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                      color: selected ? 'white' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {filledCount}/5 필드 선택됨
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || filledCount === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#8b5cf6', color: 'white' }}
          >
            {saving ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">save</span>
            )}
            전체 BU에 적용 ({units.length}건)
          </button>
        </div>
      </div>
    </div>
  )
}
