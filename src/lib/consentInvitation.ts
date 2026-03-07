// ── Phase 4: 상대방 동의 초대 시스템 ──────────────────────────────────────────
// 통신비밀보호법 준수: 통화 상대방이 동의해야 전체 음성 판매 가능 (both_agreed)
// 카카오톡/SMS 등 Web Share API → 딥링크 → PeerConsentPage 진입
// 저장 금지: 상대방 전화번호, 이름 등 PII

import { generateUUID } from './uuid'

// ── 타입 ────────────────────────────────────────────────────────────────────

/** 초대 상태 */
export type InvitationStatus = 'pending' | 'sent' | 'opened' | 'agreed' | 'declined' | 'expired'

/** 초대 레코드 (로컬 저장) */
export type ConsentInvitation = {
  id: string                    // 고유 초대 ID (UUID)
  sessionId: string             // 대상 세션
  userId: string                // 초대 보낸 사용자 pseudoId
  status: InvitationStatus
  createdAt: string             // ISO
  sentAt: string | null         // 공유 실행 시각
  respondedAt: string | null    // 상대방 응답 시각
  expiresAt: string             // 생성 후 7일
  token: string                 // 짧은 공유용 토큰 (URL-safe)
  shareMethod: 'web_share' | 'clipboard' | null
}

/** 공유 링크에 포함될 최소 정보 (PII 없음) */
export type SharePayload = {
  token: string
  sessionId: string
  userId: string
  sessionDate: string           // day bucket만 (YYYY-MM-DD)
  sessionDurationMin: number    // 분 단위 (반올림)
}

// ── 상수 ────────────────────────────────────────────────────────────────────

const INVITATIONS_KEY = 'uncounted_consent_invitations'
const INVITATION_EXPIRY_DAYS = 7

// 앱 호스트 (Capacitor WebView에서는 localhost, 웹에서는 실제 도메인)
function getAppHost(): string {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin
  }
  return 'https://app.uncounted.kr'
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
}

function getPseudoId(): string {
  let pid = localStorage.getItem('uncounted_pseudo_id')
  if (!pid) {
    pid = generateUUID()
    localStorage.setItem('uncounted_pseudo_id', pid)
  }
  return pid
}

// ── localStorage CRUD ───────────────────────────────────────────────────────

function loadInvitations(): ConsentInvitation[] {
  try {
    const raw = localStorage.getItem(INVITATIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveInvitations(invitations: ConsentInvitation[]): void {
  // 최대 500건 유지
  if (invitations.length > 500) invitations.splice(0, invitations.length - 500)
  localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invitations))
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * 세션에 대한 동의 초대를 생성.
 * 이미 pending/sent 상태의 초대가 있으면 기존 것을 반환.
 */
export function createInvitation(sessionId: string, _sessionDate: string, _durationSec: number): ConsentInvitation {
  const invitations = loadInvitations()

  // 기존 유효 초대 확인
  const existing = invitations.find(
    (inv) => inv.sessionId === sessionId && ['pending', 'sent'].includes(inv.status)
      && new Date(inv.expiresAt).getTime() > Date.now()
  )
  if (existing) return existing

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  const invitation: ConsentInvitation = {
    id: generateUUID(),
    sessionId,
    userId: getPseudoId(),
    status: 'pending',
    createdAt: now.toISOString(),
    sentAt: null,
    respondedAt: null,
    expiresAt: expiresAt.toISOString(),
    token: generateToken(),
    shareMethod: null,
  }

  invitations.push(invitation)
  saveInvitations(invitations)
  return invitation
}

/**
 * 공유 링크 URL 생성 (PII 미포함).
 */
export function buildShareUrl(invitation: ConsentInvitation, sessionDate: string, durationSec: number): string {
  const host = getAppHost()
  const params = new URLSearchParams({
    t: invitation.token,
    s: invitation.sessionId,
    d: sessionDate,
    m: String(Math.round(durationSec / 60)),
  })
  return `${host}/peer-consent?${params.toString()}`
}

/**
 * Web Share API로 상대방에게 동의 요청 공유.
 * fallback: 클립보드 복사.
 */
export async function shareInvitation(
  invitation: ConsentInvitation,
  sessionDate: string,
  durationSec: number,
): Promise<{ method: 'web_share' | 'clipboard'; success: boolean }> {
  const url = buildShareUrl(invitation, sessionDate, durationSec)
  const durationMin = Math.round(durationSec / 60)

  const shareData: ShareData = {
    title: '통화 녹음 데이터 동의 요청',
    text: `${sessionDate}에 진행한 ${durationMin}분 통화 녹음의 데이터 공유 동의를 요청드립니다. 아래 링크를 눌러 확인해주세요.`,
    url,
  }

  // Web Share API 시도
  if (navigator.share) {
    try {
      await navigator.share(shareData)
      updateInvitationStatus(invitation.id, 'sent', 'web_share')
      return { method: 'web_share', success: true }
    } catch {
      // 사용자가 공유 취소 — clipboard fallback
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(`${shareData.text}\n${url}`)
    updateInvitationStatus(invitation.id, 'sent', 'clipboard')
    return { method: 'clipboard', success: true }
  } catch {
    return { method: 'clipboard', success: false }
  }
}

/**
 * 초대 상태 업데이트.
 */
export function updateInvitationStatus(
  invitationId: string,
  status: InvitationStatus,
  shareMethod?: 'web_share' | 'clipboard',
): void {
  const invitations = loadInvitations()
  const idx = invitations.findIndex((inv) => inv.id === invitationId)
  if (idx === -1) return

  invitations[idx] = {
    ...invitations[idx],
    status,
    ...(status === 'sent' && { sentAt: new Date().toISOString() }),
    ...((['agreed', 'declined'] as InvitationStatus[]).includes(status) && { respondedAt: new Date().toISOString() }),
    ...(shareMethod && { shareMethod }),
  }
  saveInvitations(invitations)
}

/**
 * 세션에 대한 초대 목록 조회.
 */
export function getInvitationsForSession(sessionId: string): ConsentInvitation[] {
  return loadInvitations().filter((inv) => inv.sessionId === sessionId)
}

/**
 * 토큰으로 초대 조회 (PeerConsentPage에서 사용).
 */
export function getInvitationByToken(token: string): ConsentInvitation | null {
  const invitations = loadInvitations()
  return invitations.find((inv) => inv.token === token) ?? null
}

/**
 * 만료된 초대 정리.
 */
export function cleanupExpiredInvitations(): void {
  const invitations = loadInvitations()
  const now = Date.now()
  const valid = invitations.map((inv) => {
    if (['pending', 'sent', 'opened'].includes(inv.status) && new Date(inv.expiresAt).getTime() < now) {
      return { ...inv, status: 'expired' as InvitationStatus }
    }
    return inv
  })
  saveInvitations(valid)
}

/**
 * 상대방 동의 완료 처리.
 * 세션의 consentStatus를 'both_agreed'로 전환하기 위한 데이터 반환.
 */
export function processAgreement(token: string): {
  success: boolean
  sessionId: string | null
  error: string | null
} {
  const invitation = getInvitationByToken(token)
  if (!invitation) return { success: false, sessionId: null, error: '유효하지 않은 초대입니다' }

  if (invitation.status === 'expired' || new Date(invitation.expiresAt).getTime() < Date.now()) {
    updateInvitationStatus(invitation.id, 'expired')
    return { success: false, sessionId: null, error: '초대가 만료되었습니다' }
  }

  if (invitation.status === 'agreed') {
    return { success: true, sessionId: invitation.sessionId, error: null }
  }

  if (invitation.status === 'declined') {
    return { success: false, sessionId: null, error: '이미 거절된 초대입니다' }
  }

  updateInvitationStatus(invitation.id, 'agreed')
  return { success: true, sessionId: invitation.sessionId, error: null }
}

/**
 * 상대방 거절 처리.
 */
export function processDecline(token: string): void {
  const invitation = getInvitationByToken(token)
  if (!invitation) return
  updateInvitationStatus(invitation.id, 'declined')
}

/**
 * 세션이 both_agreed 가능 상태인지 확인 (동의된 초대가 존재).
 */
export function hasAgreedInvitation(sessionId: string): boolean {
  return getInvitationsForSession(sessionId).some((inv) => inv.status === 'agreed')
}
