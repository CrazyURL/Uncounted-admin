// ── U-M08 Screen Session Pattern Collector ─────────────────────────────────
// Web visibilitychange API 기반 화면 세션 패턴 수집
// 저장 금지: 화면 내용, 앱명, 텍스트
// 화면 On/Off → 세션 길이/빈도 시간대 버킷

import {
  type ScreenSessionPatternRecord,
  type ScreenSessionLengthBucket,
  type ScreenSessionFrequencyBucket,
} from '../types/metadata'
import { type TimeBucket2h } from '../types/audioAsset'
import { generateUUID } from './uuid'

// ── 유틸 ────────────────────────────────────────────────────────────────────

function getPseudoId(): string {
  let pid = localStorage.getItem('uncounted_pseudo_id')
  if (!pid) {
    pid = generateUUID()
    localStorage.setItem('uncounted_pseudo_id', pid)
  }
  return pid
}

function todayBucket(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hourToTimeBucket(hour: number): TimeBucket2h {
  const buckets: TimeBucket2h[] = [
    '00-02', '02-04', '04-06', '06-08', '08-10', '10-12',
    '12-14', '14-16', '16-18', '18-20', '20-22', '22-24',
  ]
  return buckets[Math.min(Math.floor(hour / 2), 11)]
}

function classifySessionLength(durationSec: number): ScreenSessionLengthBucket {
  if (durationSec < 30) return 'glance'
  if (durationSec < 300) return 'short'
  if (durationSec < 1800) return 'medium'
  if (durationSec < 7200) return 'long'
  return 'marathon'
}

function classifyFrequency(count: number): ScreenSessionFrequencyBucket {
  if (count < 10) return 'low'
  if (count < 30) return 'moderate'
  if (count < 80) return 'high'
  return 'very_high'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const SCREEN_RECORDS_KEY = 'uncounted_screen_records'
const SCREEN_STATE_KEY = 'uncounted_screen_state'

type ScreenBucketState = {
  dateBucket: string
  timeBucket: string
  sessionCount: number
  totalDurationSec: number
  sessions: number[]  // 각 세션 길이(초) — 평균 계산용
}

type ScreenActiveState = {
  visibleSinceMs: number | null  // 화면 켜진 시점 (null = 꺼진 상태)
  currentBucket: ScreenBucketState
}

function loadRecords(): ScreenSessionPatternRecord[] {
  try {
    const raw = localStorage.getItem(SCREEN_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: ScreenSessionPatternRecord[]): void {
  if (records.length > 2000) records.splice(0, records.length - 2000)
  localStorage.setItem(SCREEN_RECORDS_KEY, JSON.stringify(records))
}

function loadState(): ScreenActiveState | null {
  try {
    const raw = localStorage.getItem(SCREEN_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state: ScreenActiveState): void {
  localStorage.setItem(SCREEN_STATE_KEY, JSON.stringify(state))
}

function newBucketState(): ScreenBucketState {
  const now = new Date()
  return {
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    sessionCount: 0,
    totalDurationSec: 0,
    sessions: [],
  }
}

// ── 시간대 전환 시 flush ────────────────────────────────────────────────────

function flushBucketIfNeeded(state: ScreenActiveState): ScreenActiveState {
  const now = new Date()
  const currentTimeBucket = hourToTimeBucket(now.getHours())
  const currentDateBucket = todayBucket()
  const bucket = state.currentBucket

  if (bucket.timeBucket === currentTimeBucket && bucket.dateBucket === currentDateBucket) {
    return state
  }

  // 이전 시간대 집계 저장
  if (bucket.sessionCount > 0) {
    const avgSec = bucket.totalDurationSec / bucket.sessionCount
    const records = loadRecords()
    records.push({
      schema: 'U-M08-v1',
      pseudoId: getPseudoId(),
      dateBucket: bucket.dateBucket,
      timeBucket: bucket.timeBucket as TimeBucket2h,
      sessionCount: bucket.sessionCount,
      frequencyBucket: classifyFrequency(bucket.sessionCount),
      avgLengthBucket: classifySessionLength(avgSec),
      totalMinutes: Math.round(bucket.totalDurationSec / 60),
    })
    saveRecords(records)
  }

  return {
    ...state,
    currentBucket: {
      dateBucket: currentDateBucket,
      timeBucket: currentTimeBucket,
      sessionCount: 0,
      totalDurationSec: 0,
      sessions: [],
    },
  }
}

// ── 이벤트 핸들링 ──────────────────────────────────────────────────────────

function handleVisibilityChange(): void {
  let state = loadState()

  if (!state) {
    state = {
      visibleSinceMs: document.visibilityState === 'visible' ? Date.now() : null,
      currentBucket: newBucketState(),
    }
    saveState(state)
    return
  }

  state = flushBucketIfNeeded(state)

  if (document.visibilityState === 'visible') {
    // 화면 켜짐
    state.visibleSinceMs = Date.now()
  } else {
    // 화면 꺼짐 → 세션 완료
    if (state.visibleSinceMs) {
      const durationSec = (Date.now() - state.visibleSinceMs) / 1000
      state.currentBucket.sessionCount++
      state.currentBucket.totalDurationSec += durationSec
      state.currentBucket.sessions.push(Math.round(durationSec))
    }
    state.visibleSinceMs = null
  }

  saveState(state)
}

// ── Public API ──────────────────────────────────────────────────────────────

let _started = false

/**
 * 화면 세션 패턴 수집 시작.
 * document.visibilitychange 이벤트 리스닝.
 */
export function startScreenSessionCollector(): boolean {
  if (_started) return true

  // 초기 상태 설정
  const state = loadState()
  if (!state) {
    saveState({
      visibleSinceMs: document.visibilityState === 'visible' ? Date.now() : null,
      currentBucket: newBucketState(),
    })
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 주기적 시간대 flush
  setInterval(() => {
    const s = loadState()
    if (s) {
      const flushed = flushBucketIfNeeded(s)
      saveState(flushed)
    }
  }, 10 * 60_000)

  _started = true
  return true
}

/** 수집된 화면 세션 레코드 반환 */
export function getScreenSessionRecords(): ScreenSessionPatternRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getScreenRecordsByDate(dateBucket: string): ScreenSessionPatternRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}

/** 오늘의 현재 누적 세션 수 */
export function getTodaySessionCount(): number {
  const state = loadState()
  if (!state) return 0
  if (state.currentBucket.dateBucket !== todayBucket()) return 0
  return state.currentBucket.sessionCount
}
