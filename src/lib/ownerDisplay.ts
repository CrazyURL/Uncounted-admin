import type { AdminSession } from '../types/adminSession'

type SessionWithOwner = AdminSession & { owner_speaker?: string; owner_confidence?: number }

export function getOwnerDisplay(session: AdminSession): string {
  const s = session as SessionWithOwner
  if (!s.owner_speaker) return '-'
  if (s.owner_speaker === 'unknown') return 'unknown'
  const label = s.owner_speaker === 'SPEAKER_00' ? 'S00' : 'S01'
  const conf = s.owner_confidence != null ? s.owner_confidence.toFixed(2) : '?'
  return `${label} ${conf}`
}
