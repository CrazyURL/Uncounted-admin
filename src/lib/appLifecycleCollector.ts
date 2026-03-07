// ── U-M16 App Lifecycle Collector ─────────────────────────────────────────────
// Android: PACKAGE_ADDED/REMOVED broadcast → 앱 카테고리만 기록
// Web: 네이티브 플러그인 없이는 수집 불가 → Capacitor 플러그인 브릿지만 제공
// 저장 금지: 패키지명, 앱명, 정밀 시각

import {
  type AppLifecycleRecord,
  type AppLifecycleEventType,
  type AppCategory,
  type AppRetentionBucket,
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

// ── retention 계산 ──────────────────────────────────────────────────────────

function calcRetentionBucket(installDateStr: string | null): AppRetentionBucket | null {
  if (!installDateStr) return null
  try {
    const installDate = new Date(installDateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - installDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 1) return 'flash'
    if (diffDays < 7) return 'short'
    if (diffDays < 30) return 'medium'
    if (diffDays < 90) return 'long'
    return 'retained'
  } catch {
    return null
  }
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const APP_LIFECYCLE_RECORDS_KEY = 'uncounted_app_lifecycle_records'

function loadRecords(): AppLifecycleRecord[] {
  try {
    const raw = localStorage.getItem(APP_LIFECYCLE_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: AppLifecycleRecord[]): void {
  if (records.length > 1000) records.splice(0, records.length - 1000)
  localStorage.setItem(APP_LIFECYCLE_RECORDS_KEY, JSON.stringify(records))
}

// ── 이벤트 기록 ─────────────────────────────────────────────────────────────

/**
 * 앱 설치/삭제/업데이트 이벤트를 기록한다.
 * Capacitor 네이티브 플러그인에서 호출.
 *
 * @param eventType - 'install' | 'uninstall' | 'update'
 * @param appCategory - Play Store 카테고리 (앱명 없음)
 * @param installDate - 설치일 (삭제 시 retention 계산용, ISO string)
 */
export function recordAppLifecycleEvent(
  eventType: AppLifecycleEventType,
  appCategory: AppCategory,
  installDate?: string,
): void {
  const now = new Date()
  const retentionBucket = eventType === 'uninstall'
    ? calcRetentionBucket(installDate ?? null)
    : null

  const record: AppLifecycleRecord = {
    schema: 'U-M16-v1',
    pseudoId: getPseudoId(),
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    eventType,
    appCategory,
    retentionBucket,
  }

  const records = loadRecords()
  records.push(record)
  saveRecords(records)
}

// ── Capacitor 플러그인 브릿지 (네이티브 이벤트 수신) ───────────────────────

let _bridgeStarted = false

/**
 * Capacitor 네이티브 플러그인 리스너 등록.
 * 실제 네이티브 플러그인이 없으면 아무 동작 없이 false 반환.
 *
 * 네이티브 플러그인 구현 시:
 * - BroadcastReceiver: PACKAGE_ADDED, PACKAGE_REMOVED, PACKAGE_REPLACED
 * - 패키지명 → Play Store API → 카테고리만 추출
 * - 패키지명/앱명 WebView로 전달 금지
 */
export function startAppLifecycleBridge(): boolean {
  if (_bridgeStarted) return true

  try {
    // Capacitor 플러그인 이벤트 수신
    // window.addEventListener를 통한 네이티브 → WebView 이벤트 브릿지
    window.addEventListener('uncounted:app-lifecycle', ((ev: CustomEvent<{
      eventType: AppLifecycleEventType
      appCategory: AppCategory
      installDate?: string
    }>) => {
      const { eventType, appCategory, installDate } = ev.detail
      recordAppLifecycleEvent(eventType, appCategory, installDate)
    }) as EventListener)

    _bridgeStarted = true
    return true
  } catch {
    return false
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** 수집된 앱 라이프사이클 레코드 반환 */
export function getAppLifecycleRecords(): AppLifecycleRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getAppLifecycleRecordsByDate(dateBucket: string): AppLifecycleRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}
