// ── U-M07 Call Time Pattern Collector ──────────────────────────────────────
// U-M01(통화 메타데이터) 재가공: 요일/시간대별 통화 빈도 히트맵
// 기존 스캔된 세션 데이터에서 파생 — 별도 권한 불필요
// 저장 금지: 상대방 번호/이름, 정밀 시각, 내용

import { type Session } from '../types/session'
import {
  type CallTimePatternRecord,
  type DayOfWeek,
  type CallFrequencyBucket,
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

function hourToTimeBucket(hour: number): TimeBucket2h {
  const buckets: TimeBucket2h[] = [
    '00-02', '02-04', '04-06', '06-08', '08-10', '10-12',
    '12-14', '14-16', '16-18', '18-20', '20-22', '22-24',
  ]
  return buckets[Math.min(Math.floor(hour / 2), 11)]
}

function dateToDayOfWeek(d: Date): DayOfWeek {
  const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return days[d.getDay()]
}

function classifyFrequency(count: number): CallFrequencyBucket {
  if (count === 0) return 'none'
  if (count <= 3) return 'low'
  if (count <= 10) return 'moderate'
  return 'high'
}

function classifyDuration(durationSec: number): CallDurationBucket {
  if (durationSec < 30) return 'under_30s'
  if (durationSec < 180) return '30s_3m'
  if (durationSec < 900) return '3m_15m'
  if (durationSec < 3600) return '15m_60m'
  return 'over_60m'
}

// ── 세션 → 월별 통화 패턴 집계 ──────────────────────────────────────────────

type SlotKey = string  // 'YYYY-MM|dayOfWeek|timeBucket'

type SlotData = {
  monthBucket: string
  dayOfWeek: DayOfWeek
  timeBucket: TimeBucket2h
  count: number
  totalDuration: number
  incomingCount: number
}

/**
 * 세션 목록에서 월별 요일×시간대 통화 패턴을 집계.
 * 세션의 date 필드(ISO 문자열)와 duration(초)을 사용.
 */
export function deriveCallTimePatterns(sessions: Session[]): CallTimePatternRecord[] {
  const pseudoId = getPseudoId()
  const slots = new Map<SlotKey, SlotData>()

  for (const s of sessions) {
    const d = new Date(s.date)
    if (isNaN(d.getTime())) continue

    const monthBucket = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const dayOfWeek = dateToDayOfWeek(d)
    const timeBucket = hourToTimeBucket(d.getHours())
    const key = `${monthBucket}|${dayOfWeek}|${timeBucket}`

    const existing = slots.get(key)
    if (existing) {
      existing.count++
      existing.totalDuration += s.duration
      // title에 "수신" 또는 incoming 힌트가 있으면 incoming으로 간주
      if (s.title.includes('수신') || s.title.includes('Incoming')) {
        existing.incomingCount++
      }
    } else {
      slots.set(key, {
        monthBucket,
        dayOfWeek,
        timeBucket,
        count: 1,
        totalDuration: s.duration,
        incomingCount: s.title.includes('수신') || s.title.includes('Incoming') ? 1 : 0,
      })
    }
  }

  const records: CallTimePatternRecord[] = []
  for (const slot of slots.values()) {
    const avgDuration = slot.totalDuration / slot.count
    records.push({
      schema: 'U-M07-v1',
      pseudoId,
      dateBucket: slot.monthBucket,
      dayOfWeek: slot.dayOfWeek,
      timeBucket: slot.timeBucket,
      callFrequencyBucket: classifyFrequency(slot.count),
      avgDurationBucket: classifyDuration(avgDuration),
      incomingRatio: slot.count > 0
        ? Math.round((slot.incomingCount / slot.count) * 100) / 100
        : 0,
    })
  }

  return records
}

// ── localStorage 저장/로드 ──────────────────────────────────────────────────

const CALL_PATTERN_KEY = 'uncounted_call_time_patterns'

export function saveCallTimePatterns(records: CallTimePatternRecord[]): void {
  localStorage.setItem(CALL_PATTERN_KEY, JSON.stringify(records))
}

export function loadCallTimePatterns(): CallTimePatternRecord[] {
  try {
    const raw = localStorage.getItem(CALL_PATTERN_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * 세션 목록에서 패턴을 파생하고 저장.
 * 기존 데이터를 교체 (전체 재계산).
 */
export function refreshCallTimePatterns(sessions: Session[]): CallTimePatternRecord[] {
  const patterns = deriveCallTimePatterns(sessions)
  saveCallTimePatterns(patterns)
  return patterns
}
