// ── U-P01 Photo Pattern Collector ──────────────────────────────────────────
// Capacitor Filesystem readdir() 기반 촬영 행동 패턴 수집
// 수집: 파일 수, 크기, 확장자, 수정일(2h 버킷) — 내용 열람 없음
// 저장 금지: 이미지 내용, EXIF GPS, 파일명(원문), OCR, 앱명

import { type PhotoPatternRecord } from '../types/metadata'
import { type TimeBucket2h } from '../types/audioAsset'
import { generateUUID } from './uuid'

// ── 유틸 ──────────────────────────────────────────────────────────────────

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

function dateToBucket(ts: number): { dateBucket: string; timeBucket: TimeBucket2h } {
  const d = new Date(ts)
  const dateBucket = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { dateBucket, timeBucket: hourToTimeBucket(d.getHours()) }
}

// ── localStorage 관리 ──────────────────────────────────────────────────

const RECORDS_KEY = 'uncounted_photo_pattern_records'
const SCAN_STATE_KEY = 'uncounted_photo_scan_state'
const MAX_RECORDS = 1500

function loadRecords(): PhotoPatternRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveRecords(records: PhotoPatternRecord[]) {
  // 최대 MAX_RECORDS 유지 (오래된 것부터 제거)
  const trimmed = records.length > MAX_RECORDS
    ? records.slice(records.length - MAX_RECORDS)
    : records
  localStorage.setItem(RECORDS_KEY, JSON.stringify(trimmed))
}

type ScanState = {
  lastScanDate: string  // YYYY-MM-DD
}

function loadScanState(): ScanState | null {
  try {
    const raw = localStorage.getItem(SCAN_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveScanState(state: ScanState) {
  localStorage.setItem(SCAN_STATE_KEY, JSON.stringify(state))
}

// ── 핵심: 디렉토리 스캔 → 버킷 집계 ──────────────────────────────────

type FileInfo = {
  type: 'photo' | 'video' | 'unknown'
  isScreenshot: boolean
  isSelfCreated: boolean
  mtime: number
  size: number
}

async function scanMediaFiles(): Promise<FileInfo[]> {
  return []
}

// ── 집계: FileInfo[] → PhotoPatternRecord[] ──────────────────────────

type BucketKey = string  // `${dateBucket}_${timeBucket}`

function aggregateToRecords(files: FileInfo[]): PhotoPatternRecord[] {
  const pseudoId = getPseudoId()
  const bucketMap = new Map<BucketKey, {
    dateBucket: string
    timeBucket: TimeBucket2h
    photoCount: number
    videoCount: number
    screenshotCount: number
    selfCreatedCount: number
    totalFileCount: number
    mtimes: number[]  // burst 감지용
    totalSize: number
  }>()

  for (const f of files) {
    if (!f.mtime) continue
    const { dateBucket, timeBucket } = dateToBucket(f.mtime)
    const key = `${dateBucket}_${timeBucket}`

    let bucket = bucketMap.get(key)
    if (!bucket) {
      bucket = {
        dateBucket,
        timeBucket,
        photoCount: 0,
        videoCount: 0,
        screenshotCount: 0,
        selfCreatedCount: 0,
        totalFileCount: 0,
        mtimes: [],
        totalSize: 0,
      }
      bucketMap.set(key, bucket)
    }

    if (f.isScreenshot) {
      bucket.screenshotCount++
    } else if (f.type === 'photo') {
      bucket.photoCount++
    } else {
      bucket.videoCount++
    }
    if (f.isSelfCreated) bucket.selfCreatedCount++
    bucket.totalFileCount++
    bucket.mtimes.push(f.mtime)
    bucket.totalSize += f.size
  }

  const records: PhotoPatternRecord[] = []
  for (const b of bucketMap.values()) {
    // Burst 감지: 2초 이내 연속 촬영 그룹 수
    b.mtimes.sort((a, c) => a - c)
    let burstGroupCount = 0
    let inBurst = false
    for (let i = 1; i < b.mtimes.length; i++) {
      if (b.mtimes[i] - b.mtimes[i - 1] <= 2000) {
        if (!inBurst) {
          burstGroupCount++
          inBurst = true
        }
      } else {
        inBurst = false
      }
    }

    records.push({
      schema: 'U-P01-v1',
      pseudoId,
      dateBucket: b.dateBucket,
      timeBucket: b.timeBucket,
      photoCount: b.photoCount,
      videoCount: b.videoCount,
      screenshotCount: b.screenshotCount,
      burstGroupCount,
      selfCreatedRatio: b.totalFileCount > 0
        ? Math.round((b.selfCreatedCount / b.totalFileCount) * 100) / 100
        : 0,
      totalSizeMb: Math.round(b.totalSize / (1024 * 1024) * 10) / 10,
    })
  }

  return records
}

// ── 공개 API ──────────────────────────────────────────────────────────

/**
 * 사진 패턴 컬렉터 시작 — 앱 시작 시 1회 호출
 * 네이티브 플랫폼에서만 동작 (웹은 Filesystem 접근 불가)
 * 하루 1회만 스캔 (이미 오늘 스캔했으면 건너뜀)
 */
export async function startPhotoPatternCollector(): Promise<boolean> {
  const today = todayBucket()
  const state = loadScanState()
  if (state?.lastScanDate === today) return true  // 이미 오늘 스캔함

  try {
    const files = await scanMediaFiles()
    if (files.length === 0) return false

    // 최근 30일치만 레코드로 변환 (과거 전체를 매번 저장할 필요 없음)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recentFiles = files.filter(f => f.mtime >= thirtyDaysAgo)

    const newRecords = aggregateToRecords(recentFiles)
    if (newRecords.length === 0) return false

    // 기존 레코드에서 새로 집계한 날짜 범위와 겹치는 것은 교체
    const newDates = new Set(newRecords.map(r => r.dateBucket))
    const existing = loadRecords().filter(r => !newDates.has(r.dateBucket))
    saveRecords([...existing, ...newRecords])
    saveScanState({ lastScanDate: today })

    return true
  } catch {
    return false
  }
}

/** 저장된 전체 레코드 반환 */
export function getPhotoPatternRecords(): PhotoPatternRecord[] {
  return loadRecords()
}

/** 특정 날짜 레코드 반환 */
export function getPhotoPatternRecordsByDate(dateBucket: string): PhotoPatternRecord[] {
  return loadRecords().filter(r => r.dateBucket === dateBucket)
}
