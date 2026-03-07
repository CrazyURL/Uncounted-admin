// ── U-M09 Battery/Charging Cycle Collector ────────────────────────────────
// Web Battery API (navigator.getBattery()) 기반 충전 이벤트 수집
// 저장 금지: 위치, 정밀 시각
// 시간대는 2h 버킷, 배터리 레벨은 high/medium/low 버킷

import {
  type BatteryChargingRecord,
  type ChargingSpeedBucket,
  type ChargingEventType,
  type BatteryLevelBucket,
  type CallDurationBucket,
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

function classifyBatteryLevel(level: number): BatteryLevelBucket {
  if (level > 0.6) return 'high'
  if (level > 0.2) return 'medium'
  return 'low'
}

function classifyChargingSpeed(levelDelta: number, durationMin: number): ChargingSpeedBucket {
  if (durationMin <= 0) return 'normal'
  const ratePerMin = (levelDelta * 100) / durationMin
  if (ratePerMin > 3) return 'fast'
  if (ratePerMin >= 1) return 'normal'
  return 'slow'
}

function classifyDuration(durationSec: number): CallDurationBucket {
  if (durationSec < 30) return 'under_30s'
  if (durationSec < 180) return '30s_3m'
  if (durationSec < 900) return '3m_15m'
  if (durationSec < 3600) return '15m_60m'
  return 'over_60m'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const BATTERY_RECORDS_KEY = 'uncounted_battery_records'
const BATTERY_STATE_KEY = 'uncounted_battery_state'

type ChargingState = {
  isCharging: boolean
  levelAtStart: number    // 충전 시작 시 배터리 레벨
  startedAtMs: number     // 충전 시작 timestamp
}

function loadRecords(): BatteryChargingRecord[] {
  try {
    const raw = localStorage.getItem(BATTERY_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function appendRecord(record: BatteryChargingRecord): void {
  const records = loadRecords()
  records.push(record)
  // 최근 1000건만 유지
  if (records.length > 1000) records.splice(0, records.length - 1000)
  localStorage.setItem(BATTERY_RECORDS_KEY, JSON.stringify(records))
}

function loadChargingState(): ChargingState | null {
  try {
    const raw = localStorage.getItem(BATTERY_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveChargingState(state: ChargingState | null): void {
  if (state) {
    localStorage.setItem(BATTERY_STATE_KEY, JSON.stringify(state))
  } else {
    localStorage.removeItem(BATTERY_STATE_KEY)
  }
}

// ── 이벤트 핸들링 ──────────────────────────────────────────────────────────

function createRecord(
  eventType: ChargingEventType,
  level: number,
  speedBucket: ChargingSpeedBucket | null,
  durationBucket: CallDurationBucket | null,
): BatteryChargingRecord {
  const now = new Date()
  return {
    schema: 'U-M09-v1',
    pseudoId: getPseudoId(),
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    eventType,
    batteryLevelBucket: classifyBatteryLevel(level),
    chargingSpeedBucket: speedBucket,
    chargingDurationBucket: durationBucket,
  }
}

function handleChargingChange(battery: BatteryManager): void {
  const isCharging = battery.charging
  const level = battery.level

  if (isCharging) {
    // 충전 시작
    saveChargingState({
      isCharging: true,
      levelAtStart: level,
      startedAtMs: Date.now(),
    })
    appendRecord(createRecord('start', level, null, null))
  } else {
    // 충전 종료
    const prev = loadChargingState()
    let speedBucket: ChargingSpeedBucket | null = null
    let durationBucket: CallDurationBucket | null = null

    if (prev?.isCharging) {
      const durationSec = (Date.now() - prev.startedAtMs) / 1000
      const levelDelta = level - prev.levelAtStart
      speedBucket = classifyChargingSpeed(levelDelta, durationSec / 60)
      durationBucket = classifyDuration(durationSec)
    }

    saveChargingState(null)
    appendRecord(createRecord('end', level, speedBucket, durationBucket))
  }
}

// ── Battery API type (not in standard lib) ──────────────────────────────────

interface BatteryManager extends EventTarget {
  charging: boolean
  chargingTime: number
  dischargingTime: number
  level: number
  onchargingchange: ((this: BatteryManager, ev: Event) => void) | null
  onlevelchange: ((this: BatteryManager, ev: Event) => void) | null
}

// ── Public API ──────────────────────────────────────────────────────────────

let _battery: BatteryManager | null = null
let _started = false

/**
 * 배터리 이벤트 수집 시작.
 * navigator.getBattery() 지원 시 자동 이벤트 리스닝.
 */
export async function startBatteryCollector(): Promise<boolean> {
  if (_started) return true
  if (!('getBattery' in navigator)) return false

  try {
    _battery = await (navigator as any).getBattery()
    if (!_battery) return false

    _battery.addEventListener('chargingchange', () => {
      if (_battery) handleChargingChange(_battery)
    })

    // 초기 상태 기록
    if (_battery.charging) {
      const existing = loadChargingState()
      if (!existing) {
        saveChargingState({
          isCharging: true,
          levelAtStart: _battery.level,
          startedAtMs: Date.now(),
        })
      }
    }

    _started = true
    return true
  } catch {
    return false
  }
}

/** 수집된 배터리 레코드 반환 */
export function getBatteryRecords(): BatteryChargingRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getBatteryRecordsByDate(dateBucket: string): BatteryChargingRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}
