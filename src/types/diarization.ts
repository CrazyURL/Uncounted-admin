// ── Speaker Diarization Types (Phase 3) ────────────────────────────────────
// PyAnnote 기반 화자 분리: 오디오에서 "누가 언제 말했는지" 세그먼트 추출
// 통신비밀보호법 준수: 본인 세그먼트만 user_only로 판매, 전체는 both_agreed 필요

// ── 화자 세그먼트 ──────────────────────────────────────────────────────────

export type SpeakerSegment = {
  speakerId: string      // 'SPEAKER_00', 'SPEAKER_01', ...
  startSec: number       // 세그먼트 시작 (초)
  endSec: number         // 세그먼트 종료 (초)
  durationSec: number    // endSec - startSec
}

// ── 화자 요약 ──────────────────────────────────────────────────────────────

export type SpeakerSummary = {
  speakerId: string
  totalDurationSec: number
  segmentCount: number
  speakingRatio: number  // 0~1, 전체 대비 발화 비율
  isUser: boolean        // 본인 화자로 매핑됨
}

// ── 다이어라이제이션 결과 ──────────────────────────────────────────────────

export type DiarizationStatus = 'pending' | 'processing' | 'done' | 'error'

export type DiarizationResult = {
  sessionId: string
  status: DiarizationStatus
  segments: SpeakerSegment[]
  speakers: SpeakerSummary[]
  totalSpeakers: number
  totalDurationSec: number
  processedAt: string | null
  error: string | null
  // 본인 화자 매핑
  userSpeakerId: string | null   // 화자 인증으로 매핑된 본인 화자 ID
  userDurationSec: number        // 본인 발화 총 시간
  peerDurationSec: number        // 상대방 발화 총 시간
}

export const EMPTY_DIARIZATION: DiarizationResult = {
  sessionId: '',
  status: 'pending',
  segments: [],
  speakers: [],
  totalSpeakers: 0,
  totalDurationSec: 0,
  processedAt: null,
  error: null,
  userSpeakerId: null,
  userDurationSec: 0,
  peerDurationSec: 0,
}

// ── Worker 메시지 타입 ──────────────────────────────────────────────────────

export type DiarizationWorkerRequest = {
  type: 'diarize'
  audio: Float32Array
  sampleRate: number
  sessionId: string
}

export type DiarizationWorkerResponse =
  | { type: 'progress'; stage: 'download' | 'loading' | 'processing'; progress: number; sessionId: string }
  | { type: 'result'; sessionId: string; segments: SpeakerSegment[]; speakers: SpeakerSummary[] }
  | { type: 'error'; sessionId: string; message: string }

// ── localStorage 키 ────────────────────────────────────────────────────────

export const DIARIZATION_CACHE_KEY = 'uncounted_diarization_cache'
