// ── U-M11 Activity State Collector ───────────────────────────────────────────
// Android: Activity Recognition Transition API (ACTIVITY_RECOGNITION 런타임 권한)
// Web 폴백: DeviceMotionEvent 가속도 기반 추정 (정지/걷기/활동, 정확도 낮음)
// M14(디바이스 모션)과 교차 검증으로 정확도 보완
// 저장 금지: GPS 좌표, 이동 경로, 정밀 위치, 속도

import {
  type ActivityStateRecord,
  type ActivityType,
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

// ── Web 폴백: 가속도 기반 활동 추정 ─────────────────────────────────────────
// M14와 같은 가속도 데이터를 사용하지만 목적이 다름:
// M14: 움직임 강도/방향 버킷 → 모션 프로필
// M11: 활동 유형 분류 → 정지/걷기/달리기/차량

/** 중력 보정된 가속도(m/s²) → 활동 유형 추정 */
function estimateActivityFromAccel(netAccel: number): ActivityType {
  // 매우 단순한 임계값 기반 — 네이티브 Transition API보다 정확도 낮음
  if (netAccel < 0.3) return 'still'
  if (netAccel < 2.0) return 'walking'
  if (netAccel < 5.0) return 'running'
  // 차량은 가속도만으로 구분 어려움 — unknown 처리
  return 'unknown'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const ACTIVITY_RECORDS_KEY = 'uncounted_activity_state_records'
const ACTIVITY_STATE_KEY = 'uncounted_activity_state'

type ActivityBucketState = {
  dateBucket: string
  timeBucket: string
  /** 활동 유형별 샘플 카운트 */
  activityCounts: Partial<Record<ActivityType, number>>
  transitionCount: number
  lastActivity: ActivityType | null
  totalSamples: number
}

function loadRecords(): ActivityStateRecord[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: ActivityStateRecord[]): void {
  if (records.length > 2000) records.splice(0, records.length - 2000)
  localStorage.setItem(ACTIVITY_RECORDS_KEY, JSON.stringify(records))
}

function loadState(): ActivityBucketState | null {
  try {
    const raw = localStorage.getItem(ACTIVITY_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state: ActivityBucketState): void {
  localStorage.setItem(ACTIVITY_STATE_KEY, JSON.stringify(state))
}

function newBucketState(): ActivityBucketState {
  const now = new Date()
  return {
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    activityCounts: {},
    transitionCount: 0,
    lastActivity: null,
    totalSamples: 0,
  }
}

// ── 시간대 전환 시 flush ────────────────────────────────────────────────────

function flushBucketIfNeeded(state: ActivityBucketState): ActivityBucketState {
  const now = new Date()
  const currentTimeBucket = hourToTimeBucket(now.getHours())
  const currentDateBucket = todayBucket()

  if (state.timeBucket === currentTimeBucket && state.dateBucket === currentDateBucket) {
    return state
  }

  // 이전 시간대 집계 저장
  if (state.totalSamples > 0) {
    // 최빈 활동 계산
    let dominantActivity: ActivityType = 'unknown'
    let maxCount = 0
    const distribution: Partial<Record<ActivityType, number>> = {}

    for (const [activity, count] of Object.entries(state.activityCounts)) {
      const ratio = count! / state.totalSamples
      distribution[activity as ActivityType] = Math.round(ratio * 100) / 100
      if (count! > maxCount) {
        maxCount = count!
        dominantActivity = activity as ActivityType
      }
    }

    // still 제외 활동 시간 추정 (2h 버킷 = 120분, 샘플링 간격 기반)
    const stillRatio = distribution['still'] ?? 0
    const totalActiveMinutes = Math.round((1 - stillRatio) * 120)

    const records = loadRecords()
    records.push({
      schema: 'U-M11-v1',
      pseudoId: getPseudoId(),
      dateBucket: state.dateBucket,
      timeBucket: state.timeBucket as TimeBucket2h,
      dominantActivity,
      activityDistribution: distribution,
      transitionCount: state.transitionCount,
      totalActiveMinutes: totalActiveMinutes > 0 ? totalActiveMinutes : null,
    })
    saveRecords(records)
  }

  return {
    dateBucket: currentDateBucket,
    timeBucket: currentTimeBucket,
    activityCounts: {},
    transitionCount: 0,
    lastActivity: null,
    totalSamples: 0,
  }
}

// ── 활동 상태 기록 ──────────────────────────────────────────────────────────

/**
 * 활동 상태를 기록한다.
 * 네이티브 Transition API 또는 Web 가속도 추정에서 호출.
 */
export function recordActivityState(activity: ActivityType): void {
  let state = loadState()
  if (!state) state = newBucketState()

  state = flushBucketIfNeeded(state)

  // 카운트 증가
  state.activityCounts[activity] = (state.activityCounts[activity] ?? 0) + 1
  state.totalSamples++

  // 전환 감지
  if (state.lastActivity && state.lastActivity !== activity) {
    state.transitionCount++
  }
  state.lastActivity = activity

  saveState(state)
}

// ── Web 폴백 수집 (DeviceMotionEvent 기반) ──────────────────────────────────

let _webFallbackStarted = false

function startWebFallback(): boolean {
  if (_webFallbackStarted) return true
  if (typeof DeviceMotionEvent === 'undefined') return false

  try {
    // 10초 간격 샘플링 (M14보다 느리게 — 활동 유형은 빠른 변화가 적음)
    let lastSampleTime = 0
    window.addEventListener('devicemotion', (ev) => {
      const now = Date.now()
      if (now - lastSampleTime < 10_000) return
      lastSampleTime = now

      const a = ev.accelerationIncludingGravity
      if (!a || a.x == null || a.y == null || a.z == null) return

      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
      const netAccel = Math.abs(mag - 9.81)
      const activity = estimateActivityFromAccel(netAccel)
      recordActivityState(activity)
    })

    _webFallbackStarted = true
    return true
  } catch {
    return false
  }
}

// ── Capacitor 네이티브 브릿지 ───────────────────────────────────────────────

let _bridgeStarted = false

/**
 * Capacitor 네이티브 플러그인 리스너 등록.
 * Android: Activity Recognition Transition API
 * - ACTIVITY_RECOGNITION 런타임 권한 (일반 권한 플로우)
 * - Transition API → 이벤트 기반, 배터리 최적화 (폴링 불필요)
 *
 * 네이티브에서 WebView로 전달하는 이벤트:
 * { activityType: ActivityType }
 */
function startNativeBridge(): boolean {
  if (_bridgeStarted) return true

  try {
    window.addEventListener('uncounted:activity-state', ((ev: CustomEvent<{
      activityType: ActivityType
    }>) => {
      recordActivityState(ev.detail.activityType)
    }) as EventListener)

    _bridgeStarted = true
    return true
  } catch {
    return false
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

let _started = false

/**
 * 활동 상태 수집 시작.
 * 1순위: Capacitor 네이티브 (Activity Recognition Transition API)
 * 2순위: Web DeviceMotionEvent 기반 추정 (정확도 낮음)
 */
export function startActivityStateCollector(): boolean {
  if (_started) return true

  // 네이티브 브릿지 시도
  const nativeOk = startNativeBridge()

  // Web 폴백 (네이티브와 병행 가능 — 네이티브가 더 정확하므로 네이티브 우선)
  if (!nativeOk) {
    startWebFallback()
  }

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

/** 수집된 활동 상태 레코드 반환 */
export function getActivityStateRecords(): ActivityStateRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getActivityStateRecordsByDate(dateBucket: string): ActivityStateRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}
