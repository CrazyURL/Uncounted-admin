// ── Speaker Muter — 상대방 음성 무음 처리 + 트랜스크립트 마스킹 ──────────
// consentStatus === 'user_only' 세션에서:
// 1) 오디오: 상대방 발화 구간을 무음(silence) 처리
// 2) 트랜스크립트: 상대방 발화 단어를 [...] 로 교체

import { type DiarizationResult } from '../types/diarization'
import { type TranscriptWord } from './transcriptStore'
import { idbGet, idbSet, idbDelete } from './idb'
import { resampleTo16kMono, applySilenceMask, pcmToWav } from './wavEncoder'

// ── IDB 캐시 키 ──────────────────────────────────────────────────────────

const MUTED_AUDIO_PREFIX = 'muted_audio:'

// ── 1. 피어 세그먼트 추출 ────────────────────────────────────────────────

/**
 * DiarizationResult에서 상대방(non-user) 발화 구간을 추출.
 * @returns [[startSec, endSec], ...] 배열
 */
export function extractPeerIntervals(
  diarization: DiarizationResult,
): [number, number][] {
  if (!diarization.userSpeakerId) return []
  return diarization.segments
    .filter((seg) => seg.speakerId !== diarization.userSpeakerId)
    .map((seg) => [seg.startSec, seg.endSec] as [number, number])
}

// ── 2. 오디오 무음 처리 ──────────────────────────────────────────────────

export type MuteAudioResult = {
  dataUrl: string
  mutedSegmentCount: number
  processingMs: number
  fromCache: boolean
}

/**
 * 세션 오디오를 상대방 무음 처리하여 재생 가능한 data URL 반환.
 * IDB 캐시 우선 사용.
 */
export async function muteCounterpartyAudio(
  sessionId: string,
  audioBuffer: ArrayBuffer,
  diarization: DiarizationResult,
): Promise<MuteAudioResult> {
  // 캐시 확인
  const cached = await getCachedMutedAudio(sessionId)
  if (cached) {
    const intervals = extractPeerIntervals(diarization)
    return { dataUrl: cached, mutedSegmentCount: intervals.length, processingMs: 0, fromCache: true }
  }

  const t0 = performance.now()
  const intervals = extractPeerIntervals(diarization)

  // 피어 구간 없으면 원본 그대로
  if (intervals.length === 0) {
    return { dataUrl: '', mutedSegmentCount: 0, processingMs: 0, fromCache: false }
  }

  // 리샘플링 → 무음 처리 → WAV 인코딩
  const samples = await resampleTo16kMono(audioBuffer)
  const muted = applySilenceMask(samples, 16000, intervals)
  const wav = pcmToWav(muted, 16000)

  // ArrayBuffer → base64 data URL
  const bytes = new Uint8Array(wav)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`

  // IDB 캐시 저장
  await idbSet(MUTED_AUDIO_PREFIX + sessionId, dataUrl).catch(() => {})

  return {
    dataUrl,
    mutedSegmentCount: intervals.length,
    processingMs: Math.round(performance.now() - t0),
    fromCache: false,
  }
}

// ── 3. IDB 캐시 관리 ─────────────────────────────────────────────────────

export async function getCachedMutedAudio(sessionId: string): Promise<string | null> {
  return idbGet<string>(MUTED_AUDIO_PREFIX + sessionId)
}

export async function invalidateMutedAudioCache(sessionId: string): Promise<void> {
  await idbDelete(MUTED_AUDIO_PREFIX + sessionId).catch(() => {})
}

// ── 4. 트랜스크립트 마스킹 ────────────────────────────────────────────────

export type MaskedTranscriptResult = {
  maskedText: string
  maskedWordCount: number
  totalWordCount: number
}

/**
 * 트랜스크립트에서 상대방 발화 단어를 [...] 로 교체.
 * words 타임스탬프가 없으면 원본 텍스트 그대로 반환.
 */
export function maskPeerTranscript(
  text: string,
  words: TranscriptWord[] | undefined,
  peerIntervals: [number, number][],
): MaskedTranscriptResult {
  if (!words || words.length === 0 || peerIntervals.length === 0) {
    return { maskedText: text, maskedWordCount: 0, totalWordCount: words?.length ?? 0 }
  }

  let maskedCount = 0
  let prevWasMasked = false
  const parts: string[] = []

  for (const w of words) {
    const isPeer = peerIntervals.some(
      ([s, e]) => w.start < e && w.end > s,
    )

    if (isPeer) {
      maskedCount++
      if (!prevWasMasked) {
        parts.push('[...]')
        prevWasMasked = true
      }
    } else {
      parts.push(w.word)
      prevWasMasked = false
    }
  }

  return {
    maskedText: parts.join(' '),
    maskedWordCount: maskedCount,
    totalWordCount: words.length,
  }
}
