// 상태 표시 전용 Badge 래퍼
//
// labels.ts + design-tokens.ts 의 statusColor / reviewColor 와 정합.
// 페이지에서 직접 매핑 X — 본 컴포넌트만 사용.

import { Badge } from './Badge'
import { labels } from '../../lib/labels'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_TONE: Record<string, Tone> = {
  pending: 'neutral',
  running: 'accent',
  done: 'success',
  failed: 'danger',
}

const REVIEW_TONE: Record<string, Tone> = {
  pending: 'neutral',
  in_review: 'accent',
  approved: 'success',
  rejected: 'danger',
  needs_revision: 'warning',
}

const CONSENT_TONE: Record<string, Tone> = {
  none: 'neutral',
  user_only: 'warning',
  both_agreed: 'success',
  user_withdrew: 'danger',
  peer_withdrew: 'danger',
}

const GRADE_TONE: Record<string, Tone> = {
  premium: 'accent',
  standard: 'neutral',
  excluded: 'danger',
}

interface StatusBadgeProps {
  kind: 'status' | 'review' | 'consent' | 'grade'
  value: string | null | undefined
  size?: 'sm' | 'md'
}

export function StatusBadge({ kind, value, size = 'sm' }: StatusBadgeProps) {
  if (!value) return <Badge tone="neutral" size={size}>-</Badge>
  let tone: Tone = 'neutral'
  let label = value
  switch (kind) {
    case 'status': {
      tone = STATUS_TONE[value] ?? 'neutral'
      const map = labels.status as Record<string, string>
      label = map[value] ?? value
      break
    }
    case 'review': {
      tone = REVIEW_TONE[value] ?? 'neutral'
      const map = labels.review as Record<string, string>
      label = map[value] ?? value
      break
    }
    case 'consent': {
      tone = CONSENT_TONE[value] ?? 'neutral'
      const map = labels.consent as Record<string, string>
      label = map[value] ?? value
      break
    }
    case 'grade': {
      tone = GRADE_TONE[value] ?? 'neutral'
      const map = labels.grade as Record<string, string>
      label = map[value] ?? value
      break
    }
  }
  return (
    <Badge tone={tone} size={size}>
      {label}
    </Badge>
  )
}
