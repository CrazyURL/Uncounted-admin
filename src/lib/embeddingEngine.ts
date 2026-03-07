/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Voice Embedding Engine (화자 임베딩 관리) ──────────────────────────────
// sttEngine.ts 패턴 재사용: 글로벌 싱글턴 + pub/sub + React 훅
// 등록(enrollment) + 검증(verification) 흐름 관리
// 임베딩은 로컬에만 저장 (서버 전송 금지)

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { resampleTo16kMono } from './wavEncoder'
import { resetVerificationFields } from './sessionMapper'
import {
  type VoiceProfile,
  type VoiceEmbedding,
  type VerificationResult,
  type EmbeddingWorkerResponse,
  type EnrollmentQuality,
  type SegmentEmbedding,
  DEFAULT_VOICE_PROFILE,
  VOICE_PROFILE_KEY,
  VERIFICATION_CACHE_KEY,
  VERIFICATION_THRESHOLDS,
  VERIFICATION_CACHE_VERSION,
  ENROLLMENT_QUALITY_THRESHOLDS,
  MULTI_SEGMENT_CONFIG,
} from '../types/voiceBiometrics'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type EmbeddingJobStatus =
  | 'idle'
  | 'reading'
  | 'resampling'
  | 'download'
  | 'extracting'
  | 'done'
  | 'error'

export type EmbeddingJob = {
  sessionId: string
  status: EmbeddingJobStatus
  progress: number      // 0~1
  message: string
}

export type EmbeddingEngineState = {
  profile: VoiceProfile
  currentJob: EmbeddingJob | null
  isProcessing: boolean
}

// ── 글로벌 상태 ─────────────────────────────────────────────────────────────

let profile: VoiceProfile = loadProfile()
let currentJob: EmbeddingJob | null = null
let isProcessing = false
let worker: Worker | null = null

// ── pub/sub ─────────────────────────────────────────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const fn of listeners) fn()
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// ── 영속 저장 (3단계: localStorage → Preferences → Filesystem) ─────────────
// Android WebView의 localStorage는 앱 프로세스 종료 시 유실될 수 있음.
// Capacitor Preferences(SharedPreferences) + Filesystem(파일)을 백업으로 사용.
// 저장: 매번 3곳 모두 기록 / 로드: localStorage → Preferences → File 순서

const PROFILE_FILE = 'voice_profile.json'
const CACHE_FILE = 'verification_cache.json'

// ── 프로필 저장/로드 ────────────────────────────────────────────────────────

function loadProfile(): VoiceProfile {
  try {
    const raw = localStorage.getItem(VOICE_PROFILE_KEY)
    return raw ? { ...DEFAULT_VOICE_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_VOICE_PROFILE }
  } catch {
    return { ...DEFAULT_VOICE_PROFILE }
  }
}

function saveProfile(): void {
  const json = JSON.stringify(profile)
  try { localStorage.setItem(VOICE_PROFILE_KEY, json) } catch { /* ignore */ }
  if (Capacitor.isNativePlatform()) {
    Preferences.set({ key: VOICE_PROFILE_KEY, value: json }).catch(() => {})
    Filesystem.writeFile({
      path: PROFILE_FILE,
      data: json,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    }).catch(() => {})
  }
}

/**
 * 앱 시작 시 호출: localStorage가 유실된 경우 Preferences → File 순서로 복원.
 */
export async function ensureProfileLoaded(): Promise<void> {
  if (profile.enrollmentStatus !== 'not_enrolled') return
  if (!Capacitor.isNativePlatform()) return

  // 1차: Preferences (SharedPreferences)
  try {
    const { value } = await Preferences.get({ key: VOICE_PROFILE_KEY })
    if (value) {
      const restored: VoiceProfile = { ...DEFAULT_VOICE_PROFILE, ...JSON.parse(value) }
      if (restored.enrollmentStatus === 'enrolled' && restored.referenceEmbedding) {
        profile = restored
        try { localStorage.setItem(VOICE_PROFILE_KEY, value) } catch { /* ignore */ }
        notify()
        return
      }
    }
  } catch { /* ignore */ }

  // 2차: Filesystem (파일)
  try {
    const result = await Filesystem.readFile({
      path: PROFILE_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    if (typeof result.data === 'string' && result.data) {
      const restored: VoiceProfile = { ...DEFAULT_VOICE_PROFILE, ...JSON.parse(result.data) }
      if (restored.enrollmentStatus === 'enrolled' && restored.referenceEmbedding) {
        profile = restored
        try { localStorage.setItem(VOICE_PROFILE_KEY, result.data) } catch { /* ignore */ }
        Preferences.set({ key: VOICE_PROFILE_KEY, value: result.data }).catch(() => {})
        notify()
      }
    }
  } catch { /* ignore */ }
}

// ── 검증 캐시 (세션별 검증 결과) ────────────────────────────────────────────

// 메모리 캐시 — localStorage 읽기 횟수 최소화
let _memCache: Record<string, VerificationResult> | null = null

function loadVerificationCache(): Record<string, VerificationResult> {
  if (_memCache) return _memCache
  try {
    const raw = localStorage.getItem(VERIFICATION_CACHE_KEY)
    _memCache = raw ? JSON.parse(raw) : {}
    return _memCache!
  } catch {
    _memCache = {}
    return _memCache
  }
}

/** 검증 결과 1건 저장 (매 검증마다 호출) */
function saveVerificationResult(result: VerificationResult): void {
  const cache = loadVerificationCache()
  cache[result.sessionId] = result
  _memCache = cache
  const json = JSON.stringify(cache)
  try { localStorage.setItem(VERIFICATION_CACHE_KEY, json) } catch { /* ignore */ }
  if (Capacitor.isNativePlatform()) {
    Preferences.set({ key: VERIFICATION_CACHE_KEY, value: json }).catch(() => {})
    Filesystem.writeFile({
      path: CACHE_FILE,
      data: json,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    }).catch(() => {})
  }
}

export function getVerificationResult(sessionId: string): VerificationResult | null {
  return loadVerificationCache()[sessionId] ?? null
}

/** 캐시된 검증 결과를 현재 임계값으로 재평가 (임계값 변경 시 재처리 없이 즉시 반영)
 *  @returns 변경된 결과 수 */
export function reevaluateCachedResults(): number {
  const cache = loadVerificationCache()
  const threshold = VERIFICATION_THRESHOLDS.default
  let changed = 0

  for (const result of Object.values(cache)) {
    // 구버전 캐시는 재평가 대상에서 제외 (multi-segment 재처리 필요)
    if (result.cacheVersion !== VERIFICATION_CACHE_VERSION) continue

    const shouldBeVerified = result.similarity >= threshold
    if (result.isVerified !== shouldBeVerified) {
      result.isVerified = shouldBeVerified
      if (result.similarity >= VERIFICATION_THRESHOLDS.confidenceBands.high) {
        result.confidence = 'high'
      } else if (result.similarity >= VERIFICATION_THRESHOLDS.confidenceBands.medium) {
        result.confidence = 'medium'
      } else {
        result.confidence = 'low'
      }
      result.threshold = threshold
      changed++
    }
  }

  if (changed > 0) {
    _memCache = cache
    const json = JSON.stringify(cache)
    try { localStorage.setItem(VERIFICATION_CACHE_KEY, json) } catch { /* ignore */ }
    if (Capacitor.isNativePlatform()) {
      Preferences.set({ key: VERIFICATION_CACHE_KEY, value: json }).catch(() => {})
      Filesystem.writeFile({
        path: CACHE_FILE,
        data: json,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      }).catch(() => {})
    }
  }

  return changed
}

/** 구버전 캐시 엔트리의 callRecordId 목록 반환 (재처리 대상) */
export function getOutdatedCachePaths(): Set<string> {
  const cache = loadVerificationCache()
  const paths = new Set<string>()
  for (const result of Object.values(cache)) {
    if (result.cacheVersion !== VERIFICATION_CACHE_VERSION && result.callRecordId) {
      paths.add(result.callRecordId)
    }
  }
  return paths
}

/** 검증 완료된 callRecordId Set 반환 (isVerified=true, 파일경로 기준)
 *  구버전 캐시도 포함 (verified 상태는 유지 — 재처리 시 갱신됨) */
export function getVerifiedPaths(): Set<string> {
  const cache = loadVerificationCache()
  const paths = new Set<string>()
  for (const result of Object.values(cache)) {
    if (result.isVerified && result.callRecordId) paths.add(result.callRecordId)
  }
  return paths
}

/** 검증 완료된 세션 ID Set 반환 (isVerified=true만 — 하위 호환) */
export function getVerifiedSessionIds(): Set<string> {
  const cache = loadVerificationCache()
  const ids = new Set<string>()
  for (const [id, result] of Object.entries(cache)) {
    if (result.isVerified) ids.add(id)
  }
  return ids
}

/** 현재 버전으로 검증 시도된 callRecordId (구버전은 재처리 대상이므로 제외) */
export function getAllCachedPaths(): Set<string> {
  const cache = loadVerificationCache()
  const paths = new Set<string>()
  for (const result of Object.values(cache)) {
    if (result.callRecordId && result.cacheVersion === VERIFICATION_CACHE_VERSION) {
      paths.add(result.callRecordId)
    }
  }
  return paths
}

/** 검증 시도된 모든 세션 ID (하위 호환) */
export function getAllCachedSessionIds(): Set<string> {
  return new Set(Object.keys(loadVerificationCache()))
}

/** 검증 캐시 복원: 3곳(localStorage/Preferences/File) 중 가장 큰 데이터 사용 */
export async function ensureVerificationCacheLoaded(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  // 3곳 모두 읽어서 가장 큰(= 엔트리가 많은) 데이터를 사용
  let lsData: string | null = null
  let prefData: string | null = null
  let fileData: string | null = null

  // 1) localStorage
  try { lsData = localStorage.getItem(VERIFICATION_CACHE_KEY) } catch { /* ignore */ }

  // 2) Preferences
  try {
    const { value } = await Preferences.get({ key: VERIFICATION_CACHE_KEY })
    if (value) prefData = value
  } catch { /* ignore */ }

  // 3) Filesystem
  try {
    const result = await Filesystem.readFile({
      path: CACHE_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    if (typeof result.data === 'string' && result.data) fileData = result.data
  } catch { /* ignore */ }

  // 가장 큰 데이터 선택 (길이 = JSON 크기 ≈ 엔트리 수)
  let best: string | null = null
  let bestLen = 0
  for (const d of [lsData, prefData, fileData]) {
    if (d && d.length > bestLen) {
      best = d
      bestLen = d.length
    }
  }

  if (!best) return  // 3곳 모두 비어있음

  // 메모리 캐시 갱신
  _memCache = JSON.parse(best)

  // 3곳 모두 동기화 (가장 큰 데이터로 통일)
  try { localStorage.setItem(VERIFICATION_CACHE_KEY, best) } catch { /* ignore */ }
  Preferences.set({ key: VERIFICATION_CACHE_KEY, value: best }).catch(() => {})
  Filesystem.writeFile({
    path: CACHE_FILE,
    data: best,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  }).catch(() => {})
}

// ── Worker 관리 ─────────────────────────────────────────────────────────────

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('./embeddingWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('error', (e) => {
      console.error('[embeddingEngine] Worker error:', e)
      if (currentJob) {
        currentJob = { ...currentJob, status: 'error', message: `Worker 오류: ${e.message ?? '알 수 없는 오류'}` }
      }
      isProcessing = false
      notify()
    })
  }
  return worker
}

// ── 오디오 파일 → Float32Array 변환 ─────────────────────────────────────────

async function readAndResampleAudio(
  callRecordId: string,
  sessionId: string,
): Promise<Float32Array> {
  currentJob = { sessionId, status: 'reading', progress: 0, message: '오디오 파일 읽는 중...' }
  notify()

  if (!Capacitor.isNativePlatform()) {
    throw new Error('네이티브 플랫폼에서만 사용 가능')
  }

  const { data } = await Filesystem.readFile({
    path: callRecordId,
    directory: Directory.ExternalStorage,
  })
  const binary = atob(data as string)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  currentJob = { sessionId, status: 'resampling', progress: 0.1, message: '오디오 변환 중 (16kHz)...' }
  notify()
  await new Promise((r) => setTimeout(r, 30))  // UI 양보
  return resampleTo16kMono(bytes.buffer)
}

// ── 임베딩 추출 (Promise wrapper) ───────────────────────────────────────────

function extractEmbedding(
  audio: Float32Array,
  sessionId: string,
): Promise<{ vector: number[]; durationUsedSec: number }> {
  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handler = (e: MessageEvent) => {
      const msg = e.data as EmbeddingWorkerResponse
      if (msg.type === 'progress') {
        currentJob = {
          sessionId,
          status: msg.stage === 'download' ? 'download' : 'extracting',
          progress: msg.progress,
          message: msg.stage === 'download'
            ? `모델 다운로드 ${Math.round(msg.progress * 100)}%`
            : `임베딩 추출 중 ${Math.round(msg.progress * 100)}%`,
        }
        notify()
      } else if (msg.type === 'embedding') {
        w.removeEventListener('message', handler)
        resolve({ vector: msg.vector, durationUsedSec: msg.durationUsedSec })
      } else if (msg.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }

    w.addEventListener('message', handler)
    w.postMessage(
      { type: 'extract', audio, sampleRate: 16000 },
      [audio.buffer],
    )
  })
}

// ── 코사인 유사도 (로컬 계산 — Worker 불필요) ──────────────────────────────

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

// ── 평균 임베딩 계산 ────────────────────────────────────────────────────────

function computeReferenceEmbedding(embeddings: VoiceEmbedding[]): number[] | null {
  if (embeddings.length === 0) return null
  const dim = embeddings[0].vector.length
  const avg = new Array(dim).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb.vector[i]
    }
  }
  // L2 정규화
  const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0))
  if (norm > 0) {
    for (let i = 0; i < dim; i++) avg[i] /= norm
  }
  return avg
}

// ── 등록 품질 검증 ────────────────────────────────────────────────────────

/** 등록 임베딩 간 pairwise 코사인 유사도로 등록 품질 평가 */
export function getEnrollmentQuality(): EnrollmentQuality | null {
  if (profile.embeddings.length < 2) return null

  const pairs: number[] = []
  for (let i = 0; i < profile.embeddings.length; i++) {
    for (let j = i + 1; j < profile.embeddings.length; j++) {
      pairs.push(cosineSimilarity(profile.embeddings[i].vector, profile.embeddings[j].vector))
    }
  }

  const avgPairwise = Math.round((pairs.reduce((s, v) => s + v, 0) / pairs.length) * 1000) / 1000
  const minPairwise = Math.round(Math.min(...pairs) * 1000) / 1000

  let grade: EnrollmentQuality['grade']
  let message: string
  if (avgPairwise >= ENROLLMENT_QUALITY_THRESHOLDS.good) {
    grade = 'good'
    message = '등록 품질이 우수합니다. 정확한 검증이 가능합니다.'
  } else if (avgPairwise >= ENROLLMENT_QUALITY_THRESHOLDS.fair) {
    grade = 'fair'
    message = '등록 품질이 보통입니다. 조용한 환경에서 재등록하면 정확도가 향상됩니다.'
  } else {
    grade = 'poor'
    message = '등록 품질이 낮습니다. 조용한 환경에서 또박또박 재등록을 권장합니다.'
  }

  return { avgPairwise, minPairwise, grade, message }
}

// ── 멀티 세그먼트 임베딩 추출 ──────────────────────────────────────────────

function extractMultiEmbedding(
  audio: Float32Array,
  sessionId: string,
): Promise<SegmentEmbedding[]> {
  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handler = (e: MessageEvent) => {
      const msg = e.data as EmbeddingWorkerResponse
      if (msg.type === 'progress') {
        currentJob = {
          sessionId,
          status: msg.stage === 'download' ? 'download' : 'extracting',
          progress: msg.progress,
          message: msg.stage === 'download'
            ? `모델 다운로드 ${Math.round(msg.progress * 100)}%`
            : `임베딩 추출 중 ${Math.round(msg.progress * 100)}%`,
        }
        notify()
      } else if (msg.type === 'multi_embedding') {
        w.removeEventListener('message', handler)
        resolve(msg.segments)
      } else if (msg.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }

    w.addEventListener('message', handler)
    w.postMessage(
      {
        type: 'extract_multi',
        audio,
        sampleRate: 16000,
        numSegments: MULTI_SEGMENT_CONFIG.numSegments,
        segmentSec: MULTI_SEGMENT_CONFIG.segmentSec,
        minEnergy: MULTI_SEGMENT_CONFIG.minEnergyThreshold,
      },
      [audio.buffer],
    )
  })
}

// ── Public API: 등록 ────────────────────────────────────────────────────────

/**
 * 등록용 오디오에서 임베딩 추출 → 프로필에 추가.
 * minEnrollments(기본 3) 이상이면 enrollmentStatus = 'enrolled'로 전환.
 */
export async function enrollFromFile(
  sessionId: string,
  callRecordId: string,
): Promise<VoiceEmbedding> {
  if (isProcessing) throw new Error('이미 처리 중입니다')
  isProcessing = true
  profile.enrollmentStatus = 'enrolling'
  saveProfile()
  notify()

  try {
    const audio = await readAndResampleAudio(callRecordId, sessionId)
    const { vector, durationUsedSec } = await extractEmbedding(audio, sessionId)

    const embedding: VoiceEmbedding = {
      vector,
      modelId: 'wespeaker-voxceleb-resnet34',
      extractedAt: new Date().toISOString(),
      durationUsedSec,
    }

    profile.embeddings.push(embedding)
    profile.enrollmentCount = profile.embeddings.length
    profile.referenceEmbedding = computeReferenceEmbedding(profile.embeddings)
    profile.updatedAt = new Date().toISOString()

    if (!profile.enrolledAt) {
      profile.enrolledAt = profile.updatedAt
    }

    // 수량 조건 + 품질 조건 (일관성 >= 80%) 둘 다 충족해야 등록 완료
    if (profile.enrollmentCount >= profile.minEnrollments) {
      const quality = getEnrollmentQuality()
      if (quality && quality.avgPairwise >= ENROLLMENT_QUALITY_THRESHOLDS.good) {
        profile.enrollmentStatus = 'enrolled'
      } else {
        // 수량은 충족했지만 품질 미달 — 임베딩 초기화 후 재시도 유도
        profile.embeddings = []
        profile.enrollmentCount = 0
        profile.referenceEmbedding = null
        profile.enrollmentStatus = 'not_enrolled'
        saveProfile()
        const pct = quality ? (quality.avgPairwise * 100).toFixed(0) : '?'
        currentJob = {
          sessionId, status: 'error', progress: 0,
          message: `등록 일관성이 ${pct}%로 기준(80%) 미달입니다. 조용한 환경에서 다시 녹음해주세요.`,
        }
        isProcessing = false
        notify()
        return embedding
      }
    } else {
      profile.enrollmentStatus = 'not_enrolled'  // 아직 등록 미완료
    }

    saveProfile()
    currentJob = { sessionId, status: 'done', progress: 1, message: '등록 완료' }
    isProcessing = false
    notify()
    return embedding
  } catch (err: any) {
    profile.enrollmentStatus = profile.enrollmentCount > 0 ? 'not_enrolled' : 'not_enrolled'
    saveProfile()
    currentJob = {
      sessionId,
      status: 'error',
      progress: 0,
      message: err instanceof Error ? err.message : String(err),
    }
    isProcessing = false
    notify()
    throw err
  }
}

/**
 * 녹음(MediaRecorder)에서 직접 등록.
 * ArrayBuffer → 리샘플링 → 임베딩 추출 → 프로필에 추가.
 * 3회 녹음 후 일관성 >= 80% 필수 — 미달 시 임베딩 초기화 후 재시도 유도.
 */
export async function enrollFromBuffer(
  sessionId: string,
  arrayBuffer: ArrayBuffer,
): Promise<VoiceEmbedding> {
  if (isProcessing) throw new Error('이미 처리 중입니다')
  isProcessing = true
  profile.enrollmentStatus = 'enrolling'
  saveProfile()
  notify()

  try {
    currentJob = { sessionId, status: 'resampling', progress: 0, message: '오디오 변환 중...' }
    notify()
    const audio = await resampleTo16kMono(arrayBuffer)
    const { vector, durationUsedSec } = await extractEmbedding(audio, sessionId)

    const embedding: VoiceEmbedding = {
      vector,
      modelId: 'wespeaker-voxceleb-resnet34',
      extractedAt: new Date().toISOString(),
      durationUsedSec,
    }

    profile.embeddings.push(embedding)
    profile.enrollmentCount = profile.embeddings.length
    profile.referenceEmbedding = computeReferenceEmbedding(profile.embeddings)
    profile.updatedAt = new Date().toISOString()

    if (!profile.enrolledAt) {
      profile.enrolledAt = profile.updatedAt
    }

    // 수량 조건 + 품질 조건 (일관성 >= 80%) 둘 다 충족해야 등록 완료
    if (profile.enrollmentCount >= profile.minEnrollments) {
      const quality = getEnrollmentQuality()
      if (quality && quality.avgPairwise >= ENROLLMENT_QUALITY_THRESHOLDS.good) {
        profile.enrollmentStatus = 'enrolled'
      } else {
        // 수량은 충족했지만 품질 미달 — 임베딩 초기화 후 재시도 유도
        profile.embeddings = []
        profile.enrollmentCount = 0
        profile.referenceEmbedding = null
        profile.enrollmentStatus = 'not_enrolled'
        saveProfile()
        const pct = quality ? (quality.avgPairwise * 100).toFixed(0) : '?'
        currentJob = {
          sessionId, status: 'error', progress: 0,
          message: `등록 일관성이 ${pct}%로 기준(80%) 미달입니다. 조용한 환경에서 다시 녹음해주세요.`,
        }
        isProcessing = false
        notify()
        return embedding
      }
    } else {
      profile.enrollmentStatus = 'not_enrolled'
    }

    saveProfile()
    currentJob = { sessionId, status: 'done', progress: 1, message: '등록 완료' }
    isProcessing = false
    notify()
    return embedding
  } catch (err: any) {
    profile.enrollmentStatus = profile.enrollmentCount > 0 ? 'not_enrolled' : 'not_enrolled'
    saveProfile()
    currentJob = {
      sessionId,
      status: 'error',
      progress: 0,
      message: err instanceof Error ? err.message : String(err),
    }
    isProcessing = false
    notify()
    throw err
  }
}

// ── 고신뢰 임베딩 임시 저장 (reference 보강용, 메모리 전용) ──────────────

const _highConfEmbeddings = new Map<string, number[]>()

/** 고신뢰 검증에서 수집된 통화 도메인 임베딩 반환 */
export function getHighConfidenceEmbeddings(): Map<string, number[]> {
  return _highConfEmbeddings
}

/** 고신뢰 임베딩 임시 저장소 초기화 */
export function clearHighConfidenceEmbeddings(): void {
  _highConfEmbeddings.clear()
}

/** 누적된 통화 도메인 임베딩 (라운드 간 유지) */
const _accumulatedCallEmbeddings: number[][] = []

/** 통화 도메인 임베딩으로 reference 보강
 *  등록 임베딩(마이크) + **누적된** 통화 임베딩(협대역) 블렌딩 → 도메인 차이 보정
 *  통화 임베딩은 고신뢰 매칭이므로 등록과 동일 가중치(1.0) */
export function augmentReferenceWithEmbeddings(callEmbeddings: number[][]): boolean {
  if (callEmbeddings.length === 0) return false
  if (!profile.referenceEmbedding || profile.embeddings.length === 0) return false

  // 새 임베딩을 누적 풀에 추가
  for (const vec of callEmbeddings) _accumulatedCallEmbeddings.push(vec)

  const dim = profile.referenceEmbedding.length
  const aug = new Array(dim).fill(0)

  // 기존 등록 임베딩 합산 (가중치 1.0)
  for (const emb of profile.embeddings) {
    for (let i = 0; i < dim; i++) aug[i] += emb.vector[i]
  }

  // 누적된 전체 통화 임베딩 합산 (가중치 1.0 — 고신뢰 매칭)
  for (const vec of _accumulatedCallEmbeddings) {
    for (let i = 0; i < dim; i++) aug[i] += vec[i]
  }

  // L2 정규화
  const norm = Math.sqrt(aug.reduce((s, v) => s + v * v, 0))
  if (norm > 0) {
    for (let i = 0; i < dim; i++) aug[i] /= norm
  }

  profile.referenceEmbedding = aug
  profile.updatedAt = new Date().toISOString()
  saveProfile()
  console.log(`[embeddingEngine] reference augmented: ${profile.embeddings.length} enrollment + ${_accumulatedCallEmbeddings.length} call (total accumulated)`)
  notify()
  return true
}

/** 미검증 세션의 캐시만 삭제 (보강 후 재검증용) */
export function clearUnverifiedCache(): number {
  const cache = loadVerificationCache()
  let cleared = 0
  for (const [key, result] of Object.entries(cache)) {
    if (!result.isVerified) {
      delete cache[key]
      cleared++
    }
  }
  if (cleared > 0) {
    _memCache = cache
    const json = JSON.stringify(cache)
    try { localStorage.setItem(VERIFICATION_CACHE_KEY, json) } catch { /* ignore */ }
    if (Capacitor.isNativePlatform()) {
      Preferences.set({ key: VERIFICATION_CACHE_KEY, value: json }).catch(() => {})
      Filesystem.writeFile({
        path: CACHE_FILE,
        data: json,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      }).catch(() => {})
    }
  }
  return cleared
}

// ── Public API: 검증 ────────────────────────────────────────────────────────

/**
 * 세션 오디오를 등록된 프로필과 비교하여 화자 검증.
 * 멀티 세그먼트 슬라이딩 윈도우: 상위 에너지 3구간 임베딩 추출 → MAX 유사도.
 * 상대방이 더 큰 소리로 말해도 사용자 음성 구간을 탐지할 수 있음.
 * 결과를 캐시에 저장하고 반환.
 */
export async function verifySession(
  sessionId: string,
  callRecordId: string,
): Promise<VerificationResult> {
  if (!profile.referenceEmbedding) {
    throw new Error('등록된 음성 프로필이 없습니다')
  }
  if (isProcessing) throw new Error('이미 처리 중입니다')

  // 캐시 확인 (현재 버전만 유효)
  const cached = getVerificationResult(sessionId)
  if (cached && cached.cacheVersion === VERIFICATION_CACHE_VERSION) return cached

  isProcessing = true
  notify()

  try {
    const audio = await readAndResampleAudio(callRecordId, sessionId)

    // 멀티 세그먼트: 슬라이딩 윈도우로 최적 구간 3개 추출 → 각각 유사도 → MAX
    const segments = await extractMultiEmbedding(audio, sessionId)

    let bestSimilarity = 0
    for (const seg of segments) {
      const sim = cosineSimilarity(seg.vector, profile.referenceEmbedding!)
      if (sim > bestSimilarity) bestSimilarity = sim
    }

    const similarity = bestSimilarity
    const threshold = VERIFICATION_THRESHOLDS.default
    const isVerified = similarity >= threshold

    let confidence: 'high' | 'medium' | 'low'
    if (similarity >= VERIFICATION_THRESHOLDS.confidenceBands.high) {
      confidence = 'high'
    } else if (similarity >= VERIFICATION_THRESHOLDS.confidenceBands.medium) {
      confidence = 'medium'
    } else {
      confidence = 'low'
    }

    // 고신뢰 결과의 best 임베딩 보관 (reference 보강용, 메모리 전용)
    if (isVerified && confidence === 'high') {
      let bestVec = segments[0].vector
      let bestSim = 0
      for (const seg of segments) {
        const sim = cosineSimilarity(seg.vector, profile.referenceEmbedding!)
        if (sim > bestSim) { bestSim = sim; bestVec = seg.vector }
      }
      _highConfEmbeddings.set(sessionId, bestVec)
    }

    const result: VerificationResult = {
      sessionId,
      callRecordId,
      similarity: Math.round(similarity * 1000) / 1000,
      threshold,
      isVerified,
      verifiedAt: new Date().toISOString(),
      confidence,
      cacheVersion: VERIFICATION_CACHE_VERSION,
      segmentCount: segments.length,
    }

    saveVerificationResult(result)
    currentJob = { sessionId, status: 'done', progress: 1, message: isVerified ? '본인 확인됨' : '본인 확인 실패' }
    isProcessing = false
    notify()
    return result
  } catch (err: any) {
    currentJob = {
      sessionId,
      status: 'error',
      progress: 0,
      message: err instanceof Error ? err.message : String(err),
    }
    isProcessing = false
    notify()
    throw err
  }
}

/**
 * ArrayBuffer에서 직접 검증 (녹음 데이터).
 */
export async function verifyFromBuffer(
  sessionId: string,
  arrayBuffer: ArrayBuffer,
): Promise<VerificationResult> {
  if (!profile.referenceEmbedding) {
    throw new Error('등록된 음성 프로필이 없습니다')
  }
  if (isProcessing) throw new Error('이미 처리 중입니다')

  isProcessing = true
  notify()

  try {
    currentJob = { sessionId, status: 'resampling', progress: 0, message: '오디오 변환 중...' }
    notify()
    const audio = await resampleTo16kMono(arrayBuffer)
    const { vector } = await extractEmbedding(audio, sessionId)

    const similarity = cosineSimilarity(vector, profile.referenceEmbedding)
    const threshold = VERIFICATION_THRESHOLDS.default
    const isVerified = similarity >= threshold

    let confidence: 'high' | 'medium' | 'low'
    if (similarity >= VERIFICATION_THRESHOLDS.confidenceBands.high) {
      confidence = 'high'
    } else if (similarity >= VERIFICATION_THRESHOLDS.confidenceBands.medium) {
      confidence = 'medium'
    } else {
      confidence = 'low'
    }

    const result: VerificationResult = {
      sessionId,
      similarity: Math.round(similarity * 1000) / 1000,
      threshold,
      isVerified,
      verifiedAt: new Date().toISOString(),
      confidence,
    }

    saveVerificationResult(result)
    currentJob = { sessionId, status: 'done', progress: 1, message: isVerified ? '본인 확인됨' : '본인 확인 실패' }
    isProcessing = false
    notify()
    return result
  } catch (err: any) {
    currentJob = {
      sessionId,
      status: 'error',
      progress: 0,
      message: err instanceof Error ? err.message : String(err),
    }
    isProcessing = false
    notify()
    throw err
  }
}

// ── Public API: 프로필 관리 ─────────────────────────────────────────────────

/** 현재 프로필 반환 */
export function getProfile(): VoiceProfile {
  return profile
}

/** 등록 초기화 (모든 임베딩 + 검증 결과 삭제, 세션 검증 상태도 리셋) */
export function resetProfile(): void {
  profile = { ...DEFAULT_VOICE_PROFILE }
  _memCache = null
  _highConfEmbeddings.clear()
  _accumulatedCallEmbeddings.length = 0
  saveProfile()
  try { localStorage.removeItem(VERIFICATION_CACHE_KEY) } catch { /* ignore */ }
  if (Capacitor.isNativePlatform()) {
    Preferences.remove({ key: VERIFICATION_CACHE_KEY }).catch(() => {})
    Filesystem.deleteFile({ path: CACHE_FILE, directory: Directory.Data }).catch(() => {})
  }
  // 세션의 verifiedSpeaker/consentStatus도 초기화 (비동기이지만 fire-and-forget)
  resetVerificationFields().catch(() => {})
  notify()
}

/** 등록 완료 여부 */
export function isEnrolled(): boolean {
  return profile.enrollmentStatus === 'enrolled'
}

/** 등록 진행률 (0~1) */
export function enrollmentProgress(): number {
  return Math.min(1, profile.enrollmentCount / profile.minEnrollments)
}

// ── 상태 조회 ───────────────────────────────────────────────────────────────

export function getState(): EmbeddingEngineState {
  return {
    profile,
    currentJob,
    isProcessing,
  }
}

// ── React 훅 ────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

/** 임베딩 엔진 상태 실시간 추적 */
export function useEmbeddingEngine(): EmbeddingEngineState {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1))
  }, [])

  return {
    profile,
    currentJob,
    isProcessing,
  }
}

/** 특정 세션의 검증 결과 반환 */
export function useVerificationResult(sessionId: string | undefined): VerificationResult | null {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1))
  }, [])

  if (!sessionId) return null
  return getVerificationResult(sessionId)
}
