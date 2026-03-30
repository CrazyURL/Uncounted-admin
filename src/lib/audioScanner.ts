// ── 오디오 스캐너 — 확장 DSP 지표 ───────────────────────────────────────────
// 온디바이스 규칙 기반 (GPU 추론 없음)
// 추가 지표: audio_hash, quality_grade, time_bucket, device_bucket, 집계

import { type Session } from '../types/session'
import { type SkuId } from '../types/sku'
import {
  type AudioScanRecord,
  type AudioScanAggregate,
  type AudioQualityGrade,
  type AudioCodec,
  type TimeBucket2h,
  type DeviceBucket,
  AUDIO_HASH_CACHE_KEY,
} from '../types/audioAsset'

// ── SHA-256 해시 (Web Crypto API) ────────────────────────────────────────────

export async function calcAudioHash(buffer: ArrayBuffer): Promise<string> {
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Web Crypto 미지원 환경 — sessionId 기반 폴백 (중복 탐지 불가)
    return ''
  }
}

// ── 시간 버킷 (2h) ────────────────────────────────────────────────────────────
// 정밀 타임스탬프 저장 금지 — 2h 버킷으로 변환

export function calcTimeBucket(date?: Date): TimeBucket2h {
  const h = (date ?? new Date()).getHours()
  const start = Math.floor(h / 2) * 2
  const end = start + 2
  return `${String(start).padStart(2, '0')}-${String(end === 24 ? 24 : end).padStart(2, '0')}` as TimeBucket2h
}

// ── 기기/환경 버킷 ────────────────────────────────────────────────────────────
// navigator.connection + navigator.getBattery() — 정밀 위치 없음

export async function calcDeviceBucket(): Promise<DeviceBucket> {
  if (!navigator.onLine) return 'offline'

  let isCharging = false
  let isWifi = false

  try {
    // Battery API (Chrome + Android WebView)
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean }> }
    if (nav.getBattery) {
      const battery = await nav.getBattery()
      isCharging = battery.charging
    }
  } catch {
    // Battery API 미지원
  }

  try {
    // Network Information API
    type NetInfo = { type?: string; effectiveType?: string }
    const conn = (
      (navigator as Navigator & { connection?: NetInfo; mozConnection?: NetInfo; webkitConnection?: NetInfo })
        .connection ??
      (navigator as Navigator & { mozConnection?: NetInfo }).mozConnection ??
      (navigator as Navigator & { webkitConnection?: NetInfo }).webkitConnection
    )
    if (conn) {
      const t = conn.type ?? conn.effectiveType ?? ''
      isWifi = t === 'wifi' || t === '4g' || t === ''
    } else {
      isWifi = true // 정보 없으면 WiFi로 가정
    }
  } catch {
    isWifi = true
  }

  if (isWifi && isCharging) return 'wifi_charging'
  if (isWifi && !isCharging) return 'wifi_battery'
  if (!isWifi && isCharging) return 'mobile_charging'
  return 'mobile_battery'
}

// ── 코덱 감지 (확장자 기반) ───────────────────────────────────────────────────

export function detectCodec(filename: string): AudioCodec {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, AudioCodec> = {
    m4a: 'm4a', aac: 'aac', mp3: 'mp3',
    ogg: 'ogg', wav: 'wav', opus: 'opus',
  }
  return map[ext] ?? 'unknown'
}

// ── 품질 점수 계산 (0~100, DSP 기반) ─────────────────────────────────────────
// 가중치: SNR 35% + 유효발화 25% + 비트레이트 20% + 샘플레이트 15% + 비클리핑 5%

export function calcQualityScore(params: {
  snrDb: number
  validSpeechRatio: number
  bitrate: number        // kbps
  sampleRate: number     // Hz
  clippingRate: number
}): number {
  const snrScore =
    params.snrDb >= 30 ? 1.0
    : params.snrDb >= 20 ? 0.8
    : params.snrDb >= 10 ? 0.5
    : 0.2

  const speechScore =
    params.validSpeechRatio >= 0.7 ? 1.0
    : params.validSpeechRatio >= 0.5 ? 0.85
    : params.validSpeechRatio >= 0.3 ? 0.65
    : 0.3

  const bitrateScore =
    params.bitrate >= 192 ? 1.0
    : params.bitrate >= 128 ? 0.85
    : params.bitrate >= 96 ? 0.65
    : params.bitrate >= 64 ? 0.45
    : 0.2

  const srScore =
    params.sampleRate >= 44100 ? 1.0
    : params.sampleRate >= 16000 ? 0.8
    : params.sampleRate >= 8000 ? 0.5
    : 0.3

  const noClipScore =
    params.clippingRate <= 0.001 ? 1.0
    : params.clippingRate <= 0.01 ? 0.8
    : params.clippingRate <= 0.05 ? 0.4
    : 0.1

  const composite =
    snrScore * 0.35 +
    speechScore * 0.25 +
    bitrateScore * 0.20 +
    srScore * 0.15 +
    noClipScore * 0.05

  return Math.min(100, Math.round(composite * 100))
}

export function calcQualityGrade(score: number): AudioQualityGrade {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  return 'C'
}

// ── 오디오 스캔 레코드 빌더 ───────────────────────────────────────────────────
// Session + 선택적 오디오 메트릭으로 AudioScanRecord 구성

export async function buildAudioScanRecord(
  session: Session,
  opts: {
    filename?: string
    buffer?: ArrayBuffer   // 제공 시 audioHash 계산
    fileDate?: Date        // 파일 생성일 (없으면 현재)
  } = {},
): Promise<AudioScanRecord> {
  const { filename = '', buffer, fileDate } = opts

  // 기존 캐시에서 hash 중복 체크
  let audioHash = ''
  let duplicateFlag = false

  if (buffer) {
    audioHash = await calcAudioHash(buffer)
    if (audioHash) {
      try {
        const cached = JSON.parse(localStorage.getItem(AUDIO_HASH_CACHE_KEY) ?? '[]') as string[]
        duplicateFlag = cached.includes(audioHash)
        if (!duplicateFlag) {
          localStorage.setItem(AUDIO_HASH_CACHE_KEY, JSON.stringify([...cached, audioHash].slice(-5000)))
        }
      } catch {
        // localStorage 접근 실패
      }
    }
  }

  // audioMetrics에서 지표 추출 (없으면 session 점수 기반 추정)
  const m = session.audioMetrics
  const silenceRatio = m ? m.silenceRatio : 0.25
  const validSpeechRatio = 1 - silenceRatio
  const snrDb = m ? m.snrDb : 18
  const bitrate = m ? m.bitrate : Math.round((session.duration > 0 ? 0 : 128))
  const sampleRate = m ? m.sampleRate : 44100
  const clippingRate = m ? m.clippingRatio : 0
  const noiseLevelScore = m ? Math.min(1, Math.max(0, 1 - m.snrDb / 42)) : 0.3

  const qualityScore = calcQualityScore({ snrDb, validSpeechRatio, bitrate, sampleRate, clippingRate })

  const timeBucket = calcTimeBucket(fileDate)
  const deviceBucket = await calcDeviceBucket()

  return {
    sessionId: session.id,
    audioHash,
    durationSec: session.duration,
    fileSizeBytes: 0,  // 호출 측에서 실제 값 주입
    codec: detectCodec(filename),
    sampleRate,
    channels: m ? m.channels : 1,
    validSpeechRatio: Math.round(validSpeechRatio * 100) / 100,
    silenceRatio: Math.round(silenceRatio * 100) / 100,
    noiseLevelScore: Math.round(noiseLevelScore * 100) / 100,
    clippingRate: Math.round(clippingRate * 10000) / 10000,
    qualityScore,
    qualityGrade: calcQualityGrade(qualityScore),
    duplicateFlag,
    timeBucket,
    deviceBucket,
    scannedAt: new Date().toISOString().slice(0, 10),
  }
}

// ── 집계 계산 ──────────────────────────────────────────────────────────────────

export function aggregateScanRecords(
  records: AudioScanRecord[],
  sessions: Session[],
): AudioScanAggregate {
  if (records.length === 0) {
    return {
      totalFiles: 0, totalHours: 0, totalSizeBytes: 0,
      usableHoursLow: 0, usableHoursHigh: 0, avgValidSpeechRatio: 0.75,
      duplicateHoursEstimate: 0,
      qualityGradeDistribution: { A: 0, B: 0, C: 0 },
      avgQualityScore: 0,
      skuEligibleCounts: {},
      bundleEligibleCounts: { P1: 0, P2: 0, P3: 0 },
    }
  }

  const totalHours = records.reduce((s, r) => s + r.durationSec / 3600, 0)
  const totalSizeBytes = records.reduce((s, r) => s + r.fileSizeBytes, 0)
  const avgValidSpeechRatio =
    records.reduce((s, r) => s + r.validSpeechRatio, 0) / records.length
  const avgQualityScore =
    Math.round(records.reduce((s, r) => s + r.qualityScore, 0) / records.length)

  const usableHoursBase = totalHours * avgValidSpeechRatio
  const usableHoursLow = Math.round(usableHoursBase * 0.70 * 10) / 10
  const usableHoursHigh = Math.round(usableHoursBase * 0.90 * 10) / 10

  const duplicateHoursEstimate =
    records.filter((r) => r.duplicateFlag).reduce((s, r) => s + r.durationSec / 3600, 0)

  const gradeDistribution = { A: 0, B: 0, C: 0 }
  for (const r of records) gradeDistribution[r.qualityGrade]++

  // SKU 적합 파일 수 계산
  const skuEligibleCounts: Partial<Record<SkuId, number>> = {}
  const labeled = sessions.filter((s) => s.labels !== null)

  // U-A01: qualityScore >= 50, durationSec >= 30, 중복 아님
  skuEligibleCounts['U-A01'] = records.filter(
    (r) => r.qualityScore >= 50 && r.durationSec >= 30 && !r.duplicateFlag
  ).length

  // U-A02: A01 기준 + 라벨 있음 (세션 기준)
  const labeledIds = new Set(labeled.map((s) => s.id))
  skuEligibleCounts['U-A02'] = records.filter(
    (r) => r.qualityScore >= 50 && r.durationSec >= 30 && !r.duplicateFlag && labeledIds.has(r.sessionId)
  ).length

  // U-A03: A02 기준 + domain/tone 라벨 있음
  const domainLabeledIds = new Set(
    sessions.filter((s) => s.labels?.domain || s.labels?.purpose).map((s) => s.id)
  )
  skuEligibleCounts['U-A03'] = records.filter(
    (r) => r.qualityScore >= 50 && r.durationSec >= 30 && !r.duplicateFlag && domainLabeledIds.has(r.sessionId)
  ).length

  // U-M01: 동의 ON 시 전체 (메타데이터 수집 동의 기준 — 여기선 추정)
  skuEligibleCounts['U-M01'] = records.length

  // U-M05: 전체 (항상 수집 가능)
  skuEligibleCounts['U-M05'] = records.length

  // 번들 적합 수
  const p1Eligible = skuEligibleCounts['U-M05'] ?? 0
  const p2Eligible = 0  // U-M02 MVP 불가
  const p3Eligible = p1Eligible  // U-M05 + 라벨

  return {
    totalFiles: records.length,
    totalHours: Math.round(totalHours * 10) / 10,
    totalSizeBytes,
    usableHoursLow,
    usableHoursHigh,
    avgValidSpeechRatio: Math.round(avgValidSpeechRatio * 100) / 100,
    duplicateHoursEstimate: Math.round(duplicateHoursEstimate * 10) / 10,
    qualityGradeDistribution: gradeDistribution,
    avgQualityScore,
    skuEligibleCounts,
    bundleEligibleCounts: { P1: p1Eligible, P2: p2Eligible, P3: p3Eligible },
  }
}

// ── JSONL 레코드 생성 ─────────────────────────────────────────────────────────
// 서버 전송용 JSONL 행 생성

export function toJSONLRecord(
  record: AudioScanRecord,
  pseudoId: string,
  skuSchema: 'U-A01-v1' | 'U-A02-v1' | 'U-A03-v1',
  extraFields?: Record<string, unknown>,
): string {
  return JSON.stringify({
    schema: skuSchema,
    pseudo_id: pseudoId,
    session_id: record.sessionId,
    audio_hash: record.audioHash,
    duration_sec: record.durationSec,
    valid_speech_ratio: record.validSpeechRatio,
    silence_ratio: record.silenceRatio,
    noise_level_score: record.noiseLevelScore,
    clipping_rate: record.clippingRate,
    quality_score: record.qualityScore,
    quality_grade: record.qualityGrade,
    sample_rate: record.sampleRate,
    codec: record.codec,
    time_bucket: record.timeBucket,
    device_bucket: record.deviceBucket,
    ...extraFields,
  })
}
