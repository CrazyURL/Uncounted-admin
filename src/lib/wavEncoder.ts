/**
 * wavEncoder.ts — On-device audio processing pipeline utilities
 *
 * Pipeline:
 *   ArrayBuffer (원본 오디오)
 *     → resampleTo16kMono()   : Web Audio API로 16kHz 모노 리샘플링
 *     → applyBeepMask()       : PII 구간을 1kHz 비프음으로 마스킹
 *     → chunkSamples()        : 60초 단위 청크 분할
 *     → pcmToWav()            : Float32 PCM → RIFF WAV ArrayBuffer
 */

// ─── WAV 헤더 작성 헬퍼 ────────────────────────────────────────────────────

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// ─── 1. PCM → WAV ──────────────────────────────────────────────────────────

/**
 * Float32 PCM 샘플을 16비트 RIFF WAV ArrayBuffer로 변환합니다.
 * @param samples  Float32Array (−1 ~ 1 범위)
 * @param sampleRate  출력 샘플레이트 (Hz), 기본 16000
 */
export function pcmToWav(samples: Float32Array, sampleRate: number = 16000): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = samples.length * (bitsPerSample / 8)

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF 청크
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt 서브청크
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)          // 서브청크 크기
  view.setUint16(20, 1, true)           // PCM 포맷
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data 서브청크
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Float32 → Int16 PCM 변환 (클램프)
  const pcm = new Int16Array(buffer, 44)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }

  return buffer
}

// ─── 2. 리샘플링 (16kHz 모노) ──────────────────────────────────────────────

/**
 * 임의 포맷의 ArrayBuffer를 16kHz 모노 Float32Array로 디코드·리샘플링합니다.
 * OfflineAudioContext를 이용해 브라우저 네이티브 디코딩 후 다운샘플링합니다.
 * @param arrayBuffer  원본 오디오 파일 바이트 (M4A, MP3, WAV 등)
 */
export async function resampleTo16kMono(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer)
    const targetRate = 16000
    const targetLength = Math.round(decoded.duration * targetRate)
    const offline = new OfflineAudioContext(1, targetLength, targetRate)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start(0)
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0).slice()
  } finally {
    await ctx.close()
  }
}

// ─── 3. PII 구간 비프음 마스킹 ────────────────────────────────────────────

/**
 * PII 시간 구간에 1kHz 비프음을 오버레이합니다.
 * 서버 PII 검출 API가 반환한 [start, end] 초 단위 구간 배열을 받습니다.
 * @param samples     Float32Array (16kHz 모노)
 * @param sampleRate  샘플레이트 (Hz)
 * @param intervals   PII 구간 배열 [[start, end], …] (초 단위)
 */
export function applyBeepMask(
  samples: Float32Array,
  sampleRate: number,
  intervals: [number, number][],
): Float32Array {
  const result = new Float32Array(samples)
  const beepFreq = 1000 // 1kHz

  for (const [start, end] of intervals) {
    const startSample = Math.floor(start * sampleRate)
    const endSample = Math.min(Math.ceil(end * sampleRate), result.length)
    for (let i = startSample; i < endSample; i++) {
      const t = i / sampleRate
      result[i] = 0.5 * Math.sin(2 * Math.PI * beepFreq * t)
    }
  }

  return result
}

// ─── 3a-2. 상대방 무음 처리 (크로스페이드 적용) ────────────────────────────

/**
 * 지정 구간의 샘플을 무음(0)으로 교체합니다.
 * 구간 경계에 짧은 크로스페이드를 적용하여 팝/클릭 노이즈를 방지합니다.
 * PII 비프 대신 상대방 화자 무음 처리에 사용합니다.
 *
 * @param samples     Float32Array (16kHz 모노)
 * @param sampleRate  샘플레이트 (Hz)
 * @param intervals   무음 처리할 구간 [[start, end], …] (초 단위)
 * @param fadeMs      경계 페이드 길이 (ms), 기본 10
 */
export function applySilenceMask(
  samples: Float32Array,
  sampleRate: number,
  intervals: [number, number][],
  fadeMs: number = 10,
): Float32Array {
  const result = new Float32Array(samples)
  const fadeSamples = Math.floor((fadeMs / 1000) * sampleRate)

  for (const [start, end] of intervals) {
    const s = Math.max(0, Math.floor(start * sampleRate))
    const e = Math.min(Math.ceil(end * sampleRate), result.length)
    if (s >= e) continue

    for (let i = s; i < e; i++) {
      const distFromStart = i - s
      const distFromEnd = e - 1 - i
      if (distFromStart < fadeSamples) {
        // fade-out: 원본 → 무음
        result[i] *= 1 - distFromStart / fadeSamples
      } else if (distFromEnd < fadeSamples) {
        // fade-in: 무음 → 원본
        result[i] *= 1 - distFromEnd / fadeSamples
      } else {
        result[i] = 0
      }
    }
  }

  return result
}

// ─── 3b. 무음 제거 ─────────────────────────────────────────────────────────

/**
 * RMS 기반 무음 구간을 탐지하고 제거합니다.
 * 유성음 구간만 남기되 구간 사이에 짧은 크로스페이드를 삽입하여 끊김을 방지합니다.
 *
 * @param samples       Float32Array (16kHz 모노)
 * @param sampleRate    샘플레이트 (Hz)
 * @param opts.windowMs       분석 윈도우 크기 (ms), 기본 30
 * @param opts.thresholdRms   무음 판정 RMS 기준, 기본 0.01
 * @param opts.minSilenceMs   최소 무음 길이 (ms) — 이보다 짧은 무음은 유지, 기본 500
 * @param opts.fadeMs         구간 사이 페이드 길이 (ms), 기본 50
 */
export function removeSilence(
  samples: Float32Array,
  sampleRate: number,
  opts?: {
    windowMs?: number
    thresholdRms?: number
    minSilenceMs?: number
    fadeMs?: number
  },
): Float32Array {
  const windowMs = opts?.windowMs ?? 30
  const threshold = opts?.thresholdRms ?? 0.01
  const minSilenceMs = opts?.minSilenceMs ?? 500
  const fadeMs = opts?.fadeMs ?? 50

  const windowSize = Math.floor((windowMs / 1000) * sampleRate)
  const minSilenceSamples = Math.floor((minSilenceMs / 1000) * sampleRate)
  const fadeSamples = Math.floor((fadeMs / 1000) * sampleRate)

  if (samples.length === 0) return samples

  // 1단계: 윈도우별 RMS 계산 → 유성음/무음 플래그
  const numWindows = Math.ceil(samples.length / windowSize)
  const isVoiced = new Uint8Array(numWindows)

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize
    const end = Math.min(start + windowSize, samples.length)
    let sumSq = 0
    for (let i = start; i < end; i++) {
      sumSq += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sumSq / (end - start))
    isVoiced[w] = rms >= threshold ? 1 : 0
  }

  // 2단계: 유성음 구간 추출 (샘플 단위)
  type Range = { start: number; end: number }
  const voicedRanges: Range[] = []
  let rangeStart = -1

  for (let w = 0; w < numWindows; w++) {
    if (isVoiced[w] && rangeStart < 0) {
      rangeStart = w * windowSize
    } else if (!isVoiced[w] && rangeStart >= 0) {
      voicedRanges.push({ start: rangeStart, end: w * windowSize })
      rangeStart = -1
    }
  }
  if (rangeStart >= 0) {
    voicedRanges.push({ start: rangeStart, end: samples.length })
  }

  // 유성음이 없으면 원본 반환
  if (voicedRanges.length === 0) return samples

  // 3단계: 짧은 무음 구간(< minSilenceSamples)은 병합
  const merged: Range[] = [voicedRanges[0]]
  for (let i = 1; i < voicedRanges.length; i++) {
    const prev = merged[merged.length - 1]
    const gap = voicedRanges[i].start - prev.end
    if (gap < minSilenceSamples) {
      prev.end = voicedRanges[i].end
    } else {
      merged.push(voicedRanges[i])
    }
  }

  // 4단계: 구간 결합 + 크로스페이드
  const totalLength = merged.reduce((sum, r) => sum + (r.end - r.start), 0)
  const result = new Float32Array(totalLength)
  let writePos = 0

  for (let ri = 0; ri < merged.length; ri++) {
    const r = merged[ri]
    const len = r.end - r.start

    for (let i = 0; i < len; i++) {
      let sample = samples[r.start + i]

      // 시작 페이드인 (첫 구간 제외)
      if (ri > 0 && i < fadeSamples) {
        sample *= i / fadeSamples
      }
      // 끝 페이드아웃 (마지막 구간 제외)
      if (ri < merged.length - 1 && i >= len - fadeSamples) {
        sample *= (len - i) / fadeSamples
      }

      result[writePos + i] = sample
    }
    writePos += len
  }

  return result
}

// ─── 4. 청크 분할 ─────────────────────────────────────────────────────────

/**
 * Float32Array를 고정 길이 청크로 분할합니다.
 * 마지막 청크는 chunkSeconds보다 짧을 수 있습니다.
 * @param samples       Float32Array (16kHz 모노)
 * @param sampleRate    샘플레이트 (Hz)
 * @param chunkSeconds  청크 길이 (초), 기본 60
 */
export function chunkSamples(
  samples: Float32Array,
  sampleRate: number,
  chunkSeconds: number = 60,
): Float32Array[] {
  const chunkSize = chunkSeconds * sampleRate
  const chunks: Float32Array[] = []
  for (let offset = 0; offset < samples.length; offset += chunkSize) {
    chunks.push(samples.slice(offset, offset + chunkSize))
  }
  return chunks
}

// ─── 5. 전체 파이프라인 헬퍼 ──────────────────────────────────────────────

export type EncodedChunk = {
  index: number         // 청크 순번 (0-based)
  startSec: number      // 원본 오디오 기준 시작 시간 (초)
  endSec: number        // 원본 오디오 기준 종료 시간 (초)
  wav: ArrayBuffer      // 16비트 PCM RIFF WAV
  durationSec: number   // 실제 청크 길이 (초)
}

/**
 * 원본 오디오를 리샘플링 → PII 마스킹 → 60초 청크 분할 → WAV 인코딩까지
 * 한 번에 처리합니다.
 *
 * @param arrayBuffer   원본 오디오 파일 바이트
 * @param piiIntervals  PII 서버가 반환한 마스킹 구간 (초 단위)
 * @param chunkSeconds  청크 길이 (기본 60초)
 */
export async function encodeSessionChunks(
  arrayBuffer: ArrayBuffer,
  piiIntervals: [number, number][] = [],
  chunkSeconds: number = 60,
): Promise<EncodedChunk[]> {
  const targetRate = 16000

  // 1) 리샘플링
  const resampled = await resampleTo16kMono(arrayBuffer)

  // 2) PII 마스킹
  const masked = piiIntervals.length > 0
    ? applyBeepMask(resampled, targetRate, piiIntervals)
    : resampled

  // 3) 청크 분할
  const chunks = chunkSamples(masked, targetRate, chunkSeconds)

  // 4) 각 청크 WAV 인코딩
  return chunks.map((chunk, i) => {
    const startSec = i * chunkSeconds
    const durationSec = chunk.length / targetRate
    return {
      index: i,
      startSec,
      endSec: startSec + durationSec,
      wav: pcmToWav(chunk, targetRate),
      durationSec,
    }
  })
}
