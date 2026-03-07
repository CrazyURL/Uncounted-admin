// ── 오디오 정제 파이프라인 ─────────────────────────────────────────────────
// 소스: 로컬 파일(callRecordId) 또는 Supabase Storage(audioUrl)
// 파이프라인: 원본 → 16kHz 모노 리샘플링 → 무음 제거 → PII 비프 마스킹 → WAV 인코딩

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { resampleTo16kMono, removeSilence, applyBeepMask, pcmToWav } from './wavEncoder'
import { getAudioSignedUrl, uploadSanitizedAudio } from './storageUpload'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type SanitizeAudioResult = {
  wav: ArrayBuffer
  originalDurationSec: number
  sanitizedDurationSec: number
  silenceRemovedSec: number
}

export type AudioSource = {
  callRecordId?: string   // 로컬 파일 경로 (Capacitor Filesystem)
  audioUrl?: string       // Supabase Storage 경로 (userId/sessionId.wav)
  sessionId: string
}

// ── 로컬 파일 로드 (base64 → ArrayBuffer) ───────────────────────────────────

async function loadLocalAudio(callRecordId: string): Promise<ArrayBuffer> {
  const { data } = await Filesystem.readFile({
    path: callRecordId,
    directory: Directory.ExternalStorage,
  })
  const binary = atob(data as string)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── Supabase Storage에서 다운로드 ───────────────────────────────────────────

async function loadFromStorage(storagePath: string): Promise<ArrayBuffer> {
  const signedUrl = await getAudioSignedUrl(storagePath)
  if (!signedUrl) throw new Error('Storage signed URL 생성 실패')

  const res = await fetch(signedUrl)
  if (!res.ok) throw new Error(`Storage 다운로드 실패 (${res.status})`)
  return res.arrayBuffer()
}

// ── 오디오 로드 (로컬 우선 → Storage 폴백) ──────────────────────────────────

async function loadAudio(source: AudioSource): Promise<{ buffer: ArrayBuffer; fromStorage: boolean }> {
  // 1) 로컬 파일 시도 (네이티브 플랫폼 + callRecordId 있을 때)
  if (source.callRecordId && Capacitor.isNativePlatform()) {
    try {
      const buffer = await loadLocalAudio(source.callRecordId)
      return { buffer, fromStorage: false }
    } catch {
      // 로컬 실패 → Storage 폴백
    }
  }

  // 2) Supabase Storage 시도 (audioUrl 있을 때)
  if (source.audioUrl) {
    const buffer = await loadFromStorage(source.audioUrl)
    return { buffer, fromStorage: true }
  }

  throw new Error('로컬 파일 없음 + Storage URL 없음')
}

// ── 메인 정제 함수 ─────────────────────────────────────────────────────────

export async function sanitizeAudio(
  source: AudioSource,
  piiIntervals?: [number, number][],
  onProgress?: (phase: string) => void,
): Promise<SanitizeAudioResult & { fromStorage: boolean }> {
  const RATE = 16000

  // 1) 오디오 로드
  onProgress?.('loading')
  const { buffer: raw, fromStorage } = await loadAudio(source)

  // Storage에서 받은 WAV가 이미 정제된 경우 → 리샘플링만 수행
  if (fromStorage) {
    onProgress?.('encoding')
    // 이미 정제된 WAV일 수 있지만, 포맷 통일을 위해 리샘플링
    const resampled = await resampleTo16kMono(raw)
    const wav = pcmToWav(resampled, RATE)
    return {
      wav,
      originalDurationSec: resampled.length / RATE,
      sanitizedDurationSec: resampled.length / RATE,
      silenceRemovedSec: 0,
      fromStorage: true,
    }
  }

  // 2) 리샘플링
  onProgress?.('resampling')
  const resampled = await resampleTo16kMono(raw)
  const originalDurationSec = resampled.length / RATE

  // 3) 무음 제거
  onProgress?.('silence_removal')
  const trimmed = removeSilence(resampled, RATE)
  const sanitizedDurationSec = trimmed.length / RATE
  const silenceRemovedSec = originalDurationSec - sanitizedDurationSec

  // 4) PII 비프 마스킹
  const masked = piiIntervals && piiIntervals.length > 0
    ? applyBeepMask(trimmed, RATE, piiIntervals)
    : trimmed

  // 5) WAV 인코딩
  onProgress?.('encoding')
  const wav = pcmToWav(masked, RATE)

  return { wav, originalDurationSec, sanitizedDurationSec, silenceRemovedSec, fromStorage: false }
}

// ── Storage 업로드 (정제 후 업로드 + audioUrl 반환) ─────────────────────────

export async function sanitizeAndUpload(
  source: AudioSource,
  piiIntervals?: [number, number][],
  onProgress?: (phase: string) => void,
): Promise<{ result: SanitizeAudioResult; storagePath: string | null }> {
  const result = await sanitizeAudio(source, piiIntervals, onProgress)

  // 이미 Storage에서 가져온 경우 재업로드 불필요
  if (result.fromStorage) {
    return { result, storagePath: source.audioUrl ?? null }
  }

  // 로컬에서 정제한 경우 → Storage 업로드
  onProgress?.('uploading')
  const blob = new Blob([result.wav], { type: 'audio/wav' })
  const { path, error } = await uploadSanitizedAudio(source.sessionId, blob)

  if (error) {
    // 업로드 실패해도 WAV 자체는 반환 (로컬 저장은 가능)
    console.warn('Storage 업로드 실패:', error)
    return { result, storagePath: null }
  }

  return { result, storagePath: path }
}

// ── 하위 호환 (기존 호출부용) ────────────────────────────────────────────────

export async function sanitizeAudioFromPath(
  callRecordId: string,
  piiIntervals?: [number, number][],
  onProgress?: (phase: string) => void,
): Promise<SanitizeAudioResult> {
  return sanitizeAudio(
    { callRecordId, sessionId: '' },
    piiIntervals,
    onProgress,
  )
}
