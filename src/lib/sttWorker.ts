/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Moonshine STT Web Worker ──────────────────────────────────────────
// moonshine-tiny-ko: 27M 파라미터, 한국어 CER 8.9% (whisper-tiny 15.8% 대비 대폭 개선)
// 한국어 ONNX 모델의 preprocessor_config가 Wav2Vec2로 잘못 설정되어 있어
// pipeline() 대신 수동으로 모델/토크나이저/feature extractor 로드

import {
  AutoModelForSpeechSeq2Seq,
  AutoTokenizer,
  AutoFeatureExtractor,
  env,
} from '@huggingface/transformers'

// Worker 내부 — 중첩 proxy 불필요 (이미 Worker 안에서 실행)
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false
}

const KO_MODEL = 'onnx-community/moonshine-tiny-ko-ONNX'
// 영어 모델 — MoonshineFeatureExtractor 설정이 정상
const EN_MODEL = 'onnx-community/moonshine-tiny-ONNX'

let model: any = null
let tokenizer: any = null
let featureExtractor: any = null
let loading = false

const SAMPLE_RATE = 16000
// Moonshine max_position_embeddings=194, 6 tokens/sec → ~32s 제한
// 안전 마진 두고 28s 청크 + 4s 스트라이드 (중복 구간)
const CHUNK_SEC = 28
const STRIDE_SEC = 4

function post(data: Record<string, unknown>) {
  ;(self as any).postMessage(data)
}

/**
 * 인접 청크 텍스트 병합: stride 중복 구간의 반복 텍스트 제거.
 * suffix(이전 텍스트)와 prefix(다음 텍스트)의 가장 긴 공통 부분을 찾아 병합.
 */
function mergeChunkTexts(texts: string[]): string {
  if (texts.length === 0) return ''
  if (texts.length === 1) return texts[0]

  let merged = texts[0]
  for (let i = 1; i < texts.length; i++) {
    const next = texts[i]
    if (!next) continue

    // 이전 텍스트의 끝부분과 다음 텍스트의 시작부분에서 가장 긴 공통 부분 찾기
    // 비교 범위: stride 4초 * 약 4 한국어 음절/초 = 최대 ~16 글자
    const maxOverlap = Math.min(merged.length, next.length, 40)
    let bestOverlap = 0

    for (let len = 3; len <= maxOverlap; len++) {
      const suffix = merged.slice(-len)
      if (next.startsWith(suffix)) {
        bestOverlap = len
      }
    }

    if (bestOverlap > 0) {
      merged += next.slice(bestOverlap)
    } else {
      merged += ' ' + next
    }
  }
  return merged
}

/** Moonshine은 built-in chunking 미지원 → 수동 청킹 */
function chunkAudio(audio: Float32Array): Float32Array[] {
  const chunkLen = CHUNK_SEC * SAMPLE_RATE
  const strideLen = STRIDE_SEC * SAMPLE_RATE
  const step = chunkLen - strideLen
  if (audio.length <= chunkLen) return [audio]
  const chunks: Float32Array[] = []
  for (let offset = 0; offset < audio.length; offset += step) {
    const end = Math.min(offset + chunkLen, audio.length)
    chunks.push(audio.slice(offset, end))
    if (end >= audio.length) break
  }
  return chunks
}

;(self as any).addEventListener('message', async (e: MessageEvent) => {
  const { type, audio, sessionId } = e.data
  if (type !== 'transcribe') return

  try {
    // 컴포넌트 로드 (첫 요청 시 — 이후 브라우저 캐시)
    if (!model) {
      if (loading) {
        post({ type: 'error', sessionId, message: '모델 로딩 중' })
        return
      }
      loading = true
      post({ type: 'progress', sessionId, status: 'download', progress: 0, message: '모델 다운로드 중...' })

      const progressCb = (p: any) => {
        if (p.progress !== undefined) {
          post({
            type: 'progress', sessionId,
            status: 'download',
            progress: p.progress / 100,
            message: `모델 다운로드 ${Math.round(p.progress)}%`,
          })
        }
      }

      // 1) 한국어 모델 + 토크나이저 로드
      // 2) Feature extractor는 영어 모델에서 (한국어 모델의 config가 잘못됨)
      const [m, t, fe] = await Promise.all([
        AutoModelForSpeechSeq2Seq.from_pretrained(KO_MODEL, {
          dtype: 'fp32',
          device: 'wasm',
          progress_callback: progressCb,
        }),
        AutoTokenizer.from_pretrained(KO_MODEL),
        AutoFeatureExtractor.from_pretrained(EN_MODEL),
      ])

      model = m
      tokenizer = t
      featureExtractor = fe
      loading = false
    }

    // Moonshine 추론 — language/task/timestamps 파라미터 미지원 (한국어 전용 모델)
    post({ type: 'progress', sessionId, status: 'transcribing', message: '텍스트 추출 중...' })

    const chunks = chunkAudio(audio)
    const texts: string[] = []

    for (const chunk of chunks) {
      // Feature extraction
      const inputs = await featureExtractor(chunk)

      // Generate — 6 tokens/sec 제한 (hallucination 방지)
      const maxNewTokens = Math.floor(chunk.length / SAMPLE_RATE) * 6
      const outputs = await model.generate({ max_new_tokens: maxNewTokens, ...inputs })

      // Decode
      const decoded = tokenizer.batch_decode(outputs, { skip_special_tokens: true })
      const t = (decoded[0] ?? '').trim()
      if (t) texts.push(t)
    }

    const text = mergeChunkTexts(texts)
    post({ type: 'result', sessionId, text: text.trim() })
  } catch (err: any) {
    loading = false
    model = null
    tokenizer = null
    featureExtractor = null
    post({ type: 'error', sessionId, message: err?.message ?? String(err) })
  }
})
