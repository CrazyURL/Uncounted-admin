// 세션 펼침 영역 안의 PII 후보 검토 섹션 (PII-1B).
//
// 기본 큐(needs_human_decision + pending)를 세션 단위로 불러와, 후보별 최소 스니펫과
// 하이라이트를 보여주고 관리자가 [PII 맞음 / 아님 / 보류] 를 누른다.
// (후보 유형은 이름 외에 전화번호/계좌/IP 등도 들어올 수 있어 문구를 PII 일반으로 둔다.)
// 전용 페이지를 만들지 않고 기존 검수 펼침 영역에 부착한다.
//
// 안전: 전체 transcript_text 를 요청/표시하지 않는다(API 가 주는 최소 스니펫만 사용).
// candidate_text/snippet 을 console 로 출력하지 않는다.

import { useEffect, useState, useCallback } from 'react'
import { Badge, Button, useToast } from '../ui'
import { getPiiCandidates, decidePiiCandidate, promotePiiCandidate } from '../../lib/api/piiCandidates'
import type { PiiCandidate, PiiDecision } from '../../types/piiCandidate'
import { splitSnippetForHighlight } from '../../lib/pii/highlightSnippet'

const TIER_LABEL: Record<string, string> = {
  needs_human_decision: '판단 필요',
  auto_confirmed: '자동 확정',
  auto_rejected: '자동 제외',
}

const DECISION_TOAST: Record<PiiDecision, string> = {
  confirmed: 'PII로 확정했습니다',
  rejected: 'PII 아님으로 처리했습니다',
  skipped: '보류로 처리했습니다',
}

interface PiiCandidateReviewSectionProps {
  sessionId: string
}

export function PiiCandidateReviewSection({ sessionId }: PiiCandidateReviewSectionProps) {
  const toast = useToast()
  const [candidates, setCandidates] = useState<PiiCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getPiiCandidates({ sessionId }).then((res) => {
      if (!alive) return
      if (res.error) setError(res.error)
      else setCandidates(res.data ?? [])
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [sessionId])

  const decide = useCallback(
    async (id: string, decision: PiiDecision) => {
      setDecidingId(id)
      // 정책: confirmed = pii_annotations 로 승격(promote), rejected/skipped = 후보 테이블에만 기록(decision).
      // confirmed 를 여기서 promote 로 분기한다 — /decision 으로 보내면 확정 라벨(annotation)이 생성되지 않는다.
      const res =
        decision === 'confirmed'
          ? await promotePiiCandidate(id, 'confirmed')
          : await decidePiiCandidate(id, decision)
      if (res.error) {
        toast.error(`판정 저장 실패 — ${res.error}`)
      } else {
        toast.success(DECISION_TOAST[decision])
        // decided 후보는 큐에서 제거(기본 필터가 pending 만 노출 → 새로고침해도 유지)
        setCandidates((prev) => prev.filter((c) => c.id !== id))
      }
      setDecidingId(null)
    },
    [toast],
  )

  if (loading) {
    return <div className="px-4 py-2 text-xs text-txt-sub">PII 후보 확인 중…</div>
  }
  if (error) {
    return (
      <div className="px-4 py-2 text-xs text-danger border-b border-border-light">
        PII 후보를 불러오지 못했습니다: {error}
      </div>
    )
  }
  if (candidates.length === 0) return null

  return (
    <div className="px-4 py-3 border-b border-border-light bg-surface-alt">
      <div className="flex items-center gap-2 mb-2">
        <Badge tone="danger" size="sm">
          PII 후보
        </Badge>
        <span className="text-xs font-medium text-txt">
          관리자 판단이 필요한 후보 {candidates.length}건
        </span>
      </div>

      <ul className="space-y-2">
        {candidates.map((c) => {
          const parts = splitSnippetForHighlight(c.snippet, c.highlight_start, c.highlight_end)
          const busy = decidingId === c.id
          return (
            <li key={c.id} className="rounded-md border border-border-light bg-surface p-2">
              <div className="flex items-center gap-2 mb-1 text-xs">
                <span className="font-medium text-txt">유형: {c.predicted_type}</span>
                <span className="text-txt-sub">·</span>
                <span className="text-txt-sub">{TIER_LABEL[c.confidence_tier] ?? c.confidence_tier}</span>
              </div>

              <div className="text-sm text-txt mb-2 break-words">
                {parts ? (
                  <>
                    <span className="text-txt-sub">{parts.before}</span>
                    <mark className="bg-danger-dim text-danger font-semibold rounded px-0.5">
                      {parts.mark}
                    </mark>
                    <span className="text-txt-sub">{parts.after}</span>
                  </>
                ) : (
                  <span className="text-txt-tertiary italic">(주변 문맥 없음)</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy}
                  disabled={busy}
                  onClick={() => decide(c.id, 'confirmed')}
                >
                  PII 맞음
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide(c.id, 'rejected')}>
                  아님
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(c.id, 'skipped')}>
                  보류
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
