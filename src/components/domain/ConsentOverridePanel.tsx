import { useState, useCallback } from 'react'
import { batchUpdateSessions } from '../../lib/api/sessions'

type ConsentStatus = 'both_agreed' | 'user_only' | 'locked'

type Props = {
  sessionId: string
  currentStatus: ConsentStatus
  onStatusChanged: (newStatus: ConsentStatus) => void
}

const STATUS_CONFIG: Record<ConsentStatus, { label: string; color: string; bgColor: string }> = {
  both_agreed: { label: '양측 동의', color: '#22c55e', bgColor: 'rgba(34,197,94,0.15)' },
  user_only: { label: '본인만 동의', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)' },
  locked: { label: '미동의', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' },
}

const STATUS_OPTIONS: ConsentStatus[] = ['both_agreed', 'user_only', 'locked']

export default function ConsentOverridePanel({ sessionId, currentStatus, onStatusChanged }: Props) {
  const [selectedStatus, setSelectedStatus] = useState<ConsentStatus>(currentStatus)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = selectedStatus !== currentStatus
  const canSave = isDirty && reason.trim().length > 0

  const handleSave = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await batchUpdateSessions([{
        id: sessionId,
        consent_status: selectedStatus,
        consent_override_reason: reason.trim(),
        consent_override_at: new Date().toISOString(),
      }])
      onStatusChanged(selectedStatus)
    } catch (err) {
      const message = err instanceof Error ? err.message : '동의 상태 변경에 실패했습니다'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [canSave, sessionId, selectedStatus, reason, onStatusChanged])

  const current = STATUS_CONFIG[currentStatus]

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="material-symbols-outlined text-base" style={{ color: '#f59e0b' }}>shield</span>
        <span className="text-xs font-medium text-white">동의 상태 변경</span>
        <span
          className="text-[9px] font-medium px-1.5 py-0.5 rounded ml-auto"
          style={{ backgroundColor: current.bgColor, color: current.color }}
        >
          현재: {current.label}
        </span>
      </div>

      {/* Status options */}
      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>변경할 상태</p>
          <div className="flex gap-1.5">
            {STATUS_OPTIONS.map(status => {
              const config = STATUS_CONFIG[status]
              const active = selectedStatus === status
              return (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className="text-[10px] px-3 py-1.5 rounded-lg transition-colors font-medium"
                  style={{
                    backgroundColor: active ? config.bgColor : 'rgba(255,255,255,0.06)',
                    color: active ? config.color : 'rgba(255,255,255,0.5)',
                    border: active ? `1px solid ${config.color}30` : '1px solid transparent',
                  }}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Reason (required) */}
        <div>
          <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            변경 사유 <span style={{ color: '#ef4444' }}>*</span>
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="변경 사유를 입력하세요 (필수)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-xs text-white outline-none resize-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </div>

        {error && (
          <p className="text-[10px]" style={{ color: '#ef4444' }}>{error}</p>
        )}
      </div>

      {/* Action */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full text-xs py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-30"
          style={{ backgroundColor: '#f59e0b' }}
        >
          {saving ? '저장 중...' : '동의 상태 변경'}
        </button>
      </div>
    </div>
  )
}
