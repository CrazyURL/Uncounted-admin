import { useEffect, useState } from 'react'
import { Button, Modal, Select, useToast } from '../ui'
import { fetchClients, createDelivery, checkDeliveryDuplicate } from '../../lib/api/deliveries'
import type { DeliveryClient } from '../../lib/api/deliveries'

export const REVENUE_SHARE_RATIO = 0.5

interface Props {
  sessionId: string
  sessionTitle: string | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SessionDeliveryModal({ sessionId, sessionTitle, open, onClose, onSuccess }: Props) {
  const toast = useToast()

  const [clients, setClients] = useState<DeliveryClient[]>([])
  const [clientId, setClientId] = useState('')
  const [priceKrw, setPriceKrw] = useState('')
  const [notes, setNotes] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setClientId('')
    setPriceKrw('')
    setNotes('')
    setDuplicateWarning(null)
    setClientsLoading(true)
    fetchClients()
      .then((res) => { if (res.data) setClients(res.data) })
      .catch(() => toast.error('납품처 목록을 불러오지 못했습니다.'))
      .finally(() => setClientsLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clientId) {
      setDuplicateWarning(null)
      return
    }
    checkDeliveryDuplicate(sessionId, clientId)
      .then((res) => {
        if (res.data?.duplicate) {
          const names = res.data.existingDeliveries.map((d) => d.client_name).join(', ')
          setDuplicateWarning(`이미 납품된 이력이 있습니다 (${names}).`)
        } else {
          setDuplicateWarning(null)
        }
      })
      .catch(() => setDuplicateWarning(null))
  }, [sessionId, clientId])

  const priceNum = parseInt(priceKrw.replace(/\D/g, ''), 10)
  const estimatedRevenue = !isNaN(priceNum) ? Math.floor(priceNum * REVENUE_SHARE_RATIO) : 0
  const canSubmit = clientId !== '' && !isNaN(priceNum) && priceNum > 0 && !loading

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    try {
      await createDelivery({
        session_id: sessionId,
        client_id: clientId,
        price_krw: priceNum,
        notes: notes.trim() || undefined,
      })
      toast.success('납품이 등록되었습니다.')
      onSuccess()
      onClose()
    } catch {
      toast.error('납품 등록에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }))

  return (
    <Modal open={open} onClose={onClose} title="납품 등록">
      <div className="space-y-4 min-w-[360px]">
        {sessionTitle && (
          <p className="text-sm text-txt-sub truncate">
            통화: <span className="text-txt font-medium">{sessionTitle}</span>
          </p>
        )}

        <div className="space-y-1">
          <label className="text-sm text-txt-sub">납품처</label>
          {clientsLoading ? (
            <div className="h-9 bg-surface-alt rounded animate-pulse" />
          ) : (
            <Select
              options={clientOptions}
              placeholder="납품처를 선택하세요"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          )}
          {duplicateWarning && (
            <p className="text-xs text-warning mt-1">⚠ {duplicateWarning}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm text-txt-sub">단가 (원)</label>
          <input
            type="text"
            inputMode="numeric"
            value={priceKrw}
            onChange={(e) => setPriceKrw(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="예: 50000"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-txt"
          />
          {!isNaN(priceNum) && priceNum > 0 && (
            <p className="text-xs text-txt-tertiary">
              예상 수익 ₩{estimatedRevenue.toLocaleString()} (50:50 분배)
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm text-txt-sub">라이선스 메모 (선택)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="납품 조건, 용도 제한 등"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-txt resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? '등록 중…' : '납품 등록'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
