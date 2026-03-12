import { type AudioMetrics } from '../lib/audioAnalyzer'
import { type VisibilityStatus, type VisibilitySource } from './consent'

export type { AudioMetrics } from '../lib/audioAnalyzer'
export type { VisibilityStatus, VisibilitySource } from './consent'

export type LabelCategory = {
  relationship: string | null
  purpose: string | null
  domain: string | null
  tone: string | null
  noise: string | null
  // A03 대화행위 확장 (선택)
  primarySpeechAct?: string | null
  speechActEvents?: string[]
  interactionMode?: 'qa' | 'explanatory' | 'negotiation' | 'casual' | null
}

export type AssetType = '업무/회의' | '기술 논의' | '교육/강의' | '비즈니스'

// 세션 처리 상태 (스캔 → 분석 → 업로드 → 완료)
export type SessionStatus = 'pending' | 'processing' | 'uploading' | 'uploaded' | 'failed'

// 업로드 상태머신 (LOCAL → QUEUED → UPLOADING → UPLOADED | FAILED)
export type UploadStatus = 'LOCAL' | 'QUEUED' | 'UPLOADING' | 'UPLOADED' | 'FAILED'

// PII 상태머신 (CLEAR → SUSPECT → LOCKED → REVIEWED)
export type PiiStatus = 'CLEAR' | 'SUSPECT' | 'LOCKED' | 'REVIEWED'

// 공개 범위
export type ShareScope = 'PRIVATE' | 'GROUP' | 'PUBLIC'

// PII 검토 액션
export type ReviewAction = 'EXCLUDE_SEGMENT' | 'MASK_TEXT_ONLY' | 'DO_NOT_SHARE'

// 통화 상대방 동의 상태 (통신비밀보호법 준수)
// locked     = 기본값. 메타데이터만 판매 가능 (음성 판매 불가)
// user_only  = 본인 목소리 인증 완료 → 화자 분리 후 본인 음성만 판매 가능
// both_agreed = 상대방도 동의 → 전체 음성 판매 가능
export type ConsentStatus = 'locked' | 'user_only' | 'both_agreed'

export type Session = {
  id: string
  title: string
  date: string
  duration: number
  qaScore?: number
  labels: LabelCategory | null
  audioMetrics: AudioMetrics | null
  isPublic: boolean                            // 사용자 데이터 공개 동의 여부 (DB 호환)
  visibilityStatus: VisibilityStatus           // 'PUBLIC_CONSENTED' | 'PRIVATE'
  visibilitySource: VisibilitySource           // 변경 출처: GLOBAL_DEFAULT | MANUAL | SKU_DEFAULT
  visibilityConsentVersion: string | null      // 동의 버전 (e.g. 'v1-2026-02')
  visibilityChangedAt: string | null           // 변경 날짜 day bucket 'YYYY-MM-DD'
  status: SessionStatus
  isPiiCleaned: boolean          // 개인정보 비식별화 완료 여부
  hasDiarization?: boolean       // 화자분리 완료 여부 (Supabase has_diarization)
  chunkCount: number             // 생성된 1분 청크 수
  audioUrl?: string              // 정제된 오디오 재생 URL (Supabase Storage)
  callRecordId?: string          // 원본 통화 파일 ID
  // === 공개 준비 상태머신 (Phase 2) ===
  uploadStatus?: UploadStatus          // default: 'LOCAL'
  piiStatus?: PiiStatus                // default: 'CLEAR'
  shareScope?: ShareScope              // default: 'PRIVATE'
  eligibleForShare?: boolean           // default: false
  reviewAction?: ReviewAction | null
  // PII 잠금 구간
  lockReason?: Record<string, unknown> | null
  lockStartMs?: number | null
  lockEndMs?: number | null
  // 정제 캐시 경로
  localSanitizedWavPath?: string | null
  localSanitizedTextPreview?: string | null
  // === 동의 상태 + 화자 인증 ===
  consentStatus?: ConsentStatus        // default: 'locked'
  verifiedSpeaker?: boolean            // 본인 목소리 인증 완료 여부
  // === Auth + 자동 라벨링 (Phase 3) ===
  userId?: string | null
  peerId?: string | null
  labelStatus?: 'AUTO' | 'RECOMMENDED' | 'REVIEW' | 'LOCKED' | 'CONFIRMED' | null
  labelSource?: 'auto' | 'user' | 'user_confirmed' | 'multi_confirmed' | null
  labelConfidence?: number | null  // 0~1
}

// 자동 라벨 상태
export type LabelStatus = 'AUTO' | 'RECOMMENDED' | 'REVIEW' | 'LOCKED' | 'CONFIRMED'

// 원본 통화 파일 (기기에서 스캔된 원본)
export type CallRecord = {
  id: string
  filePath: string
  filename: string
  sizeBytes: number
  durationSeconds: number
  createdAt: string
  assetType: AssetType
  sessionId?: string             // 처리 후 생성된 Session ID
}

// 1분 단위 최소 판매 청크
export type Chunk = {
  id: string                     // session_id + '_' + minuteIndex
  sessionId: string
  minuteIndex: number
  durationSeconds: number
  audioUrl?: string
  labels: LabelCategory | null
  isPiiCleaned: boolean
  qualityScore: number
}
