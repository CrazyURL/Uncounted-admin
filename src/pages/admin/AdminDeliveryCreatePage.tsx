import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  ConfirmDialog,
  ErrorBanner,
  Input,
  Select,
  useToast,
  type SelectOption,
} from '../../components/ui'
import { labels } from '../../lib/labels'
import {
  fetchClients,
  fetchApprovedSessions,
  checkDeliveryDuplicate,
  createDelivery,
  type DeliveryClient,
  type DeliveryDuplicateCheckResult,
} from '../../lib/api/deliveries'

interface ApprovedSession {
  id: string
  title: string | null
  duration_seconds: number
  consent_status: string
}

export default function AdminDeliveryCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [clients, setClients] = useState<DeliveryClient[]>([])
  const [sessions, setSessions] = useState<ApprovedSession[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState('')
  const [clientId, setClientId] = useState('')
  const [priceKrw, setPriceKrw] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')

  const [duplicateCheck, setDuplicateCheck] = useState<DeliveryDuplicateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadInitial = useCallback(async () => {
    setLoadError(null)
    const [c, s] = await Promise.all([fetchClients(), fetchApprovedSessions(search || undefined)])
    if (c.error) setLoadError(c.error)
    else setClients(c.data ?? [])
    if (s.error && !c.error) setLoadError(s.error)
    else setSessions(s.data ?? [])
  }, [search])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // 사용자가 (session, client) 모두 선택하면 중복 검증
  useEffect(() => {
    if (!sessionId || !clientId) {
      setDuplicateCheck(null)
      return
    }
    let cancelled = false
    setChecking(true)
    checkDeliveryDuplicate(sessionId, clientId).then((res) => {
      if (cancelled) return
      setChecking(false)
      if (!res.error) setDuplicateCheck(res.data ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, clientId])

  const sessionOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: '— 통화 선택 —' },
      ...sessions.map((s) => ({
        value: s.id,
        label: `${s.title || '(제목 없음)'} · ${formatDur(s.duration_seconds)} · ${s.id.slice(0, 8)}`,
      })),
    ],
    [sessions],
  )

  const clientOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: '— 매수자 선택 —' },
      ...clients
        .filter((c) => c.active !== false)
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients],
  )

  const priceNumber = useMemo(() => {
    const n = parseInt(priceKrw.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }, [priceKrw])

  const isDuplicateBlocked = duplicateCheck?.duplicate === true
  const isCrossClient = duplicateCheck?.alreadyDeliveredToOthers === true && !isDuplicateBlocked

  const canSubmit =
    sessionId !== '' &&
    clientId !== '' &&
    priceNumber > 0 &&
    !isDuplicateBlocked &&
    !checking

  const onConfirm = async () => {
    setSubmitting(true)
    const res = await createDelivery({
      session_id: sessionId,
      client_id: clientId,
      price_krw: priceNumber,
      notes: notes || undefined,
    })
    setSubmitting(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(labels.toast.delivered)
    setConfirmOpen(false)
    navigate('/admin/transactions')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-txt">{labels.noun.delivery} 등록</h1>
        <p className="mt-1 text-sm text-txt-sub">
          {labels.noun.nonexclusive} 라이선스 — 같은 매수자에는 1회만, 다른 매수자에는 추가 납품 가능합니다.
        </p>
      </header>

      {loadError && <ErrorBanner message={loadError} onRetry={loadInitial} />}

      <Card>
        <CardHeader title="1. 통화 선택" description="검수 승인된 통화 중에서 선택합니다." />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="검색"
              placeholder="제목 또는 세션 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="통화"
              value={sessionId}
              options={sessionOptions}
              onChange={(e) => setSessionId(e.target.value)}
              hint={`${sessions.length}건의 승인된 통화`}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. 매수자 선택" description="활성 매수자만 표시됩니다." />
        <CardBody>
          <Select
            label="매수자"
            value={clientId}
            options={clientOptions}
            onChange={(e) => setClientId(e.target.value)}
          />

          {/* 중복 검증 결과 */}
          {sessionId && clientId && (
            <div className="mt-4">
              {checking && <p className="text-sm text-txt-sub">중복 여부 확인 중…</p>}
              {!checking && isDuplicateBlocked && (
                <div className="rounded-lg bg-danger-dim border border-danger/30 p-3">
                  <div className="font-semibold text-danger">{labels.error.duplicateDelivery}</div>
                  <p className="mt-1 text-sm text-txt-sub">
                    동일 매수자에게 이미 납품된 통화입니다. 비배타적 라이선스 정책상 동일 매수자에 대한 추가 납품은
                    차단됩니다.
                  </p>
                </div>
              )}
              {!checking && isCrossClient && (
                <div className="rounded-lg bg-warning-dim border border-warning/30 p-3">
                  <div className="font-semibold text-warning">
                    이미 다른 매수자에 납품된 데이터입니다
                  </div>
                  <p className="mt-1 text-sm text-txt-sub">
                    {labels.noun.nonexclusive} 라이선스로 추가 납품 가능합니다. 진행 시 확인 모달이 표시됩니다.
                  </p>
                  {duplicateCheck && (
                    <ul className="mt-2 text-xs text-txt-sub list-disc list-inside">
                      {duplicateCheck.existingDeliveries.map((d, i) => (
                        <li key={i}>
                          {d.client_name} — {new Date(d.delivered_at).toLocaleDateString('ko-KR')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!checking && duplicateCheck && !isDuplicateBlocked && !isCrossClient && (
                <div className="rounded-lg bg-success-dim border border-success/30 p-3">
                  <div className="font-semibold text-success">납품 가능 — 첫 매수자입니다</div>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="3. 매출 금액" description="원 단위로 입력하면 사용자 50% / 플랫폼 50% 분배가 즉시 계산됩니다." />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="매출 (원)"
              type="text"
              inputMode="numeric"
              placeholder="예: 1,500,000"
              value={priceKrw}
              onChange={(e) => setPriceKrw(e.target.value)}
              hint={priceNumber > 0 ? `₩${priceNumber.toLocaleString('ko-KR')}` : undefined}
            />
            <Input
              label="비고 (선택)"
              placeholder="내부 메모"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* 50:50 분배 프리뷰 (STAGE 13) */}
          {priceNumber > 0 && (
            <div className="mt-3 rounded-lg p-3 text-sm bg-surface-alt border border-border-light">
              <div className="text-xs text-txt-sub mb-2">정산 분배 (50:50)</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-txt-sub text-xs">사용자 수익</span>
                  <div className="font-semibold text-txt tabular-nums">
                    ₩{(priceNumber - Math.floor(priceNumber * 0.5)).toLocaleString('ko-KR')}
                  </div>
                </div>
                <div>
                  <span className="text-txt-sub text-xs">플랫폼 수익</span>
                  <div className="font-semibold text-txt tabular-nums">
                    ₩{Math.floor(priceNumber * 0.5).toLocaleString('ko-KR')}
                  </div>
                </div>
                <div>
                  <span className="text-txt-sub text-xs">총 매출</span>
                  <div className="font-semibold text-txt tabular-nums">
                    ₩{priceNumber.toLocaleString('ko-KR')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {labels.action.cancel}
        </Button>
        <Button
          variant="primary"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSubmit}
        >
          {labels.action.deliver} {priceNumber > 0 && `(₩${priceNumber.toLocaleString('ko-KR')})`}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onConfirm}
        title={`${labels.noun.delivery} 확인`}
        body={
          isCrossClient
            ? labels.confirm.deliverDuplicateBody
            : labels.confirm.deliverBody
        }
        confirmLabel={labels.action.deliver}
        variant="primary"
        loading={submitting}
      />
    </div>
  )
}

function formatDur(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}
