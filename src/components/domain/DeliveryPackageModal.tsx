import { useEffect, useState } from 'react'
import { Button, Modal, Select } from '../ui'
import { fetchClients, createDelivery } from '../../lib/api/deliveries'
import type { DeliveryClient } from '../../lib/api/deliveries'
import { REVENUE_SHARE_RATIO } from './SessionDeliveryModal'
import type { ExportLog } from '../../types/admin'

interface Props {
  log: ExportLog
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type DeliveryResult = { sessionId: string; ok: boolean; error?: string }

const EXPORT_TYPE_LABEL: Record<ExportLog['export_type'], string> = {
  single: '단일',
  selected: '선택',
  all_filtered: '전체',
}

export function DeliveryPackageModal({ log, open, onClose, onSuccess }: Props) {
  const [clients, setClients] = useState<DeliveryClient[]>([])
  const [clientId, setClientId] = useState('')
  const [priceKrw, setPriceKrw] = useState('')
  const [notes, setNotes] = useState('')
  const [clientsLoading, setClientsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<DeliveryResult[] | null>(null)

  useEffect(() => {
    if (!open) return
    setClientId('')
    setPriceKrw('')
    setNotes('')
    setResults(null)
    setClientsLoading(true)
    fetchClients()
      .then((res) => { if (res.data) setClients(res.data) })
      .catch(() => {})
      .finally(() => setClientsLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const priceNum = parseInt(priceKrw.replace(/\D/g, ''), 10)
  const sessionCount = log.session_ids.length
  const totalPrice = !isNaN(priceNum) ? priceNum * sessionCount : 0
  const estimatedRevenue = Math.floor(totalPrice * REVENUE_SHARE_RATIO)
  const canSubmit = clientId !== '' && !isNaN(priceNum) && priceNum > 0 && !submitting && !results

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    const deliveryResults: DeliveryResult[] = []
    for (const sessionId of log.session_ids) {
      try {
        const res = await createDelivery({
          session_id: sessionId,
          client_id: clientId,
          price_krw: priceNum,
          notes: notes.trim() || undefined,
        })
        if (res.error) {
          deliveryResults.push({ sessionId, ok: false, error: res.error })
        } else {
          deliveryResults.push({ sessionId, ok: true })
        }
      } catch (err) {
        deliveryResults.push({
          sessionId,
          ok: false,
          error: err instanceof Error ? err.message : '알 수 없는 오류',
        })
      }
    }
    setResults(deliveryResults)
    setSubmitting(false)
    if (deliveryResults.every((r) => r.ok)) onSuccess()
  }

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }))
  const successCount = results?.filter((r) => r.ok).length ?? 0
  const failCount = results?.filter((r) => !r.ok).length ?? 0

  return (
    <Modal open={open} onClose={onClose} title="납품 패키지 등록">
      <div className="space-y-4 min-w-[400px]">
        <div className="p-3 bg-surface-alt rounded-lg text-sm space-y-1">
          <p className="text-txt-sub">
            내보내기 유형:{' '}
            <span className="text-txt">{EXPORT_TYPE_LABEL[log.export_type]}</span>
          </p>
          <p className="text-txt-sub">
            세션 수:{' '}
            <span className="text-txt font-medium">{sessionCount}건</span>
            {log.include_restricted && (
              <span className="ml-2 text-xs" style={{ color: '#f59e0b' }}>제한 포함</span>
            )}
          </p>
          <p className="text-xs text-txt-sub">
            {new Date(log.exported_at).toLocaleString('ko-KR')}
          </p>
        </div>

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
        </div>

        <div className="space-y-1">
          <label className="text-sm text-txt-sub">세션당 단가 (원)</label>
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
              총액 ₩{totalPrice.toLocaleString()} · 예상 수익 ₩{estimatedRevenue.toLocaleString()} (50:50 분배)
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

        {results && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{ background: failCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' }}
          >
            <p className="font-medium text-txt">
              성공 {successCount}건 / 실패 {failCount}건
            </p>
            {failCount > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs" style={{ color: '#ef4444' }}>
                {results.filter((r) => !r.ok).map((r) => (
                  <li key={r.sessionId}>
                    {r.sessionId.slice(0, 8)}… — {r.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {results ? '닫기' : '취소'}
          </Button>
          {!results && (
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? '등록 중…' : `${sessionCount}건 납품 등록`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
