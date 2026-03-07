// ── U-M18 Media Playback Collector ───────────────────────────────────────────
// MediaSession API (Web, 제한적) + AudioFocus (Android 네이티브)
// → 카테고리별 재생 시간, 재생 속도, 스킵/일시정지 패턴
// 저장 금지: 앱명, 콘텐츠 제목, 아티스트, URL

import {
  type MediaPlaybackRecord,
  type MediaCategory,
  type PlaybackSpeedBucket,
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

// ── 재생 속도 분류 ──────────────────────────────────────────────────────────

function classifyPlaybackSpeed(rate: number): PlaybackSpeedBucket {
  if (rate < 0.9) return 'slow'
  if (rate <= 1.1) return 'normal'
  return 'fast'
}

// ── localStorage 저장 ───────────────────────────────────────────────────────

const MEDIA_RECORDS_KEY = 'uncounted_media_playback_records'
const MEDIA_STATE_KEY = 'uncounted_media_playback_state'

type MediaBucketState = {
  dateBucket: string
  timeBucket: string
  /** 카테고리별 집계 */
  categories: Partial<Record<MediaCategory, {
    totalMs: number
    speeds: number[]        // 재생 속도 기록 (평균용)
    skipCount: number
    pauseCount: number
  }>>
}

function loadRecords(): MediaPlaybackRecord[] {
  try {
    const raw = localStorage.getItem(MEDIA_RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecords(records: MediaPlaybackRecord[]): void {
  if (records.length > 2000) records.splice(0, records.length - 2000)
  localStorage.setItem(MEDIA_RECORDS_KEY, JSON.stringify(records))
}

function loadState(): MediaBucketState | null {
  try {
    const raw = localStorage.getItem(MEDIA_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(state: MediaBucketState): void {
  localStorage.setItem(MEDIA_STATE_KEY, JSON.stringify(state))
}

function newBucketState(): MediaBucketState {
  const now = new Date()
  return {
    dateBucket: todayBucket(),
    timeBucket: hourToTimeBucket(now.getHours()),
    categories: {},
  }
}

// ── 시간대 전환 시 flush ────────────────────────────────────────────────────

function flushBucketIfNeeded(state: MediaBucketState): MediaBucketState {
  const now = new Date()
  const currentTimeBucket = hourToTimeBucket(now.getHours())
  const currentDateBucket = todayBucket()

  if (state.timeBucket === currentTimeBucket && state.dateBucket === currentDateBucket) {
    return state
  }

  // 이전 시간대 카테고리별 레코드 저장
  const records = loadRecords()
  const pseudoId = getPseudoId()

  for (const [cat, data] of Object.entries(state.categories)) {
    if (!data || data.totalMs <= 0) continue

    const avgSpeed = data.speeds.length > 0
      ? data.speeds.reduce((s, v) => s + v, 0) / data.speeds.length
      : 1.0

    records.push({
      schema: 'U-M18-v1',
      pseudoId,
      dateBucket: state.dateBucket,
      timeBucket: state.timeBucket as TimeBucket2h,
      mediaCategory: cat as MediaCategory,
      totalMinutes: Math.round(data.totalMs / 60_000 * 10) / 10,
      playbackSpeedBucket: classifyPlaybackSpeed(avgSpeed),
      skipCount: data.skipCount,
      pauseCount: data.pauseCount,
    })
  }

  saveRecords(records)

  return {
    dateBucket: currentDateBucket,
    timeBucket: currentTimeBucket,
    categories: {},
  }
}

// ── 이벤트 처리 ─────────────────────────────────────────────────────────────

function ensureCategory(state: MediaBucketState, cat: MediaCategory) {
  if (!state.categories[cat]) {
    state.categories[cat] = {
      totalMs: 0,
      speeds: [],
      skipCount: 0,
      pauseCount: 0,
    }
  }
}

/**
 * 재생 시간 기록 (네이티브 또는 Web에서 호출).
 * @param category - 미디어 카테고리
 * @param durationMs - 이번 재생 세그먼트 길이 (ms)
 * @param playbackRate - 재생 속도 (1.0 = 보통)
 */
export function recordPlaybackSegment(
  category: MediaCategory,
  durationMs: number,
  playbackRate: number = 1.0,
): void {
  let state = loadState()
  if (!state) state = newBucketState()
  state = flushBucketIfNeeded(state)

  ensureCategory(state, category)
  const cat = state.categories[category]!
  cat.totalMs += durationMs
  if (cat.speeds.length < 100) {
    cat.speeds.push(playbackRate)
  }

  saveState(state)
}

/** 스킵 이벤트 기록 */
export function recordMediaSkip(category: MediaCategory): void {
  let state = loadState()
  if (!state) state = newBucketState()
  state = flushBucketIfNeeded(state)

  ensureCategory(state, category)
  state.categories[category]!.skipCount++

  saveState(state)
}

/** 일시정지 이벤트 기록 */
export function recordMediaPause(category: MediaCategory): void {
  let state = loadState()
  if (!state) state = newBucketState()
  state = flushBucketIfNeeded(state)

  ensureCategory(state, category)
  state.categories[category]!.pauseCount++

  saveState(state)
}

// ── Capacitor 네이티브 브릿지 ───────────────────────────────────────────────

let _bridgeStarted = false

/**
 * Capacitor 네이티브 플러그인 리스너 등록.
 * Android: AudioFocus + MediaController → 카테고리/시간/속도만 WebView로 전달.
 * 네이티브 미구현 시 false 반환.
 */
export function startMediaPlaybackBridge(): boolean {
  if (_bridgeStarted) return true

  try {
    // 네이티브 → WebView 이벤트 브릿지
    window.addEventListener('uncounted:media-playback', ((ev: CustomEvent<{
      type: 'segment' | 'skip' | 'pause'
      category: MediaCategory
      durationMs?: number
      playbackRate?: number
    }>) => {
      const { type, category, durationMs, playbackRate } = ev.detail
      switch (type) {
        case 'segment':
          recordPlaybackSegment(category, durationMs ?? 0, playbackRate ?? 1.0)
          break
        case 'skip':
          recordMediaSkip(category)
          break
        case 'pause':
          recordMediaPause(category)
          break
      }
    }) as EventListener)

    // 주기적 시간대 flush
    setInterval(() => {
      const s = loadState()
      if (s) {
        const flushed = flushBucketIfNeeded(s)
        saveState(flushed)
      }
    }, 10 * 60_000)

    _bridgeStarted = true
    return true
  } catch {
    return false
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** 수집된 미디어 재생 레코드 반환 */
export function getMediaPlaybackRecords(): MediaPlaybackRecord[] {
  return loadRecords()
}

/** 특정 날짜의 레코드만 필터 */
export function getMediaPlaybackRecordsByDate(dateBucket: string): MediaPlaybackRecord[] {
  return loadRecords().filter((r) => r.dateBucket === dateBucket)
}
