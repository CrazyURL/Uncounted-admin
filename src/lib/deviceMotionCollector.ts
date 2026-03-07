// ── U-M14 Device Motion Collector ─────────────────────────────────────────────
// DeviceMotionEvent (Web) → 움직임 강도 버킷, 화면 방향, 흔들림/걸음 추정
// Web: DeviceMotionEvent API (표준, iOS 13+ 권한 필요)
// Android: SensorManager TYPE_ACCELEROMETER + TYPE_GYROSCOPE
// 저장 금지: GPS 좌표, 정밀 경로, 이동 궤적

import {
  type DeviceMotionRecord,
  type MovementIntensityBucket,
  type DeviceOrientationBucket,
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

// ── 분류 ────────────────────────────────────────────────────────────────────

/** 가속도 크기(m/s²) → 강도 버킷 */
function classifyIntensity(accel: number): MovementIntensityBucket {
  if (accel < 0.5) return 'still'
  if (accel < 2) return 'light'
  if (accel < 5) return 'moderate'
  return 'active'
}

/** 기기 방향 분류 (DeviceOrientationEvent beta/gamma 기반) */
function classifyOrientation(beta: number, gamma: number): DeviceOrientationBucket {
  const absBeta = Math.abs(beta)
  const absGamma = Math.abs(gamma)

  // face_down: beta 100~180 또는 음수로 뒤집힘
  if (absBeta > 150) return 'face_down'
  // flat: beta 0~20, gamma 0~20
  if (absBeta < 20 && absGamma < 20) return 'flat'
  // upright: beta 60~100
  if (absBeta > 60) return 'upright'
  return 'tilted'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const MOTION_RECORDS_KEY = 'uncounted_motion_records'
const MOTION_STATE_KEY = 'uncounted_motion_state'

/** 흔들림 감지 임계값 (m/s²) */
const SHAKE_THRESHOLD = 15

/** 걸음 감지 임계값 (m/s²) — 가속도 피크 카운팅 */
const STEP_THRESHOLD = 3
const STEP_MIN_INTERVAL_MS = 300 // 연속 피크 최소 간격

type MotionBucketState = {
  dateBucket: string
  timeBucket: string
  readings: number[]         // 가속도 크기 (m/s²)
  orientations: DeviceOrientationBucket[]
  shakeCount: number
  stepCount: number
  lastStepTime: number       // 마지막 걸음 감지 timestamp
  peakAccel: number
}

function loadRecords(): DeviceMotionRecord[] {
  try {
    const raw = localStorage.getItem(MOTION_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: DeviceMotionRecord[]): void {
  if (records.length > 2000) records.splice(0, records.length - 2000)
  localStorage.setItem(MOTION_RECORDS_KEY, JSON.stringify(records))
}

function loadState(): MotionBucketState | null {
  try {
    const raw = localStorage.getItem(MOTION_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state: MotionBucketState): void {
  localStorage.setItem(MOTION_STATE_KEY, JSON.stringify(state))
}

function newBucketState(): MotionBucketState {
  const now = new Date()
  return {
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    readings: [],
    orientations: [],
    shakeCount: 0,
    stepCount: 0,
    lastStepTime: 0,
    peakAccel: 0,
  }
}

// ── 시간대 전환 시 flush ────────────────────────────────────────────────────

function flushBucketIfNeeded(state: MotionBucketState): MotionBucketState {
  const now = new Date()
  const currentTimeBucket = hourToTimeBucket(now.getHours())
  const currentDateBucket = todayBucket()

  if (state.timeBucket === currentTimeBucket && state.dateBucket === currentDateBucket) {
    return state
  }

  // 이전 시간대 집계 저장
  if (state.readings.length > 0) {
    const avg = state.readings.reduce((s, v) => s + v, 0) / state.readings.length

    // 최빈 방향 계산
    const orientCounts: Record<string, number> = {}
    for (const o of state.orientations) {
      orientCounts[o] = (orientCounts[o] ?? 0) + 1
    }
    let dominantOrientation: DeviceOrientationBucket = 'flat'
    let maxCount = 0
    for (const [orient, count] of Object.entries(orientCounts)) {
      if (count > maxCount) {
        maxCount = count
        dominantOrientation = orient as DeviceOrientationBucket
      }
    }

    const records = loadRecords()
    records.push({
      schema: 'U-M14-v1',
      pseudoId: getPseudoId(),
      dateBucket: state.dateBucket,
      timeBucket: state.timeBucket as TimeBucket2h,
      avgIntensityBucket: classifyIntensity(avg),
      peakIntensityBucket: classifyIntensity(state.peakAccel),
      dominantOrientation,
      shakeCount: state.shakeCount,
      stepEstimate: state.stepCount > 0 ? state.stepCount : null,
    })
    saveRecords(records)
  }

  return {
    dateBucket: currentDateBucket,
    timeBucket: currentTimeBucket,
    readings: [],
    orientations: [],
    shakeCount: 0,
    stepCount: 0,
    lastStepTime: 0,
    peakAccel: 0,
  }
}

// ── 센서 리딩 처리 ──────────────────────────────────────────────────────────

function handleMotionReading(accelMag: number): void {
  let state = loadState()
  if (!state) state = newBucketState()

  state = flushBucketIfNeeded(state)

  // 읽기 버퍼 (최대 500개)
  if (state.readings.length < 500) {
    state.readings.push(accelMag)
  }

  // 피크 추적
  if (accelMag > state.peakAccel) {
    state.peakAccel = accelMag
  }

  // 흔들림 감지
  if (accelMag > SHAKE_THRESHOLD) {
    state.shakeCount++
  }

  // 걸음 감지 (간단한 피크 카운팅)
  const now = Date.now()
  if (accelMag > STEP_THRESHOLD && accelMag < SHAKE_THRESHOLD) {
    if (now - state.lastStepTime > STEP_MIN_INTERVAL_MS) {
      state.stepCount++
      state.lastStepTime = now
    }
  }

  saveState(state)
}

function handleOrientationReading(beta: number, gamma: number): void {
  let state = loadState()
  if (!state) state = newBucketState()

  if (state.orientations.length < 500) {
    state.orientations.push(classifyOrientation(beta, gamma))
  }

  saveState(state)
}

// ── Public API ──────────────────────────────────────────────────────────────

let _started = false

/**
 * 디바이스 모션 수집 시작.
 * DeviceMotionEvent + DeviceOrientationEvent 리스닝.
 * 미지원 시 false 반환.
 */
export function startDeviceMotionCollector(): boolean {
  if (_started) return true

  if (typeof DeviceMotionEvent === 'undefined') return false

  try {
    // 가속도 이벤트 — 2초 간격 샘플링 (throttle)
    let lastMotionTime = 0
    window.addEventListener('devicemotion', (ev) => {
      const now = Date.now()
      if (now - lastMotionTime < 2000) return
      lastMotionTime = now

      const a = ev.accelerationIncludingGravity
      if (!a || a.x == null || a.y == null || a.z == null) return

      // 중력 포함 가속도 크기 - 중력(9.8) 제외한 순수 움직임
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
      const netAccel = Math.abs(mag - 9.81) // 중력 보정
      handleMotionReading(netAccel)
    })

    // 방향 이벤트 — 5초 간격 샘플링
    let lastOrientTime = 0
    window.addEventListener('deviceorientation', (ev) => {
      const now = Date.now()
      if (now - lastOrientTime < 5000) return
      lastOrientTime = now

      if (ev.beta == null || ev.gamma == null) return
      handleOrientationReading(ev.beta, ev.gamma)
    })

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
  } catch {
    return false
  }
}

/** 수집된 모션 레코드 반환 */
export function getDeviceMotionRecords(): DeviceMotionRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getDeviceMotionRecordsByDate(dateBucket: string): DeviceMotionRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}
