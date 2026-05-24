// 발화 단위 납품 품질 검수 컨트롤 (저품질 검수 큐 액션)
// 배지 + 5개 액션 버튼(제외/예외 포함/자막 수정/PII 처리/재처리). 제외 시 사유 선택.
//
// ⚠️ 일반 review_status(포함/제외 토글)와 직교. 여기서는 quality_review_status 만 변경한다.
// 백엔드 list select 에 quality_review_status 미포함 시에도 동작 — optimistic 로컬 상태 사용.

import { useState } from 'react'
import {
  updateUtteranceQualityReview,
  type AdminUtterance,
  type QualityReviewStatus,
  type QualityExclusionReason,
} from '../../lib/api/utterances'

const STATUS_BADGE: Record<
  Exclude<QualityReviewStatus, 'pending'>,
  { label: string; cls: string }
> = {
  approved_exception: { label: '예외 포함', cls: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
  excluded_low_quality: { label: '제외', cls: 'text-red-700 bg-red-50 border-red-300' },
  needs_transcript_edit: { label: '자막 수정', cls: 'text-orange-700 bg-orange-50 border-orange-300' },
  needs_pii_masking: { label: 'PII 처리', cls: 'text-purple-700 bg-purple-50 border-purple-300' },
  needs_retranscription: { label: '재처리', cls: 'text-blue-700 bg-blue-50 border-blue-300' },
}

const EXCLUSION_REASONS: { value: QualityExclusionReason; label: string }[] = [
  { value: 'noisy', label: '잡음' },
  { value: 'too_short', label: '너무 짧음' },
  { value: 'clipped', label: '클리핑(잘림)' },
  { value: 'unintelligible', label: '알아들을 수 없음' },
  { value: 'wrong_transcript', label: '전사 오류' },
  { value: 'pii_unresolved', label: 'PII 미해결' },
  { value: 'duplicate', label: '중복' },
  { value: 'other', label: '기타' },
]

// 버튼 → status 매핑 (설계 §3.3)
const ACTIONS: { status: QualityReviewStatus; label: string; reason?: QualityExclusionReason }[] = [
  { status: 'excluded_low_quality', label: '제외' },
  { status: 'approved_exception', label: '예외 포함' },
  { status: 'needs_transcript_edit', label: '자막 수정', reason: 'wrong_transcript' },
  { status: 'needs_pii_masking', label: 'PII 처리', reason: 'pii_unresolved' },
  { status: 'needs_retranscription', label: '재처리 요청' },
]

interface Props {
  utterance: AdminUtterance
  /** 저장 성공 시 부모 낙관 업데이트용 (선택) */
  onUpdated?: (id: string, status: QualityReviewStatus, reason: QualityExclusionReason | null) => void
}

export function UtteranceQualityReviewControls({ utterance, onUpdated }: Props) {
  const [status, setStatus] = useState<QualityReviewStatus>(
    utterance.quality_review_status ?? 'pending',
  )
  const [open, setOpen] = useState(false)
  const [pendingExclude, setPendingExclude] = useState(false)
  const [reason, setReason] = useState<QualityExclusionReason>('noisy')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async (next: QualityReviewStatus, nextReason?: QualityExclusionReason) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const prev = status
    setStatus(next) // optimistic
    const res = await updateUtteranceQualityReview(utterance.id, {
      status: next,
      reason: nextReason ?? null,
    })
    setBusy(false)
    if (res.error) {
      setStatus(prev) // rollback
      setError(res.error)
      return
    }
    setOpen(false)
    setPendingExclude(false)
    onUpdated?.(utterance.id, next, nextReason ?? null)
  }

  const badge = status !== 'pending' ? STATUS_BADGE[status] : null

  return (
    <div className="mt-1.5 ml-10 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-txt-sub">품질 검수</span>

      {badge ? (
        <span className={['px-1.5 py-0.5 rounded border font-medium', badge.cls].join(' ')}>
          {badge.label}
        </span>
      ) : (
        <span className="px-1.5 py-0.5 rounded border border-border-soft text-txt-sub">미검수</span>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p)
          setPendingExclude(false)
        }}
        className="px-1.5 py-0.5 rounded border border-border-soft hover:bg-bg-hover text-txt-sub"
      >
        {open ? '▲ 닫기' : '판정 ▾'}
      </button>

      {status !== 'pending' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => apply('pending')}
          className="px-1.5 py-0.5 rounded border border-border-soft hover:bg-bg-hover text-txt-sub disabled:opacity-40"
          title="검수 판정 초기화"
        >
          초기화
        </button>
      )}

      {error && <span className="text-red-600">{error}</span>}

      {open && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.status}
              type="button"
              disabled={busy}
              onClick={() => {
                if (a.status === 'excluded_low_quality') {
                  setPendingExclude(true) // 사유 선택 후 확정
                  return
                }
                apply(a.status, a.reason)
              }}
              className={[
                'px-2 py-1 rounded border transition-colors disabled:opacity-40',
                a.status === 'excluded_low_quality'
                  ? 'border-red-300 text-red-600 hover:bg-red-50'
                  : 'border-border-soft hover:bg-bg-hover text-txt-sub',
              ].join(' ')}
            >
              {a.label}
            </button>
          ))}

          {pendingExclude && (
            <span className="inline-flex items-center gap-1.5">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as QualityExclusionReason)}
                disabled={busy}
                className="px-1.5 py-1 rounded border border-border-soft bg-surface text-txt"
              >
                {EXCLUSION_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => apply('excluded_low_quality', reason)}
                className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 font-medium"
              >
                {busy ? '...' : '제외 확정'}
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
