/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Speaker Diarization Web Worker ────────────────────────────────────────
// PyAnnote segmentation ONNX 모델 기반 화자 분리
// @huggingface/transformers WASM 백엔드 사용
// 입력: Float32Array (16kHz mono) → 출력: SpeakerSegment[]

import {
  AutoModel,
  AutoFeatureExtractor,
  env,
} from '@huggingface/transformers'

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false
}

// PyAnnote segmentation 3.0 (ONNX 변환)
const MODEL_ID = 'onnx-community/pyannote-segmentation-3.0'

let model: any = null
let featureExtractor: any = null
let loading = false

const SAMPLE_RATE = 16000
// PyAnnote 윈도우: 10초 (모델 기본값)
const WINDOW_SEC = 10
const STEP_SEC = 5  // 5초 스텝 (50% 오버랩)

function post(data: Record<string, unknown>) {
  ;(self as any).postMessage(data)
}

/** 프레임별 화자 확률 → 세그먼트 변환 */
function framesToSegments(
  speakerProbs: number[][],  // [frames][speakers]
  totalDurationSec: number,
  frameDurationSec: number,
): { speakerId: string; startSec: number; endSec: number; durationSec: number }[] {
  if (speakerProbs.length === 0) return []

  const numSpeakers = speakerProbs[0].length
  const segments: { speakerId: string; startSec: number; endSec: number; durationSec: number }[] = []

  // 각 프레임에서 가장 높은 확률의 화자 결정
  const assignments: number[] = speakerProbs.map((probs) => {
    let maxIdx = 0
    let maxVal = probs[0]
    for (let i = 1; i < numSpeakers; i++) {
      if (probs[i] > maxVal) {
        maxVal = probs[i]
        maxIdx = i
      }
    }
    // 임계값 미만이면 silence (-1)
    return maxVal > 0.5 ? maxIdx : -1
  })

  // 연속 같은 화자 → 세그먼트 병합
  let currentSpeaker = assignments[0]
  let startFrame = 0

  for (let i = 1; i <= assignments.length; i++) {
    const speaker = i < assignments.length ? assignments[i] : -2  // 종료 트리거

    if (speaker !== currentSpeaker) {
      if (currentSpeaker >= 0) {
        const startSec = Math.round(startFrame * frameDurationSec * 100) / 100
        const endSec = Math.min(
          Math.round(i * frameDurationSec * 100) / 100,
          totalDurationSec,
        )
        segments.push({
          speakerId: `SPEAKER_${String(currentSpeaker).padStart(2, '0')}`,
          startSec,
          endSec,
          durationSec: Math.round((endSec - startSec) * 100) / 100,
        })
      }
      currentSpeaker = speaker
      startFrame = i
    }
  }

  return segments
}

/** 세그먼트 → 화자 요약 */
function summarizeSpeakers(segments: { speakerId: string; durationSec: number }[]) {
  const map = new Map<string, { total: number; count: number }>()
  let totalDur = 0

  for (const s of segments) {
    const existing = map.get(s.speakerId)
    if (existing) {
      existing.total += s.durationSec
      existing.count++
    } else {
      map.set(s.speakerId, { total: s.durationSec, count: 1 })
    }
    totalDur += s.durationSec
  }

  return Array.from(map.entries()).map(([id, data]) => ({
    speakerId: id,
    totalDurationSec: Math.round(data.total * 10) / 10,
    segmentCount: data.count,
    speakingRatio: totalDur > 0 ? Math.round((data.total / totalDur) * 100) / 100 : 0,
    isUser: false,  // 엔진에서 후처리로 매핑
  }))
}

;(self as any).addEventListener('message', async (e: MessageEvent) => {
  const { type, audio, sessionId } = e.data
  if (type !== 'diarize') return

  try {
    // 모델 로드
    if (!model) {
      if (loading) {
        post({ type: 'error', sessionId, message: '모델 로딩 중' })
        return
      }
      loading = true
      post({ type: 'progress', sessionId, stage: 'download', progress: 0 })

      const progressCb = (p: any) => {
        if (p.progress !== undefined) {
          post({ type: 'progress', sessionId, stage: 'download', progress: p.progress / 100 })
        }
      }

      try {
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
      } catch (loadErr: any) {
        loading = false
        post({ type: 'error', sessionId, message: `모델 로드 실패: ${loadErr?.message ?? String(loadErr)}` })
        return
      }
      loading = false
    }

    post({ type: 'progress', sessionId, stage: 'processing', progress: 0 })

    const totalDuration = audio.length / SAMPLE_RATE
    const windowLen = WINDOW_SEC * SAMPLE_RATE
    const stepLen = STEP_SEC * SAMPLE_RATE

    // 윈도우별 처리
    const allProbs: number[][] = []
    const windowCount = Math.max(1, Math.ceil((audio.length - windowLen) / stepLen) + 1)

    for (let w = 0; w < windowCount; w++) {
      const start = w * stepLen
      const end = Math.min(start + windowLen, audio.length)
      const chunk = audio.slice(start, end)

      // Feature extraction + 모델 추론
      const inputs = await featureExtractor(chunk, { sampling_rate: SAMPLE_RATE })
      const output = await model(inputs)

      // PyAnnote segmentation 출력: [batch, frames, speakers]
      // frames 수는 윈도우 길이에 비례 (약 1 frame/10ms)
      let probs: number[][]
      if (output.logits) {
        const data = output.logits.data as Float32Array
        const dims = output.logits.dims
        const numFrames = dims[1]
        const numSpeakers = dims[2]
        probs = []
        for (let f = 0; f < numFrames; f++) {
          const frameProbs: number[] = []
          for (let s = 0; s < numSpeakers; s++) {
            // sigmoid
            const logit = data[f * numSpeakers + s]
            frameProbs.push(1 / (1 + Math.exp(-logit)))
          }
          probs.push(frameProbs)
        }
      } else {
        probs = []
      }

      // 오버랩 구간 처리 (첫 윈도우 제외)
      if (w === 0) {
        allProbs.push(...probs)
      } else {
        // 스텝 이후의 프레임만 추가 (오버랩 구간 건너뜀)
        const skipFrames = Math.floor(probs.length * (STEP_SEC / WINDOW_SEC))
        allProbs.push(...probs.slice(skipFrames))
      }

      post({
        type: 'progress',
        sessionId,
        stage: 'processing',
        progress: (w + 1) / windowCount,
      })
    }

    // 프레임 → 세그먼트 변환
    const frameDuration = totalDuration / allProbs.length
    const segments = framesToSegments(allProbs, totalDuration, frameDuration)
    const speakers = summarizeSpeakers(segments)

    post({ type: 'result', sessionId, segments, speakers })
  } catch (err: any) {
    loading = false
    model = null
    featureExtractor = null
    post({ type: 'error', sessionId, message: err?.message ?? String(err) })
  }
})
