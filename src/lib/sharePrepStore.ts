// ── 공개 준비 전역 상태 ─────────────────────────────────────────────────────
// 모듈 레벨 싱글턴 — 탭 전환해도 상태가 유지됨
// React useSyncExternalStore 패턴 사용

import { type SharePrepProgress, type SharePrepResult, type PreScanSummary } from './sharePrepEngine'

export type SharePrepStoreState = {
  running: boolean
  progress: SharePrepProgress | null
  result: SharePrepResult | null
  startedAt: number | null          // Date.now() — 경과 시간 계산용
  cancelled: { current: boolean }
  cachedSummary: PreScanSummary | null   // preScan 결과 캐시
  cachedSessionCount: number             // 캐시 생성 시 세션 수 (변경 감지)
}

// ── 모듈 상태 ────────────────────────────────────────────────────────────────

let state: SharePrepStoreState = {
  running: false,
  progress: null,
  result: null,
  startedAt: null,
  cancelled: { current: false },
  cachedSummary: null,
  cachedSessionCount: 0,
}

let listeners: Array<() => void> = []

function notify() {
  for (const l of listeners) l()
}

// ── 외부 API ─────────────────────────────────────────────────────────────────

export function getSharePrepSnapshot(): SharePrepStoreState {
  return state
}

export function subscribeSharePrep(listener: () => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function sharePrepStart(): void {
  state = {
    ...state,
    running: true,
    progress: null,
    result: null,
    startedAt: Date.now(),
    cancelled: { current: false },
  }
  notify()
}

export function sharePrepUpdateProgress(progress: SharePrepProgress): void {
  state = { ...state, progress }
  notify()
}

export function sharePrepFinish(result: SharePrepResult): void {
  state = { ...state, running: false, result }
  notify()
}

export function sharePrepCancel(): void {
  state.cancelled.current = true
  notify()
}

export function sharePrepReset(): void {
  state = {
    ...state,
    running: false,
    progress: null,
    result: null,
    startedAt: null,
    cancelled: { current: false },
  }
  notify()
}

export function sharePrepGetCancelled(): { current: boolean } {
  return state.cancelled
}

// ── preScan 캐시 ─────────────────────────────────────────────────────────────

export function setCachedSummary(summary: PreScanSummary, sessionCount: number): void {
  state = { ...state, cachedSummary: summary, cachedSessionCount: sessionCount }
  notify()
}

export function getCachedSummary(currentSessionCount: number): PreScanSummary | null {
  if (!state.cachedSummary) return null
  // 세션 수가 변경됐으면 캐시 무효
  if (state.cachedSessionCount !== currentSessionCount) return null
  return state.cachedSummary
}
