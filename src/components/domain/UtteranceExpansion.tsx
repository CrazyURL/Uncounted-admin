import { useMemo } from 'react'
import { type AdminSession } from '../../types/adminSession'
import { type AdminUtterance } from '../../lib/api/utterances'
import { analyzeSessionRisk } from '../../lib/piiRisk'
import { UtteranceReviewRow } from './UtteranceReviewRow'
import { SessionReviewPanel } from './SessionReviewPanel'

interface UtteranceExpansionProps {
  session: AdminSession
  utterances: AdminUtterance[]
  selectedSet: Set<string>
  updatingId: string | null
  onToggleUtterance: (utteranceId: string) => void
  onSelectAll: () => void
  onToggleReview: (u: AdminUtterance) => void
  onLabelSaved: (id: string, updatedFields: Partial<AdminUtterance>) => void
}

export function UtteranceExpansion({
  session,
  utterances,
  selectedSet,
  updatingId,
  onToggleUtterance,
  onSelectAll,
  onToggleReview,
  onLabelSaved,
}: UtteranceExpansionProps) {
  const includable = utterances.filter((u) => u.review_status !== 'excluded')
  const allSelected = includable.length > 0 && selectedSet.size === includable.length
  const risk = useMemo(() => analyzeSessionRisk(utterances), [utterances])

  return (
    <div className="border-t border-border-light bg-surface-alt">
      <SessionReviewPanel session={session} />
      <div className="px-4 py-2 flex items-center gap-3 border-b border-border-light text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-txt-sub">전체 선택 (제외 제외 {includable.length}건)</span>
        </label>
        {session.review_status !== 'approved' && (
          <span className="text-warning text-xs">⚠ 통화 검수 미승인 — 납품 차단됩니다</span>
        )}
      </div>
      <div className="divide-y divide-border-light">
        {utterances.map((u) => (
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
    </div>
  )
}
