// ── 상태머신 — 공유/적합도 판정 ─────────────────────────────────────────────

import { type Session } from '../types/session'

// ── 공유 가능 여부 판정 ─────────────────────────────────────────────────────
export function canShare(session: Session): boolean {
  const pii = session.piiStatus ?? 'CLEAR'
  // LOCKED 세션은 공유 불가
  if (pii === 'LOCKED') return false
  // 이미 DO_NOT_SHARE 액션이면 불가
  if (session.reviewAction === 'DO_NOT_SHARE') return false
  return true
}

// ── eligible_for_share 재계산 ───────────────────────────────────────────────
export function calcEligibleForShare(session: Session): boolean {
  if (!canShare(session)) return false
  // 최소 품질 요건: qaScore >= 50 또는 duration >= 30s
  const qa = session.qaScore ?? 0
  if (qa < 50 && session.duration < 30) return false
  return true
}
