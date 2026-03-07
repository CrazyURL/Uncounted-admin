/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Speaker Embedding Web Worker ──────────────────────────────────────────
// WeSpeaker ResNet34-LM (ONNX): 256-dim 화자 임베딩 추출
// @huggingface/transformers WASM 백엔드 사용
// 메인 스레드에서 리샘플링 완료 후 Float32Array(16kHz mono)를 받아 처리

import {
  AutoFeatureExtractor,
  AutoModel,
  env,
} from '@huggingface/transformers'

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false
}

// WeSpeaker ResNet34-LM: 화자 검증용 임베딩 모델 (ONNX 변환)
const MODEL_ID = 'onnx-community/wespeaker-voxceleb-resnet34-LM'

let model: any = null
let featureExtractor: any = null
let loading = false

const SAMPLE_RATE = 16000
// 최대 10초 세그먼트 사용 (WeSpeaker는 3~10초 발화에 최적화,
// 짧을수록 단일 화자 구간을 캡처할 확률 높음)
const MAX_SEGMENT_SEC = 10

function post(data: Record<string, unknown>) {
  ;(self as any).postMessage(data)
}

/** 코사인 유사도 계산 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

/** 오디오에서 가장 음성이 많은 구간 추출 (간단한 에너지 기반) */
function selectBestSegment(audio: Float32Array): Float32Array {
  const maxLen = MAX_SEGMENT_SEC * SAMPLE_RATE
  if (audio.length <= maxLen) return audio

  const frameLen = SAMPLE_RATE
  const frameCount = Math.floor(audio.length / frameLen)
  const energies: number[] = []

  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    const start = i * frameLen
    for (let j = start; j < start + frameLen; j++) {
      sum += audio[j] * audio[j]
    }
    energies.push(sum / frameLen)
  }

  const windowFrames = Math.min(MAX_SEGMENT_SEC, frameCount)
  let bestStart = 0
  let bestEnergy = 0

  let windowEnergy = 0
  for (let i = 0; i < windowFrames; i++) windowEnergy += energies[i]
  bestEnergy = windowEnergy

  for (let i = 1; i <= frameCount - windowFrames; i++) {
    windowEnergy -= energies[i - 1]
    windowEnergy += energies[i + windowFrames - 1]
    if (windowEnergy > bestEnergy) {
      bestEnergy = windowEnergy
      bestStart = i
    }
  }

  const sampleStart = bestStart * frameLen
  return audio.slice(sampleStart, sampleStart + maxLen)
}

type SegmentInfo = { startSample: number; energy: number }

/** 오디오에서 상위 K개 에너지 세그먼트 선택 (슬라이딩 윈도우, 비겹침)
 *  이전 방식(고정 블록)의 문제: 세그먼트 경계가 발화 중간을 자름 → 임베딩 품질 저하
 *  개선: 1초 스텝 슬라이딩 윈도우로 최적 위치 탐색 → 비겹침 상위 K개 선택 */
function selectTopKSegments(
  audio: Float32Array,
  numSegments: number,
  segmentSec: number,
  minEnergy: number,
): SegmentInfo[] {
  const segLen = segmentSec * SAMPLE_RATE
  if (audio.length <= segLen) return [{ startSample: 0, energy: 1 }]

  // 1초 스텝 슬라이딩 윈도우로 모든 후보 에너지 계산
  const step = SAMPLE_RATE  // 1초 스텝
  const windows: SegmentInfo[] = []

  for (let start = 0; start + segLen <= audio.length; start += step) {
    let sum = 0
    for (let j = start; j < start + segLen; j++) {
      sum += audio[j] * audio[j]
    }
    const rms = Math.sqrt(sum / segLen)
    windows.push({ startSample: start, energy: rms })
  }

  if (windows.length === 0) return [{ startSample: 0, energy: 0 }]

  // 에너지 내림차순 정렬
  windows.sort((a, b) => b.energy - a.energy)

  // 비겹침 상위 K개 선택 (최소 거리 = 세그먼트 길이)
  const selected: SegmentInfo[] = []
  for (const w of windows) {
    if (selected.length >= numSegments) break
    // 에너지 임계값 미달이고 이미 1개 이상 선택되었으면 스킵
    if (w.energy < minEnergy && selected.length > 0) continue
    const tooClose = selected.some(
      (s) => Math.abs(s.startSample - w.startSample) < segLen,
    )
    if (!tooClose) {
      selected.push(w)
    }
  }

  // 아무것도 선택 못했으면 (전부 임계값 미달) 가장 높은 1개라도 반환
  if (selected.length === 0) {
    selected.push(windows[0])
  }

  return selected
}

/** 단일 세그먼트에서 임베딩 추출 (모델 로드 완료 전제) */
async function extractSingleEmbedding(segment: Float32Array): Promise<number[]> {
  const inputs = await featureExtractor(segment, { sampling_rate: SAMPLE_RATE })
  const output = await model(inputs)

  let embedding: number[]
  if (output.embeddings) {
    embedding = Array.from(output.embeddings.data as Float32Array)
  } else if (output.last_hidden_state) {
    const data = output.last_hidden_state.data as Float32Array
    const dim = output.last_hidden_state.dims[output.last_hidden_state.dims.length - 1]
    const frames = data.length / dim
    embedding = new Array(dim).fill(0)
    for (let i = 0; i < frames; i++) {
      for (let d = 0; d < dim; d++) embedding[d] += data[i * dim + d]
    }
    for (let d = 0; d < dim; d++) embedding[d] /= frames
  } else {
    throw new Error('Unexpected model output format')
  }

  // L2 정규화
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0))
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) embedding[i] /= norm
  }
  return embedding
}

;(self as any).addEventListener('message', async (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'extract') {
    const { audio, sampleRate } = e.data as { audio: Float32Array; sampleRate: number }

    try {
      // 모델 로드 (첫 요청 시)
      if (!model) {
        if (loading) {
          post({ type: 'error', message: '모델 로딩 중' })
          return
        }
        loading = true
        post({ type: 'progress', stage: 'download', progress: 0 })

        const progressCb = (p: any) => {
          if (p.progress !== undefined) {
            post({ type: 'progress', stage: 'download', progress: p.progress / 100 })
          }
        }

        const [m, fe] = await Promise.all([
          AutoModel.from_pretrained(MODEL_ID, {
            dtype: 'fp32',
            device: 'wasm',
            progress_callback: progressCb,
          }),
          AutoFeatureExtractor.from_pretrained(MODEL_ID),
        ])

        model = m
        featureExtractor = fe
        loading = false
      }

      post({ type: 'progress', stage: 'extracting', progress: 0 })

      // 최적 세그먼트 선택
      const segment = selectBestSegment(audio)
      const durationUsedSec = segment.length / sampleRate

      // Feature extraction + 임베딩 추출
      post({ type: 'progress', stage: 'extracting', progress: 0.3 })
      const inputs = await featureExtractor(segment, {
        sampling_rate: sampleRate,
      })

      post({ type: 'progress', stage: 'extracting', progress: 0.6 })
      const output = await model(inputs)

      // WeSpeaker 출력: { embeddings: Tensor } — 256-dim 벡터
      let embedding: number[]
      if (output.embeddings) {
        embedding = Array.from(output.embeddings.data as Float32Array)
      } else if (output.last_hidden_state) {
        // Fallback: mean pooling over last hidden state
        const data = output.last_hidden_state.data as Float32Array
        const dim = output.last_hidden_state.dims[output.last_hidden_state.dims.length - 1]
        const frames = data.length / dim
        embedding = new Array(dim).fill(0)
        for (let i = 0; i < frames; i++) {
          for (let d = 0; d < dim; d++) {
            embedding[d] += data[i * dim + d]
          }
        }
        for (let d = 0; d < dim; d++) {
          embedding[d] /= frames
        }
      } else {
        throw new Error('Unexpected model output format')
      }

      // L2 정규화
      const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0))
      if (norm > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= norm
        }
      }

      post({ type: 'progress', stage: 'extracting', progress: 1 })
      post({ type: 'embedding', vector: embedding, durationUsedSec })
    } catch (err: any) {
      loading = false
      model = null
      featureExtractor = null
      post({ type: 'error', message: err?.message ?? String(err) })
    }
  }

  if (type === 'extract_multi') {
    const { audio, numSegments, segmentSec, minEnergy } = e.data as {
      audio: Float32Array; sampleRate: number
      numSegments: number; segmentSec: number; minEnergy: number
    }

    try {
      // 모델 로드 (첫 요청 시)
      if (!model) {
        if (loading) {
          post({ type: 'error', message: '모델 로딩 중' })
          return
        }
        loading = true
        post({ type: 'progress', stage: 'download', progress: 0 })

        const progressCb = (p: any) => {
          if (p.progress !== undefined) {
            post({ type: 'progress', stage: 'download', progress: p.progress / 100 })
          }
        }

        const [m, fe] = await Promise.all([
          AutoModel.from_pretrained(MODEL_ID, {
            dtype: 'fp32',
            device: 'wasm',
            progress_callback: progressCb,
          }),
          AutoFeatureExtractor.from_pretrained(MODEL_ID),
        ])

        model = m
        featureExtractor = fe
        loading = false
      }

      post({ type: 'progress', stage: 'extracting', progress: 0 })

      // 상위 에너지 세그먼트 선택
      const segLen = segmentSec * SAMPLE_RATE
      const topSegments = selectTopKSegments(audio, numSegments, segmentSec, minEnergy)

      const results: { vector: number[]; startSec: number; durationSec: number; energy: number }[] = []

      for (let i = 0; i < topSegments.length; i++) {
        const seg = topSegments[i]
        const endSample = Math.min(seg.startSample + segLen, audio.length)
        const chunk = audio.slice(seg.startSample, endSample)

        const vector = await extractSingleEmbedding(chunk)
        results.push({
          vector,
          startSec: Math.round((seg.startSample / SAMPLE_RATE) * 100) / 100,
          durationSec: Math.round(((endSample - seg.startSample) / SAMPLE_RATE) * 100) / 100,
          energy: Math.round(seg.energy * 10000) / 10000,
        })

        post({ type: 'progress', stage: 'extracting', progress: (i + 1) / topSegments.length })
      }

      post({ type: 'multi_embedding', segments: results })
    } catch (err: any) {
      loading = false
      model = null
      featureExtractor = null
      post({ type: 'error', message: err?.message ?? String(err) })
    }
  }

  if (type === 'compare') {
    const { embedding1, embedding2 } = e.data as { embedding1: number[]; embedding2: number[] }
    const score = cosineSimilarity(embedding1, embedding2)
    post({ type: 'similarity', score })
  }
})
