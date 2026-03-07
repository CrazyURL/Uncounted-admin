// ── 오디오 자산 확장 스캔 타입 ────────────────────────────────────────────────
// 레코드 단위 + 집계 타입
// 정책: GPU 추론 금지 (온디바이스 DSP/규칙만), 정밀 위치/타임스탬프 저장 금지

import { type SkuId } from './sku'

// ── 시간 버킷 ─────────────────────────────────────────────────────────────────

// 기본: 2h 버킷 (12개) — 시각 정보 최소화
export type TimeBucket2h =
  | '00-02' | '02-04' | '04-06' | '06-08' | '08-10' | '10-12'
  | '12-14' | '14-16' | '16-18' | '18-20' | '20-22' | '22-24'

// 옵션: 6h 버킷 (4개) — 더 강한 프라이버시
export type TimeBucket6h = '00-06' | '06-12' | '12-18' | '18-24'

// ── 기기/환경 버킷 ────────────────────────────────────────────────────────────

export type DeviceBucket =
  | 'wifi_charging'    // WiFi 연결 + 충전 중
  | 'wifi_battery'     // WiFi 연결 + 배터리
  | 'mobile_charging'  // 모바일 데이터 + 충전 중
  | 'mobile_battery'   // 모바일 데이터 + 배터리
  | 'offline'          // 연결 없음

// ── 품질 등급 ─────────────────────────────────────────────────────────────────

export type AudioQualityGrade = 'A' | 'B' | 'C'  // A≥75점, B≥50점, C<50점

// ── 코덱 타입 ─────────────────────────────────────────────────────────────────

export type AudioCodec = 'm4a' | 'aac' | 'mp3' | 'ogg' | 'wav' | 'opus' | 'unknown'

// ── 오디오 스캔 레코드 (파일 단위) ───────────────────────────────────────────

export type AudioScanRecord = {
  sessionId: string
  audioHash: string                // SHA-256 hex (64자) — 중복 탐지용
  durationSec: number
  fileSizeBytes: number
  codec: AudioCodec
  sampleRate: number               // Hz (e.g. 44100, 16000, 8000)
  channels: number                 // 1=mono, 2=stereo
  validSpeechRatio: number         // 0~1 (= 1 - silenceRatio)
  silenceRatio: number             // 0~1 (0=무음 없음, 1=전체 무음)
  noiseLevelScore: number          // 0~1 (RMS 기반, 높을수록 잡음 많음)
  clippingRate: number             // 0~1 (클리핑 샘플 비율)
  qualityScore: number             // 0~100 (복합 지수)
  qualityGrade: AudioQualityGrade
  duplicateFlag: boolean           // 동일 audioHash 기존 존재 여부
  timeBucket: TimeBucket2h         // 파일 생성 시각 기준 2h 버킷
  deviceBucket: DeviceBucket       // 스캔 시점 기기/네트워크 상태
  scannedAt: string                // 스캔 날짜 'YYYY-MM-DD' (정밀 시각 금지)
}

// ── 집계 타입 (세션 목록 전체 기준) ─────────────────────────────────────────

export type AudioScanAggregate = {
  totalFiles: number
  totalHours: number               // 총 음성 시간 (확정)
  totalSizeBytes: number
  usableHoursLow: number           // totalHours × avgValidSpeechRatio × 0.70
  usableHoursHigh: number          // totalHours × avgValidSpeechRatio × 0.90
  avgValidSpeechRatio: number      // 평균 유효발화 비율
  duplicateHoursEstimate: number   // 중복 의심 파일 합계 시간
  qualityGradeDistribution: { A: number; B: number; C: number }  // 파일 수
  avgQualityScore: number
  skuEligibleCounts: Partial<Record<SkuId, number>>  // SKU별 적합 파일 수
  bundleEligibleCounts: { P1: number; P2: number; P3: number }
}

// ── 오디오 해시 캐시 키 ───────────────────────────────────────────────────────
// localStorage에 보관하여 중복 탐지에 활용

export const AUDIO_HASH_CACHE_KEY = 'uncounted_audio_hashes'  // Set<string> JSON
