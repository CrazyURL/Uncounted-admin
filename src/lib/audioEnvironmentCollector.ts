// ── U-M06 Audio Environment Collector ──────────────────────────────────────
// 기존 audioAnalyzer.ts DSP 결과에서 음성 환경 프로필을 파생
// GPU 추론 금지 — 순수 규칙 기반 버킷 매핑
// 음성 내용과 무관한 환경/품질 특성만 기록

import { type AudioMetrics } from './audioAnalyzer'
import {
  type SnrBucket,
  type NoiseLevelBucket,
  type EnvironmentEstimate,
  type SpeechDensityBucket,
  type ClippingBucket,
  type CallDurationBucket,
  type AudioEnvironmentRecord,
} from '../types/metadata'
import { type TimeBucket2h } from '../types/audioAsset'

// ── SNR 버킷 (dB 기준) ──────────────────────────────────────────────────────

export function classifySnr(snrDb: number): SnrBucket {
  if (snrDb >= 25) return 'clean'
  if (snrDb >= 15) return 'moderate'
  return 'noisy'
}

// ── 노이즈 레벨 (RMS 기반) ──────────────────────────────────────────────────

export function classifyNoiseLevel(rms: number, silenceRatio: number): NoiseLevelBucket {
  // 무음 비율이 높으면 조용한 환경
  if (silenceRatio > 0.6 && rms < 0.05) return 'quiet'
  if (rms < 0.08) return 'quiet'
  if (rms < 0.2) return 'moderate'
  return 'loud'
}

// ── 환경 추정 (규칙 조합) ───────────────────────────────────────────────────

export function estimateEnvironment(
  snrDb: number,
  rms: number,
  silenceRatio: number,
  clippingRatio: number,
): EnvironmentEstimate {
  // 클리핑이 심하면 noisy
  if (clippingRatio > 0.01) return 'noisy'
  // 높은 SNR + 높은 무음비 → quiet_indoor (조용한 실내)
  if (snrDb >= 25 && silenceRatio > 0.3) return 'quiet_indoor'
  // 높은 SNR + 조용 → quiet_indoor
  if (snrDb >= 25 && rms < 0.15) return 'quiet_indoor'
  // 중간 SNR → moderate_indoor
  if (snrDb >= 15) return 'moderate_indoor'
  // 낮은 SNR + 높은 RMS → outdoor
  if (rms >= 0.15) return 'outdoor'
  // 낮은 SNR + 낮은 RMS → 배경 소음이 안정적인 noisy 환경
  if (snrDb < 10) return 'noisy'
  return 'moderate_indoor'
}

// ── 발화 밀도 (validSpeechRatio 기반) ───────────────────────────────────────

export function classifySpeechDensity(silenceRatio: number): SpeechDensityBucket {
  const speechRatio = 1 - silenceRatio
  if (speechRatio < 0.3) return 'sparse'
  if (speechRatio < 0.7) return 'normal'
  return 'dense'
}

// ── 클리핑 버킷 ─────────────────────────────────────────────────────────────

export function classifyClipping(clippingRatio: number): ClippingBucket {
  if (clippingRatio < 0.0001) return 'none'
  if (clippingRatio < 0.005) return 'light'
  return 'heavy'
}

// ── 녹음 길이 → 통화 길이 버킷 재사용 ──────────────────────────────────────

export function classifyDuration(durationSec: number): CallDurationBucket {
  if (durationSec < 30) return 'under_30s'
  if (durationSec < 180) return '30s_3m'
  if (durationSec < 900) return '3m_15m'
  if (durationSec < 3600) return '15m_60m'
  return 'over_60m'
}

// ── 품질 등급 (qualityFactor 기반) ──────────────────────────────────────────

export function classifyQualityGrade(qualityFactor: number): 'A' | 'B' | 'C' {
  if (qualityFactor >= 0.75) return 'A'
  if (qualityFactor >= 0.50) return 'B'
  return 'C'
}

// ── 시간 → 2h 버킷 ─────────────────────────────────────────────────────────

function hourToTimeBucket(hour: number): TimeBucket2h {
  const buckets: TimeBucket2h[] = [
    '00-02', '02-04', '04-06', '06-08', '08-10', '10-12',
    '12-14', '14-16', '16-18', '18-20', '20-22', '22-24',
  ]
  return buckets[Math.min(Math.floor(hour / 2), 11)]
}

// ── 메인: AudioMetrics → AudioEnvironmentRecord ─────────────────────────────

export function deriveAudioEnvironment(
  sessionId: string,
  metrics: AudioMetrics,
  durationSec: number,
  fileDate: string,       // ISO or YYYY-MM-DD
): AudioEnvironmentRecord {
  const date = new Date(fileDate)
  const dateBucket = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const timeBucket = hourToTimeBucket(date.getHours())

  return {
    schema: 'U-M06-v1',
    sessionId,
    dateBucket,
    timeBucket,
    snrBucket: classifySnr(metrics.snrDb),
    noiseLevelBucket: classifyNoiseLevel(metrics.rms, metrics.silenceRatio),
    environmentEstimate: estimateEnvironment(
      metrics.snrDb, metrics.rms, metrics.silenceRatio, metrics.clippingRatio,
    ),
    speechDensityBucket: classifySpeechDensity(metrics.silenceRatio),
    clippingBucket: classifyClipping(metrics.clippingRatio),
    sampleRate: metrics.sampleRate,
    channels: metrics.channels,
    durationBucket: classifyDuration(durationSec),
    qualityGrade: classifyQualityGrade(metrics.qualityFactor),
  }
}

// ── 배치 처리: 세션 목록 → AudioEnvironmentRecord[] ─────────────────────────

export type SessionWithMetrics = {
  id: string
  audioMetrics: AudioMetrics | null
  duration: number
  date: string
}

export function deriveAudioEnvironmentBatch(
  sessions: SessionWithMetrics[],
): AudioEnvironmentRecord[] {
  return sessions
    .filter((s): s is SessionWithMetrics & { audioMetrics: AudioMetrics } =>
      s.audioMetrics !== null,
    )
    .map((s) => deriveAudioEnvironment(s.id, s.audioMetrics, s.duration, s.date))
}

// ── localStorage 저장/로드 ──────────────────────────────────────────────────

const AUDIO_ENV_KEY = 'uncounted_audio_env_records'

export function saveAudioEnvironmentRecords(records: AudioEnvironmentRecord[]): void {
  localStorage.setItem(AUDIO_ENV_KEY, JSON.stringify(records))
}

export function loadAudioEnvironmentRecords(): AudioEnvironmentRecord[] {
  try {
    const raw = localStorage.getItem(AUDIO_ENV_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function appendAudioEnvironmentRecords(newRecords: AudioEnvironmentRecord[]): void {
  const existing = loadAudioEnvironmentRecords()
  const existingIds = new Set(existing.map((r) => r.sessionId))
  const merged = [
    ...existing,
    ...newRecords.filter((r) => !existingIds.has(r.sessionId)),
  ]
  saveAudioEnvironmentRecords(merged)
}
