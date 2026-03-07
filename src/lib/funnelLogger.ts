// ── 퍼널 로거 — 전환율 측정용 이벤트 추적 ────────────────────────────────────
// localStorage 큐에 저장 후, 네트워크 연결 시 백엔드 API로 전송.
// errorLogger.ts 패턴 동일 — 로컬 우선, 온라인 시 비동기 플러시.

import { getEffectiveUserId } from './auth'
import { isOnline } from './network'
import { generateUUID } from './uuid'

// ── 퍼널 단계 정의 ────────────────────────────────────────────────────────────
export type FunnelStep =
  | 'onboarding_start'      // 온보딩 페이지 진입
  | 'onboarding_consent'    // 필수 동의 완료
  | 'onboarding_complete'   // "자산 스캔 시작" 클릭 → 홈 이동
  | 'scan_start'            // 스캔 시작
  | 'scan_complete'         // 스캔 완료
  | 'label_start'           // 라벨링 페이지 진입
  | 'label_complete'        // 라벨 저장 완료
  | 'consent_global_on'     // 글로벌 공개 동의 ON
  | 'consent_global_off'    // 글로벌 공개 동의 OFF
  | 'consent_session_on'    // 세션별 공개 ON
  | 'consent_session_off'   // 세션별 공개 OFF
  | 'upload_start'          // 업로드 시작
  | 'upload_complete'       // 업로드 완료
  | 'upload_fail'           // 업로드 실패
  | 'voice_enroll_start'    // 본인 인증 시작
  | 'voice_enroll_complete' // 본인 인증 완료
  | 'peer_invite_sent'      // 상대방 동의 초대 전송
  | 'peer_invite_accepted'  // 상대방 동의 수락
  | 'bulk_public'           // 일괄 공개 실행

type FunnelEvent = {
  id: string
  step: FunnelStep
  timestamp: string
  date_bucket: string       // YYYY-MM-DD
  user_id: string | null
  meta: Record<string, unknown> | null
}

const LOG_KEY = 'uncounted_funnel_events'
const MAX_LOCAL = 500

function loadEvents(): FunnelEvent[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as FunnelEvent[]
  } catch {
    return []
  }
}

function saveEvents(events: FunnelEvent[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(events.slice(-MAX_LOCAL)))
  } catch { /* ignore */ }
}

/** 퍼널 이벤트 기록 */
export function trackFunnel(
  step: FunnelStep,
  meta?: Record<string, unknown>,
): void {
  const now = new Date()
  const event: FunnelEvent = {
    id: generateUUID(),
    step,
    timestamp: now.toISOString(),
    date_bucket: now.toISOString().slice(0, 10),
    user_id: getEffectiveUserId(),
    meta: meta ?? null,
  }

  const events = loadEvents()
  events.push(event)
  saveEvents(events)

  // 온라인이면 비동기 전송 시도
  if (isOnline()) {
    flushFunnelEvents().catch(() => {})
  }
}

let isFlushing = false

/** 로컬 큐의 퍼널 이벤트를 백엔드 API로 전송 */
export async function flushFunnelEvents(): Promise<number> {
  if (isFlushing) return 0
  if (!import.meta.env.VITE_API_URL) return 0
  if (!isOnline()) return 0

  const events = loadEvents()
  if (events.length === 0) return 0

  isFlushing = true
  try {
    const { flushFunnelEventsApi } = await import('./api/logging')
    const { data, error } = await flushFunnelEventsApi(events)

    if (error) {
      console.warn('[funnelLogger] flush failed:', error)
      return 0
    }

    // 전송 성공 → 로컬 큐 비우기
    saveEvents([])
    return data?.count ?? 0
  } catch (err: any) {
    console.warn('[funnelLogger] flush error:', err.message)
    return 0
  } finally {
    isFlushing = false
  }
}

// ── 전환율 집계 (로컬 — 어드민/대시보드용) ──────────────────────────────────
export type FunnelSummary = {
  onboarding_start: number
  onboarding_consent: number
  onboarding_complete: number
  scan_start: number
  scan_complete: number
  label_start: number
  label_complete: number
  consent_global_on: number
  upload_start: number
  upload_complete: number
  upload_fail: number
  voice_enroll_start: number
  voice_enroll_complete: number
  // 전환율
  onboarding_to_scan: number       // onboarding_complete → scan_start
  scan_to_label: number            // scan_complete → label_start
  label_to_consent: number         // label_complete → consent_global_on
  consent_to_upload: number        // consent_global_on → upload_start
  overall: number                  // onboarding_start → upload_complete
}

/** 로컬 이벤트 기반 퍼널 전환율 계산 */
export function getFunnelSummary(): FunnelSummary {
  const events = loadEvents()
  const counts: Record<string, number> = {}
  for (const e of events) {
    counts[e.step] = (counts[e.step] ?? 0) + 1
  }

  const g = (k: string) => counts[k] ?? 0
  const rate = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) / 100 : 0

  return {
    onboarding_start: g('onboarding_start'),
    onboarding_consent: g('onboarding_consent'),
    onboarding_complete: g('onboarding_complete'),
    scan_start: g('scan_start'),
    scan_complete: g('scan_complete'),
    label_start: g('label_start'),
    label_complete: g('label_complete'),
    consent_global_on: g('consent_global_on'),
    upload_start: g('upload_start'),
    upload_complete: g('upload_complete'),
    upload_fail: g('upload_fail'),
    voice_enroll_start: g('voice_enroll_start'),
    voice_enroll_complete: g('voice_enroll_complete'),
    onboarding_to_scan: rate(g('scan_start'), g('onboarding_complete')),
    scan_to_label: rate(g('label_start'), g('scan_complete')),
    label_to_consent: rate(g('consent_global_on'), g('label_complete')),
    consent_to_upload: rate(g('upload_start'), g('consent_global_on')),
    overall: rate(g('upload_complete'), g('onboarding_start')),
  }
}
