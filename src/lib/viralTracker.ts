// ── Phase 5: 바이럴 초대 트래킹 + 리워드 로직 ────────────────────────────────
// 상대방 동의 요청 → 앱 유입 퍼널 트래킹
// 리워드: 동의 완료 시 both_agreed 세션 수 → 보너스 가치 배수 적용
// 저장 금지: 상대방 PII (이름/전화번호)

import { generateUUID } from './uuid'

// ── 타입 ────────────────────────────────────────────────────────────────────

/** 바이럴 초대 이벤트 */
export type ViralEventType =
  | 'invite_created'    // 초대 생성
  | 'invite_shared'     // 공유 실행 (Web Share / clipboard)
  | 'invite_opened'     // 상대방이 링크 열람
  | 'invite_agreed'     // 상대방 동의
  | 'invite_declined'   // 상대방 거절
  | 'invite_expired'    // 만료

/** 바이럴 이벤트 레코드 (로컬 트래킹) */
export type ViralEvent = {
  id: string
  type: ViralEventType
  sessionId: string
  invitationId: string
  timestamp: string       // ISO
  dateBucket: string      // YYYY-MM-DD
}

/** 바이럴 퍼널 집계 */
export type ViralFunnel = {
  totalCreated: number
  totalShared: number
  totalOpened: number
  totalAgreed: number
  totalDeclined: number
  totalExpired: number
  conversionRate: number  // agreed / shared (0~1)
}

/** 리워드 정보 */
export type ViralReward = {
  bothAgreedCount: number     // both_agreed 세션 수
  bonusMultiplier: number     // 가치 배수 (1.0 ~ 2.0)
  tier: 'none' | 'bronze' | 'silver' | 'gold'
  nextTierThreshold: number   // 다음 티어까지 필요한 both_agreed 수
}

// ── 상수 ────────────────────────────────────────────────────────────────────

const VIRAL_EVENTS_KEY = 'uncounted_viral_events'

/** 리워드 티어 기준 */
const REWARD_TIERS = [
  { tier: 'none' as const, min: 0, multiplier: 1.0 },
  { tier: 'bronze' as const, min: 3, multiplier: 1.2 },
  { tier: 'silver' as const, min: 10, multiplier: 1.5 },
  { tier: 'gold' as const, min: 30, multiplier: 2.0 },
]

// ── localStorage ────────────────────────────────────────────────────────────

function loadEvents(): ViralEvent[] {
  try {
    const raw = localStorage.getItem(VIRAL_EVENTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveEvents(events: ViralEvent[]): void {
  // 최대 2000건
  if (events.length > 2000) events.splice(0, events.length - 2000)
  localStorage.setItem(VIRAL_EVENTS_KEY, JSON.stringify(events))
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function todayBucket(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * 바이럴 이벤트 기록.
 */
export function trackViralEvent(
  type: ViralEventType,
  sessionId: string,
  invitationId: string,
): void {
  const events = loadEvents()
  events.push({
    id: generateUUID(),
    type,
    sessionId,
    invitationId,
    timestamp: new Date().toISOString(),
    dateBucket: todayBucket(),
  })
  saveEvents(events)
}

/**
 * 바이럴 퍼널 집계 (전체 기간).
 */
export function getViralFunnel(): ViralFunnel {
  const events = loadEvents()
  const counts: Record<ViralEventType, number> = {
    invite_created: 0,
    invite_shared: 0,
    invite_opened: 0,
    invite_agreed: 0,
    invite_declined: 0,
    invite_expired: 0,
  }

  for (const e of events) {
    counts[e.type]++
  }

  return {
    totalCreated: counts.invite_created,
    totalShared: counts.invite_shared,
    totalOpened: counts.invite_opened,
    totalAgreed: counts.invite_agreed,
    totalDeclined: counts.invite_declined,
    totalExpired: counts.invite_expired,
    conversionRate: counts.invite_shared > 0
      ? Math.round((counts.invite_agreed / counts.invite_shared) * 100) / 100
      : 0,
  }
}

/**
 * 특정 날짜의 바이럴 이벤트 수.
 */
export function getViralEventsByDate(dateBucket: string): ViralEvent[] {
  return loadEvents().filter((e) => e.dateBucket === dateBucket)
}

/**
 * both_agreed 세션 수 기반 리워드 계산.
 */
export function calcViralReward(bothAgreedCount: number): ViralReward {
  let currentTier = REWARD_TIERS[0]
  let nextTierThreshold = REWARD_TIERS[1]?.min ?? 0

  for (let i = REWARD_TIERS.length - 1; i >= 0; i--) {
    if (bothAgreedCount >= REWARD_TIERS[i].min) {
      currentTier = REWARD_TIERS[i]
      nextTierThreshold = REWARD_TIERS[i + 1]?.min ?? currentTier.min
      break
    }
  }

  return {
    bothAgreedCount,
    bonusMultiplier: currentTier.multiplier,
    tier: currentTier.tier,
    nextTierThreshold,
  }
}

/**
 * 세션 목록에서 both_agreed 수 카운트.
 */
export function countBothAgreed(sessions: { consentStatus?: string }[]): number {
  return sessions.filter((s) => s.consentStatus === 'both_agreed').length
}

/**
 * 초대 세션별 통계 (해당 세션의 초대 이벤트 요약).
 */
export function getSessionInviteStats(sessionId: string): {
  created: number
  shared: number
  opened: number
  agreed: number
} {
  const events = loadEvents().filter((e) => e.sessionId === sessionId)
  return {
    created: events.filter((e) => e.type === 'invite_created').length,
    shared: events.filter((e) => e.type === 'invite_shared').length,
    opened: events.filter((e) => e.type === 'invite_opened').length,
    agreed: events.filter((e) => e.type === 'invite_agreed').length,
  }
}
