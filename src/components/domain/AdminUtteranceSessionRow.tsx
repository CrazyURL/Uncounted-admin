// 통화 단위 row + 펼침 (발화 목록)
//
// AdminUtterancesPage 의 핵심 UI 단위. 헤더 = 메타 + 파이프라인 + 검수 액션.
// 펼침 = 발화 목록 (UtteranceReviewRow). 발화 미생성 통화는 헤더만 표시.

import { useMemo } from 'react'
import { Badge, Card, StatusBadge } from '../ui'
import { type AdminSession, isPipelineComplete } from '../../types/adminSession'
import { type AdminUtterance } from '../../lib/api/utterances'
import { analyzeSessionRisk, type SessionRiskResult } from '../../lib/piiRisk'
import { SessionPipelineCells } from './SessionPipelineCells'
import {
  SessionReviewActions,
  type SessionReviewActionRequest,
} from './SessionReviewActions'
import { UtteranceReviewRow } from './UtteranceReviewRow'

export interface SessionGroup {
  sessionId: string
  session: AdminSession
  utterances: AdminUtterance[]
  totalUnitPriceKrw: number
  excludedCount: number
}

interface AdminUtteranceSessionRowProps {
  group: SessionGroup
  expanded: boolean
  selectedSet: Set<string>
  updatingId: string | null
  onToggleExpand: () => void
  onToggleUtterance: (utteranceId: string) => void
  onSelectAll: () => void
  onToggleReview: (u: AdminUtterance) => void
  onLabelSaved: (id: string, updatedFields: Partial<AdminUtterance>) => void
  onReviewAction: (req: SessionReviewActionRequest) => void
}

export function AdminUtteranceSessionRow({
  group,
  expanded,
  selectedSet,
  updatingId,
  onToggleExpand,
  onToggleUtterance,
  onSelectAll,
  onToggleReview,
  onLabelSaved,
  onReviewAction,
}: AdminUtteranceSessionRowProps) {
  const includable = group.utterances.filter((u) => u.review_status !== 'excluded')
  const allSelected = includable.length > 0 && selectedSet.size === includable.length
  const risk: SessionRiskResult = useMemo(
    () => analyzeSessionRisk(group.utterances),
    [group.utterances],
  )
  const segmentGroups = useMemo(() => {
    const groups: { segmentId: string | null; topic: string | null; utterances: AdminUtterance[] }[] = []
    for (const u of group.utterances) {
      const last = groups[groups.length - 1]
      if (last && last.segmentId === u.segment_id) {
        last.utterances.push(u)
      } else {
        groups.push({ segmentId: u.segment_id, topic: u.segment_topic, utterances: [u] })
      }
    }
    return groups
  }, [group.utterances])
  const sessionReview = group.session.review_status ?? 'pending'
  const hasUtterances = group.utterances.length > 0
  const pipelineComplete = isPipelineComplete(group.session)
  // 발화가 있으면 펼치기 허용. 파이프라인 미완 상태(예: 품질검증 진행 중)에도
  // 이미 생성된 발화의 검수/수정은 가능해야 함.
  const canExpand = hasUtterances

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header — 단일 button 대신 row 컨테이너 + 분리된 버튼들 */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors">
        {/* 펼침 토글 */}
        <button
          type="button"
          onClick={onToggleExpand}
          disabled={!canExpand}
          className="text-txt-sub disabled:opacity-30 hover:text-txt"
          aria-label={expanded ? '접기' : '펼치기'}
        >
          <span className="material-symbols-outlined text-base">
            {expanded ? 'expand_more' : 'chevron_right'}
          </span>
        </button>

        {/* 제목 + 메타 (펼침 토글) */}
        <button
          type="button"
          onClick={onToggleExpand}
          disabled={!canExpand}
          className="flex-1 min-w-0 text-left disabled:cursor-default"
        >
          <div className="font-medium text-txt truncate">
            {group.session.title || '(제목 없음)'}
          </div>
          <div className="text-xs text-txt-sub mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono">{group.sessionId.slice(0, 8)}…</span>
            <span>·</span>
            <span>{formatDurationCompact(group.session.duration_seconds)}</span>
            {hasUtterances ? (
              <>
                <span>·</span>
                <span>발화 {group.utterances.length}건</span>
                {group.excludedCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-warning">제외 {group.excludedCount}</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span>·</span>
                <span className="text-txt-tertiary">
                  {pipelineComplete ? '발화 미생성' : '처리 흐름 진행 중'}
                </span>
              </>
            )}
          </div>
        </button>

        {/* 파이프라인 5점 */}
        <div className="hidden md:block">
          <SessionPipelineCells session={group.session} />
        </div>

        {/* PII 의심 배지 */}
        {risk.level === 'high' && (
          <Badge tone="danger" size="sm" title={risk.reasons.join('\n')}>
            🚨 PII 의심
          </Badge>
        )}

        {/* 동의 + 검수 배지 */}
        <StatusBadge kind="consent" value={group.session.consent_status} />
        <StatusBadge kind="review" value={sessionReview} />

        {/* 예상 매출 */}
        {hasUtterances && (
          <span
            className="tabular-nums text-sm font-semibold text-txt whitespace-nowrap"
            title="시간당 ₩30,000 기준 · 확정 금액 아님 (검수·납품 후 결정)"
          >
            약 ₩{group.totalUnitPriceKrw.toLocaleString('ko-KR')}
          </span>
        )}

        {/* 검수 액션 버튼 */}
        <SessionReviewActions session={group.session} onAction={onReviewAction} />
      </div>

      {/* Expanded body */}
      {expanded && canExpand && (
        <div className="border-t border-border-light bg-surface-alt">
          <div className="px-4 py-2 flex items-center gap-3 border-b border-border-light text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-txt-sub">
                전체 선택 (제외 제외 {includable.length}건)
              </span>
            </label>
            {sessionReview !== 'approved' && (
              <span className="text-warning text-xs">
                ⚠ 통화 검수 미승인 — 납품 차단됩니다
              </span>
            )}
          </div>

          <div className="divide-y divide-border-light">
            {segmentGroups.map((seg, idx) => (
              <div key={seg.segmentId ?? `no-seg-${idx}`}>
                {seg.segmentId && (
                  <div className="px-4 py-1 bg-bg-hover border-b border-border-light flex items-center gap-2">
                    <span className="text-[10px] text-txt-sub font-medium uppercase tracking-wide">
                      세그먼트 {idx + 1}
                    </span>
                    {seg.topic && (
                      <span className="text-xs text-txt-sub">{seg.topic}</span>
                    )}
                  </div>
                )}
                {seg.utterances.map((u) => (
                  <UtteranceReviewRow
                    key={u.id}
                    utterance={u}
                    checked={selectedSet.has(u.id)}
                    included={u.review_status === 'pending'}
                    busy={updatingId === u.id}
                    isDanger={risk.dangerUttIds.has(u.id)}
                    onToggleSelect={() => onToggleUtterance(u.id)}
                    onToggleReview={() => onToggleReview(u)}
                    onLabelSaved={onLabelSaved}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function formatDurationCompact(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}
