// ── Speaker Verification Integration ──────────────────────────────────────
// 화자 인증 결과를 세션에 반영: verifiedSpeaker + consentStatus 전환
// 통신비밀보호법 준수: 본인 인증 → consentStatus 'locked' → 'user_only'

import { type Session, type ConsentStatus } from '../types/session'
import { verifySession, isEnrolled, getVerificationResult } from './embeddingEngine'
import { loadAllSessions, saveAllSessions } from './sessionMapper'

// ── 파일 경로 해석 (callRecordId 또는 uncounted_file_paths 폴백) ─────────

const FILE_PATHS_KEY = 'uncounted_file_paths'

function resolveCallRecordId(session: Session): string | null {
  if (session.callRecordId) return session.callRecordId
  try {
    const paths: Record<string, string> = JSON.parse(
      localStorage.getItem(FILE_PATHS_KEY) ?? '{}',
    )
    return paths[session.id] ?? null
  } catch {
    return null
  }
}

// ── 세션 화자 검증 + 상태 전환 ──────────────────────────────────────────────

/**
 * 단일 세션의 화자를 검증하고 verifiedSpeaker + consentStatus를 업데이트.
 * 이미 검증된 세션은 스킵.
 * @returns 업데이트된 세션
 */
export async function verifyAndUpdateSession(
  session: Session,
): Promise<Session> {
  // 이미 인증된 세션은 스킵
  if (session.verifiedSpeaker) return session

  // 등록되지 않은 상태면 스킵
  if (!isEnrolled()) return session

  // callRecordId 해석 (세션 직접 or uncounted_file_paths 폴백)
  const callRecordId = resolveCallRecordId(session)
  if (!callRecordId) return session

  // 캐시된 결과 확인
  const cached = getVerificationResult(session.id)
  if (cached) {
    return applyVerificationResult(session, cached.isVerified)
  }

  try {
    const result = await verifySession(session.id, callRecordId)
    return applyVerificationResult(session, result.isVerified)
  } catch {
    // 검증 실패 — 현재 상태 유지
    return session
  }
}

/**
 * 검증 결과를 세션에 적용.
 * - isVerified=true → verifiedSpeaker=true, consentStatus='user_only' (최소)
 * - isVerified=false → verifiedSpeaker=false, consentStatus 변경 없음
 */
function applyVerificationResult(
  session: Session,
  isVerified: boolean,
): Session {
  if (!isVerified) return session

  const currentConsent = session.consentStatus ?? 'locked'
  // 'both_agreed'면 유지 (더 높은 수준), 아니면 'user_only'로 상승
  const newConsent: ConsentStatus =
    currentConsent === 'both_agreed' ? 'both_agreed' : 'user_only'

  return {
    ...session,
    verifiedSpeaker: true,
    consentStatus: newConsent,
  }
}

// ── 배치 검증 ───────────────────────────────────────────────────────────────

/**
 * 여러 세션의 화자를 순차 검증하고 결과를 저장.
 * @param sessions 검증 대상 세션 목록
 * @param onProgress 진행 콜백 (done, total)
 * @returns 업데이트된 세션 목록
 */
export async function batchVerifySessions(
  sessions: Session[],
  onProgress?: (done: number, total: number) => void,
): Promise<Session[]> {
  if (!isEnrolled()) return sessions

  const targets = sessions.filter(
    (s) => !s.verifiedSpeaker && resolveCallRecordId(s),
  )

  if (targets.length === 0) return sessions

  const resultMap = new Map<string, Session>()
  let done = 0

  for (const s of targets) {
    try {
      const updated = await verifyAndUpdateSession(s)
      resultMap.set(s.id, updated)
    } catch {
      // 개별 실패 무시
    }
    done++
    onProgress?.(done, targets.length)
  }

  return sessions.map((s) => resultMap.get(s.id) ?? s)
}

/**
 * 전체 세션 로드 → 미검증 세션 자동 검증 → 저장.
 * 파이프라인/백그라운드에서 호출.
 */
export async function autoVerifyAllSessions(
  onProgress?: (done: number, total: number) => void,
): Promise<{ verified: number; total: number }> {
  if (!isEnrolled()) return { verified: 0, total: 0 }

  const sessions = await loadAllSessions()
  const updated = await batchVerifySessions(sessions, onProgress)

  const verifiedCount = updated.filter((s) => s.verifiedSpeaker).length
  const prevCount = sessions.filter((s) => s.verifiedSpeaker).length

  // 변경이 있으면 저장
  if (verifiedCount > prevCount) {
    await saveAllSessions(updated)
  }

  return { verified: verifiedCount, total: sessions.length }
}
