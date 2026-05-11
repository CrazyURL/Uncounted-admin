// ── DeliveryDialog — 발화 단위 다중 세션 납품 다이얼로그 ─────────────────
// BM v10 STAGE 4-6.
//
// 입력:
//   - 선택된 발화 (sessionId 별 그루핑된 형태)
//   - 각 세션의 review_status (approved 필수 — 백엔드 가드)
//
// 동작:
//   1. 다이얼로그 열림 → clients 가져오기
//   2. client 선택 → checkUtterancesDuplicate 호출 → 이미 그 client 에 납품된 발화 표시
//   3. Submit → 세션별 POST /deliveries (가격 균등 분할)
//   4. 성공/실패 집계 → 토스트
//
// 제약:
//   - utterance_deliveries.UNIQUE(utterance_id, client_id) — 같은 발화를 같은 client 에 두 번 납품 불가.
//     사전 checkUtterancesDuplicate 로 차단 (그래도 backend 409 가능).
//   - 마이그 061 이후 deliveries 자체에는 (session_id, client_id) UNIQUE 없음.
//     같은 세션의 발화를 분할해 같은 client 에 여러 번 납품 허용.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Button, Select, Input, type SelectOption } from '../ui'
import {
  createDelivery,
  fetchClients,
  checkUtterancesDuplicate,
  type DeliveryClient,
} from '../../lib/api/deliveries'

export interface SelectedUtterance {
  sessionId: string
  sessionTitle: string | null
  reviewStatusOfSession: string  // 'approved' 가 아니면 차단
  utteranceId: string
}

interface Props {
  open: boolean
  onClose: () => void
  selected: SelectedUtterance[]  // 페이지에서 누적된 선택 목록
  onSuccess: () => void  // 납품 완료 후 페이지 새로고침 트리거
}

export function DeliveryDialog({ open, onClose, selected, onSuccess }: Props) {
  const [clients, setClients] = useState<DeliveryClient[] | null>(null)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string>('')
  const [priceKrw, setPriceKrw] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set())
  const [dupChecking, setDupChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: number; fail: number; messages: string[] } | null>(
    null,
  )

  // 세션 단위 그루핑 — 한 deliveries 레코드는 한 세션에 귀속. 같은 세션의 다중 발화는 utterance_ids 로 묶음.
  const grouped = useMemo(() => {
    const map = new Map<string, SelectedUtterance[]>()
    for (const u of selected) {
      const arr = map.get(u.sessionId) ?? []
      arr.push(u)
      map.set(u.sessionId, arr)
    }
    return Array.from(map.entries()).map(([sid, list]) => ({
      sessionId: sid,
      sessionTitle: list[0]?.sessionTitle ?? null,
      reviewStatus: list[0]?.reviewStatusOfSession ?? 'pending',
      utterances: list,
    }))
  }, [selected])

  const notApproved = grouped.filter((g) => g.reviewStatus !== 'approved')

  // 다이얼로그 열림 → clients fetch
  useEffect(() => {
    if (!open) return
    setClients(null)
    setClientsError(null)
    setClientId('')
    setPriceKrw('')
    setNotes('')
    setDuplicates(new Set())
    setResult(null)
    fetchClients().then((res) => {
      if (res.error) setClientsError(res.error)
      else setClients(res.data ?? [])
    })
  }, [open])

  // client 선택 변경 → 중복 사전 체크
  useEffect(() => {
    if (!open || !clientId || selected.length === 0) {
      setDuplicates(new Set())
      return
    }
    setDupChecking(true)
    const ids = selected.map((s) => s.utteranceId)
    checkUtterancesDuplicate(clientId, ids).then((res) => {
      setDupChecking(false)
      if (res.error) {
        setDuplicates(new Set())
        return
      }
      const dup = new Set((res.data?.duplicates ?? []).map((d) => d.utterance_id))
      setDuplicates(dup)
    })
  }, [open, clientId, selected])

  const clientOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: clients ? '매수자 선택' : '불러오는 중...' },
      ...(clients ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients],
  )

  // 중복 제외한 실제 납품 대상
  const sendableGrouped = useMemo(
    () =>
      grouped
        .filter((g) => g.reviewStatus === 'approved')
        .map((g) => ({
          ...g,
          utterances: g.utterances.filter((u) => !duplicates.has(u.utteranceId)),
        }))
        .filter((g) => g.utterances.length > 0),
    [grouped, duplicates],
  )

  const totalSendable = sendableGrouped.reduce((sum, g) => sum + g.utterances.length, 0)
  const priceNum = parseInt(priceKrw, 10)
  const priceValid = !isNaN(priceNum) && priceNum >= 0
  const canSubmit =
    !submitting && !dupChecking && clientId && priceValid && totalSendable > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !clients) return
    setSubmitting(true)

    // 세션 균등 분할 가격
    const pricePerSession = Math.floor(priceNum / sendableGrouped.length)

    let ok = 0
    let fail = 0
    const messages: string[] = []

    for (const g of sendableGrouped) {
      const res = await createDelivery({
        session_id: g.sessionId,
        client_id: clientId,
        price_krw: pricePerSession,
        notes: notes || undefined,
        utterance_ids: g.utterances.map((u) => u.utteranceId),
      })
      if (res.error) {
        fail += 1
        messages.push(`세션 ${g.sessionId.slice(0, 8)}…: ${res.error}`)
      } else {
        ok += 1
      }
    }

    setSubmitting(false)
    setResult({ ok, fail, messages })
    if (ok > 0) onSuccess()
  }, [canSubmit, clients, clientId, notes, priceNum, sendableGrouped, onSuccess])

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="선택 발화 납품"
      size="lg"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>닫기</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>취소</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
              {submitting ? '납품 중...' : `${totalSendable}건 납품`}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {/* 선택 요약 */}
        <div className="text-sm text-txt-sub">
          선택된 발화 <span className="font-semibold text-txt">{selected.length}</span>건 ·{' '}
          통화 <span className="font-semibold text-txt">{grouped.length}</span>개
        </div>

        {/* 검수 미승인 통화 경고 */}
        {notApproved.length > 0 && (
          <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'rgba(251,191,36,0.1)', color: '#d97706' }}>
            ⚠ 검수 미승인 통화 {notApproved.length}개 — 납품 차단됩니다. 검수 페이지에서 먼저 승인하세요:
            <ul className="mt-1 ml-3 list-disc">
              {notApproved.slice(0, 5).map((g) => (
                <li key={g.sessionId}>{g.sessionTitle || g.sessionId.slice(0, 8)} ({g.reviewStatus})</li>
              ))}
              {notApproved.length > 5 && <li>외 {notApproved.length - 5}개</li>}
            </ul>
          </div>
        )}

        {/* clients fetch 에러 */}
        {clientsError && (
          <div className="rounded-lg p-3 text-xs text-danger bg-danger/10">
            매수자 목록 로드 실패: {clientsError}
          </div>
        )}

        {/* client 선택 */}
        <Select
          label="매수자"
          value={clientId}
          options={clientOptions}
          onChange={(e) => setClientId(e.target.value)}
          disabled={!clients || submitting}
        />

        {/* 중복 사전 안내 */}
        {clientId && (
          <div className="rounded-lg p-3 text-xs" style={{
            backgroundColor: duplicates.size > 0 ? 'rgba(96,165,250,0.1)' : 'rgba(34,197,94,0.08)',
            color: duplicates.size > 0 ? '#2563eb' : '#16a34a',
          }}>
            {dupChecking ? (
              <>중복 확인 중...</>
            ) : duplicates.size > 0 ? (
              <>
                이미 이 매수자에 납품된 발화 <span className="font-semibold">{duplicates.size}건</span>이 있어
                <span className="font-semibold"> 자동 제외</span>됩니다. 나머지 <span className="font-semibold">{totalSendable}건</span> 진행.
              </>
            ) : (
              <>중복 발화 없음 — 선택한 발화 모두 신규 납품 대상입니다.</>
            )}
          </div>
        )}

        {/* 가격 */}
        <Input
          label={`금액 (세션 ${sendableGrouped.length || grouped.length}개 균등 분할)`}
          placeholder="0"
          type="number"
          value={priceKrw}
          onChange={(e) => setPriceKrw(e.target.value.replace(/[^0-9]/g, ''))}
          disabled={submitting}
        />

        {/* 메모 */}
        <Input
          label="메모 (선택)"
          placeholder="납품처 내부 메모"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
        />

        {/* 결과 */}
        {result && (
          <div className="rounded-lg p-3 text-sm" style={{
            backgroundColor: result.fail > 0 ? 'rgba(248,113,113,0.1)' : 'rgba(34,197,94,0.1)',
            color: result.fail > 0 ? '#dc2626' : '#16a34a',
          }}>
            <div>완료: 성공 {result.ok}건 / 실패 {result.fail}건</div>
            {result.messages.length > 0 && (
              <ul className="mt-2 ml-3 list-disc text-xs">
                {result.messages.slice(0, 8).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
                {result.messages.length > 8 && <li>외 {result.messages.length - 8}개</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
