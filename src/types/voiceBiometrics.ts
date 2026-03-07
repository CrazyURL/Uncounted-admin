// ── Voice Biometrics Types — 화자 인증 (Phase 2) ─────────────────────────────
// 통신비밀보호법 준수: 본인 목소리 인증 → consentStatus 'locked' → 'user_only' 전환
// WeSpeaker (ONNX) 기반 화자 임베딩 추출 + 코사인 유사도 검증
// 임베딩은 로컬에만 저장 — 서버 전송 금지

// ── 임베딩 ──────────────────────────────────────────────────────────────────

/** 화자 임베딩 벡터 (WeSpeaker 256-dim) */
export type VoiceEmbedding = {
  vector: number[]        // 256-dim float (JSON 직렬화용)
  modelId: string         // 사용 모델 (e.g. 'wespeaker-voxceleb-resnet34')
  extractedAt: string     // ISO 날짜
  durationUsedSec: number // 임베딩 추출에 사용된 오디오 길이
}

// ── 등록 상태 ───────────────────────────────────────────────────────────────

export type EnrollmentStatus =
  | 'not_enrolled'        // 미등록
  | 'enrolling'           // 등록 진행 중 (녹음/추출)
  | 'enrolled'            // 등록 완료 (임베딩 저장됨)

// ── 화자 프로필 (로컬 저장) ─────────────────────────────────────────────────

export type VoiceProfile = {
  enrollmentStatus: EnrollmentStatus
  embeddings: VoiceEmbedding[]   // 다수 등록 가능 (평균으로 대표 임베딩 산출)
  referenceEmbedding: number[] | null  // embeddings 평균 벡터 (검증 시 사용)
  enrolledAt: string | null      // 최초 등록 일시
  updatedAt: string | null       // 마지막 업데이트
  enrollmentCount: number        // 총 등록 세션 수
  minEnrollments: number         // 최소 필요 등록 수 (기본 3)
}

export const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  enrollmentStatus: 'not_enrolled',
  embeddings: [],
  referenceEmbedding: null,
  enrolledAt: null,
  updatedAt: null,
  enrollmentCount: 0,
  minEnrollments: 3,
}

// ── 검증 결과 ───────────────────────────────────────────────────────────────

export type VerificationResult = {
  sessionId: string
  callRecordId?: string           // 파일 경로 (안정적 캐시 키 — sessionId는 재스캔 시 변경 가능)
  similarity: number              // 코사인 유사도 (0~1) — multi-segment max
  threshold: number               // 판정 임계값
  isVerified: boolean             // similarity >= threshold
  verifiedAt: string              // ISO 날짜
  confidence: 'high' | 'medium' | 'low'  // 유사도 신뢰 구간
  cacheVersion?: number           // 캐시 버전 (multi-segment: 2)
  segmentCount?: number           // 분석에 사용된 세그먼트 수
}

// ── 검증 임계값 설정 ────────────────────────────────────────────────────────

export const VERIFICATION_THRESHOLDS = {
  /** 코사인 유사도 기본 임계값
   *  재등록 후 reference 품질에 따라 유사도 분포 변동 큼
   *  false-negative 최소화 우선 (사용자 음성인데 못 잡는 것 방지) */
  default: 0.30,
  /** 높은 보안 요구 시 */
  strict: 0.45,
  /** 신뢰도 구간 경계 */
  confidenceBands: {
    high: 0.45,    // >= 0.45 → 높은 확신
    medium: 0.30,  // >= 0.30 → 중간 확신
    // < 0.30 → 낮은 확신
  },
} as const

// ── 멀티 세그먼트 설정 ──────────────────────────────────────────────────────

export const MULTI_SEGMENT_CONFIG = {
  /** 세그먼트 길이 (초) — WeSpeaker는 10초에서 검증된 품질, 3초는 임베딩 품질 저하 */
  segmentSec: 10,
  /** 추출할 세그먼트 수 — 상위 에너지 구간 */
  numSegments: 5,
  /** 최소 에너지 임계값 — 무음 세그먼트 스킵 (RMS 기준) */
  minEnergyThreshold: 0.005,
} as const

/** 캐시 버전: 임계값/알고리즘 변경 시 증가 → 구버전 캐시 무효화 */
export const VERIFICATION_CACHE_VERSION = 7

// ── 등록 품질 ───────────────────────────────────────────────────────────────

export type EnrollmentQuality = {
  /** 등록 임베딩 간 평균 pairwise 코사인 유사도 */
  avgPairwise: number
  /** 등록 임베딩 간 최소 pairwise 코사인 유사도 */
  minPairwise: number
  /** 품질 등급 */
  grade: 'good' | 'fair' | 'poor'
  /** 사용자 안내 메시지 */
  message: string
}

export const ENROLLMENT_QUALITY_THRESHOLDS = {
  /** good: 등록 임베딩 간 평균 유사도 >= 0.80 — 이 등급 이상만 등록 허용 */
  good: 0.80,
  /** fair: >= 0.50 */
  fair: 0.50,
  // poor: < 0.50
} as const

// ── Worker 메시지 타입 ──────────────────────────────────────────────────────

export type EmbeddingWorkerRequest =
  | { type: 'extract'; audio: Float32Array; sampleRate: number }
  | { type: 'extract_multi'; audio: Float32Array; sampleRate: number; numSegments: number; segmentSec: number; minEnergy: number }
  | { type: 'compare'; embedding1: number[]; embedding2: number[] }

export type SegmentEmbedding = {
  vector: number[]
  startSec: number
  durationSec: number
  energy: number
}

export type EmbeddingWorkerResponse =
  | { type: 'progress'; stage: 'download' | 'loading' | 'extracting'; progress: number }
  | { type: 'embedding'; vector: number[]; durationUsedSec: number }
  | { type: 'multi_embedding'; segments: SegmentEmbedding[] }
  | { type: 'similarity'; score: number }
  | { type: 'error'; message: string }

// ── localStorage 키 ────────────────────────────────────────────────────────

export const VOICE_PROFILE_KEY = 'uncounted_voice_profile'
export const VERIFICATION_CACHE_KEY = 'uncounted_verification_cache'
