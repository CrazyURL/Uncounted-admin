// ── U-M13 Ambient Light Collector ───────────────────────────────────────────
// AmbientLightSensor (Web) → 시간대별 밝기 버킷, 실내/실외 추정
// Web: AmbientLightSensor API (Chrome 제한적 지원, flag 필요)
// Android: Capacitor 플러그인 또는 SensorManager TYPE_LIGHT
// 저장 금지: GPS, 카메라 이미지, 정밀 시각

import {
  type AmbientLightRecord,
  type BrightnessLevelBucket,
  type LightEnvironmentEstimate,
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

// ── 밝기 분류 ────────────────────────────────────────────────────────────────

function classifyBrightness(lux: number): BrightnessLevelBucket {
  if (lux < 10) return 'dark'
  if (lux < 50) return 'dim'
  if (lux < 500) return 'normal'
  if (lux < 10000) return 'bright'
  return 'very_bright'
}

function estimateLightEnvironment(avgLux: number): LightEnvironmentEstimate {
  if (avgLux < 10) return 'indoor_dark'
  if (avgLux < 500) return 'indoor_normal'
  if (avgLux < 10000) return 'outdoor_shade'
  return 'outdoor_sun'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const LIGHT_RECORDS_KEY = 'uncounted_light_records'
const LIGHT_STATE_KEY = 'uncounted_light_state'

type LightBucketState = {
  dateBucket: string
  timeBucket: string
  readings: number[]       // lux 값 배열 (평균/최소/최대 계산용)
  transitionCount: number  // 밝기 버킷 전환 횟수
  lastBucket: BrightnessLevelBucket | null
}

function loadRecords(): AmbientLightRecord[] {
  try {
    const raw = localStorage.getItem(LIGHT_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: AmbientLightRecord[]): void {
  if (records.length > 2000) records.splice(0, records.length - 2000)
  localStorage.setItem(LIGHT_RECORDS_KEY, JSON.stringify(records))
}

function loadState(): LightBucketState | null {
  try {
    const raw = localStorage.getItem(LIGHT_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state: LightBucketState): void {
  localStorage.setItem(LIGHT_STATE_KEY, JSON.stringify(state))
}

function newBucketState(): LightBucketState {
  const now = new Date()
  return {
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    readings: [],
    transitionCount: 0,
    lastBucket: null,
  }
}

// ── 시간대 전환 시 flush ────────────────────────────────────────────────────

function flushBucketIfNeeded(state: LightBucketState): LightBucketState {
  const now = new Date()
  const currentTimeBucket = hourToTimeBucket(now.getHours())
  const currentDateBucket = todayBucket()

  if (state.timeBucket === currentTimeBucket && state.dateBucket === currentDateBucket) {
    return state
  }

  // 이전 시간대 집계 저장
  if (state.readings.length > 0) {
    const avg = state.readings.reduce((s, v) => s + v, 0) / state.readings.length
    const min = Math.min(...state.readings)
    const max = Math.max(...state.readings)

    const records = loadRecords()
    records.push({
      schema: 'U-M13-v1',
      pseudoId: getPseudoId(),
      dateBucket: state.dateBucket,
      timeBucket: state.timeBucket as TimeBucket2h,
      avgBrightnessBucket: classifyBrightness(avg),
      minBrightnessBucket: classifyBrightness(min),
      maxBrightnessBucket: classifyBrightness(max),
      environmentEstimate: estimateLightEnvironment(avg),
      transitionCount: state.transitionCount,
    })
    saveRecords(records)
  }

  return {
    dateBucket: currentDateBucket,
    timeBucket: currentTimeBucket,
    readings: [],
    transitionCount: 0,
    lastBucket: null,
  }
}

// ── 센서 리딩 처리 ──────────────────────────────────────────────────────────

function handleLightReading(lux: number): void {
  let state = loadState()
  if (!state) state = newBucketState()

  state = flushBucketIfNeeded(state)

  // 읽기 버퍼에 추가 (최대 500개, 과도한 메모리 방지)
  if (state.readings.length < 500) {
    state.readings.push(lux)
  }

  // 밝기 버킷 전환 감지
  const currentBucket = classifyBrightness(lux)
  if (state.lastBucket && state.lastBucket !== currentBucket) {
    state.transitionCount++
  }
  state.lastBucket = currentBucket

  saveState(state)
}

// ── AmbientLightSensor 타입 (Web API, 비표준) ──────────────────────────────

interface AmbientLightSensorInstance extends EventTarget {
  illuminance: number
  start(): void
  stop(): void
  onreading: ((this: AmbientLightSensorInstance) => void) | null
  onerror: ((this: AmbientLightSensorInstance, ev: Event) => void) | null
}

interface AmbientLightSensorConstructor {
  new(options?: { frequency?: number }): AmbientLightSensorInstance
}

// ── Public API ──────────────────────────────────────────────────────────────

let _started = false
let _sensor: AmbientLightSensorInstance | null = null

/**
 * 주변 조도 수집 시작.
 * AmbientLightSensor API 지원 시 자동 리스닝.
 * 미지원 시 false 반환 (Capacitor 네이티브 플러그인 필요).
 */
export function startAmbientLightCollector(): boolean {
  if (_started) return true

  // AmbientLightSensor 지원 체크
  const SensorClass = (window as any).AmbientLightSensor as AmbientLightSensorConstructor | undefined
  if (!SensorClass) return false

  try {
    // 5초 간격 샘플링 (배터리 최적화)
    _sensor = new SensorClass({ frequency: 0.2 })
    _sensor.onreading = () => {
      if (_sensor) handleLightReading(_sensor.illuminance)
    }
    _sensor.onerror = () => {
      // 권한 거부 또는 센서 미지원
      _started = false
    }
    _sensor.start()

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

/** 수집된 조도 레코드 반환 */
export function getAmbientLightRecords(): AmbientLightRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getAmbientLightRecordsByDate(dateBucket: string): AmbientLightRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}
