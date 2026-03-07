// ── U-M10 Network Transition Collector ─────────────────────────────────────
// Web API (navigator.connection + online/offline) 기반 네트워크 전환 수집
// 저장 금지: SSID, IP, 셀 ID, APN
// 시간대는 2h 버킷으로 집계

import {
  type NetworkTransitionRecord,
  type NetworkType,
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

// ── 네트워크 타입 감지 ──────────────────────────────────────────────────────

function detectNetworkType(): NetworkType {
  if (!navigator.onLine) return 'offline'

  // Network Information API (Android WebView 지원)
  const conn = (navigator as any).connection
  if (conn) {
    const type: string = conn.type ?? conn.effectiveType ?? ''
    if (type === 'wifi') return 'wifi'
    if (['cellular', '4g', '3g', '2g', 'slow-2g'].includes(type)) return 'cellular'
  }

  // 폴백: 온라인이면 wifi로 추정 (Web API 한계)
  return 'wifi'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const NETWORK_RECORDS_KEY = 'uncounted_network_records'
const NETWORK_STATE_KEY = 'uncounted_network_state'

type NetworkState = {
  currentType: NetworkType
  timeBucket: string      // 현재 시간대 버킷
  dateBucket: string      // 현재 날짜 버킷
  transitionCount: number // 현재 시간대 전환 횟수
  dominantMinutes: Record<NetworkType, number>  // 타입별 누적 분
  lastChangeMs: number
}

function loadRecords(): NetworkTransitionRecord[] {
  try {
    const raw = localStorage.getItem(NETWORK_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: NetworkTransitionRecord[]): void {
  // 최근 2000건만 유지
  if (records.length > 2000) records.splice(0, records.length - 2000)
  localStorage.setItem(NETWORK_RECORDS_KEY, JSON.stringify(records))
}

function loadState(): NetworkState | null {
  try {
    const raw = localStorage.getItem(NETWORK_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state: NetworkState): void {
  localStorage.setItem(NETWORK_STATE_KEY, JSON.stringify(state))
}

// ── 시간대 전환 시 집계 flush ───────────────────────────────────────────────

function flushBucketIfNeeded(state: NetworkState): NetworkState {
  const now = new Date()
  const currentTimeBucket = hourToTimeBucket(now.getHours())
  const currentDateBucket = todayBucket()

  // 같은 시간대면 flush 불필요
  if (state.timeBucket === currentTimeBucket && state.dateBucket === currentDateBucket) {
    return state
  }

  // 이전 시간대 집계 레코드 저장
  if (state.transitionCount > 0) {
    const dominant = getDominantNetwork(state.dominantMinutes)
    const records = loadRecords()
    records.push({
      schema: 'U-M10-v1',
      pseudoId: getPseudoId(),
      dateBucket: state.dateBucket,
      timeBucket: state.timeBucket as TimeBucket2h,
      fromNetwork: state.currentType,
      toNetwork: state.currentType,
      transitionCount: state.transitionCount,
      dominantNetwork: dominant,
    })
    saveRecords(records)
  }

  // 새 시간대로 리셋
  return {
    ...state,
    timeBucket: currentTimeBucket,
    dateBucket: currentDateBucket,
    transitionCount: 0,
    dominantMinutes: { wifi: 0, cellular: 0, offline: 0 },
    lastChangeMs: Date.now(),
  }
}

function getDominantNetwork(minutes: Record<NetworkType, number>): NetworkType {
  if (minutes.wifi >= minutes.cellular && minutes.wifi >= minutes.offline) return 'wifi'
  if (minutes.cellular >= minutes.offline) return 'cellular'
  return 'offline'
}

// ── 이벤트 핸들링 ──────────────────────────────────────────────────────────

function handleNetworkChange(): void {
  const newType = detectNetworkType()
  let state = loadState()

  if (!state) {
    const now = new Date()
    state = {
      currentType: newType,
      timeBucket: hourToTimeBucket(now.getHours()),
      dateBucket: todayBucket(),
      transitionCount: 0,
      dominantMinutes: { wifi: 0, cellular: 0, offline: 0 },
      lastChangeMs: Date.now(),
    }
    saveState(state)
    return
  }

  // 시간대 전환 체크 + flush
  state = flushBucketIfNeeded(state)

  // 같은 타입이면 무시
  if (state.currentType === newType) {
    saveState(state)
    return
  }

  // 이전 타입의 누적 시간 업데이트
  const elapsedMin = (Date.now() - state.lastChangeMs) / 60_000
  state.dominantMinutes[state.currentType] += elapsedMin

  // 전환 기록
  state.currentType = newType
  state.transitionCount++
  state.lastChangeMs = Date.now()

  saveState(state)
}

// ── Public API ──────────────────────────────────────────────────────────────

let _started = false

/**
 * 네트워크 전환 이벤트 수집 시작.
 * online/offline + connection change 이벤트 리스닝.
 */
export function startNetworkCollector(): boolean {
  if (_started) return true

  // 초기 상태 설정
  handleNetworkChange()

  // 이벤트 리스닝
  window.addEventListener('online', handleNetworkChange)
  window.addEventListener('offline', handleNetworkChange)

  // Network Information API change 이벤트
  const conn = (navigator as any).connection
  if (conn) {
    conn.addEventListener('change', handleNetworkChange)
  }

  // 주기적 시간대 flush (2h마다 flush 보장)
  setInterval(() => {
    const state = loadState()
    if (state) {
      const flushed = flushBucketIfNeeded(state)
      saveState(flushed)
    }
  }, 10 * 60_000)  // 10분마다 체크

  _started = true
  return true
}

/** 수집된 네트워크 전환 레코드 반환 */
export function getNetworkRecords(): NetworkTransitionRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getNetworkRecordsByDate(dateBucket: string): NetworkTransitionRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}

/** 현재 네트워크 타입 */
export function getCurrentNetworkType(): NetworkType {
  return detectNetworkType()
}
