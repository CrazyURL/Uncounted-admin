// Admin 전용 Session 확장 타입
//
// 마이그레이션 052에서 sessions 테이블에 추가된 처리 흐름·검수 컬럼.
// 기존 src/types/session.ts 의 Session 타입은 사용자 앱과 공유되므로
// admin 전용 확장 필드는 본 파일에서 분리 관리.

export type PipelineStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

// 전체 파이프라인의 집계 상태
export type PipelineState = 'idle' | 'waiting' | 'running' | 'stuck' | 'failed' | 'ready'

export type ReviewStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'needs_revision'

export interface SessionPipeline {
  upload_status?: PipelineStatus
  uploaded_at?: string | null

  stt_status?: PipelineStatus
  stt_at?: string | null

  diarize_status?: PipelineStatus
  diarize_at?: string | null

  pii_status?: PipelineStatus
  pii_at?: string | null

  auto_label_status?: PipelineStatus
  label_at?: string | null

  quality_status?: PipelineStatus
  quality_at?: string | null

  review_status?: ReviewStatus
}

export interface SessionSpeaker {
  speaker_label: string
  speaker_role: string | null
  speaker_gender: string | null
  speaker_voice_age_range: string | null
  speaker_speech_age_range: string | null
  speaker_relation: string | null
  speaker_accent_group: string | null
  speaker_region_group: string | null
  utterance_count: number
  total_duration_sec: number
}

export interface PiiIntervalSample {
  startSec: number
  endSec: number
  maskType: string | null
  piiType: string | null
}

export interface AdminSession extends SessionPipeline {
  id: string
  user_id: string
  title?: string | null
  date: string
  duration_seconds: number
  consent_status: 'none' | 'user_only' | 'both_agreed' | 'user_withdrew' | 'peer_withdrew'
  consented_at?: string | null
  created_at: string
  pii_flag?: boolean
  pii_count?: number
  quality_grade_min?: 'A' | 'B' | 'C' | null
  quality_score_avg?: number | null
  snr_db_avg?: number | null
  speech_ratio_avg?: number | null
  pii_interval_samples?: PiiIntervalSample[]
  speakers?: SessionSpeaker[]
}

// 실제 voice API 처리 순서: 업로드 → STT → 화자분리 → 개인정보 → 자동 라벨링 → 품질 처리
const STUCK_THRESHOLD_MS = 30 * 60 * 1000

type StageKey = keyof Pick<
  SessionPipeline,
  'upload_status' | 'stt_status' | 'diarize_status' | 'pii_status' | 'auto_label_status' | 'quality_status'
>

type TimestampKey = keyof Pick<
  SessionPipeline,
  'uploaded_at' | 'stt_at' | 'diarize_at' | 'pii_at' | 'label_at' | 'quality_at'
>

const STAGES: Array<{ status: StageKey; prevAt: TimestampKey | null }> = [
  { status: 'upload_status',     prevAt: null          },
  { status: 'stt_status',        prevAt: 'uploaded_at' },
  { status: 'diarize_status',    prevAt: 'stt_at'      },
  { status: 'pii_status',        prevAt: 'diarize_at'  },
  { status: 'auto_label_status', prevAt: 'pii_at'      },
  { status: 'quality_status',    prevAt: 'label_at'    },
]

const STAGE_LABELS: Record<StageKey, string> = {
  upload_status:     '업로드',
  stt_status:        'STT',
  diarize_status:    '화자분리',
  pii_status:        '개인정보',
  auto_label_status: '자동 라벨링',
  quality_status:    '품질 처리',
}

function isTerminal(v?: PipelineStatus): boolean {
  return v === 'done' || v === 'skipped'
}

export function getPipelineState(session: SessionPipeline, now: Date = new Date()): PipelineState {
  if (STAGES.some((s) => session[s.status] === 'failed')) return 'failed'

  if (STAGES.every((s) => isTerminal(session[s.status]))) return 'ready'

  if (STAGES.every((s) => !session[s.status] || session[s.status] === 'pending')) return 'idle'

  for (const stage of STAGES) {
    if (session[stage.status] === 'running') {
      if (stage.prevAt) {
        const prevAt = session[stage.prevAt]
        if (prevAt && now.getTime() - new Date(prevAt).getTime() > STUCK_THRESHOLD_MS) {
          return 'stuck'
        }
      }
      return 'running'
    }
  }

  // 일부 done/skipped, 일부 pending — 아무 스테이지도 running 아님
  return 'waiting'
}

export function getActiveStageLabel(session: SessionPipeline): string | null {
  for (const stage of STAGES) {
    if (session[stage.status] === 'running') return STAGE_LABELS[stage.status]
  }
  return null
}

// 처리 흐름 모든 단계 완료 여부 (done 또는 skipped)
export const isPipelineComplete = (s: SessionPipeline): boolean => getPipelineState(s) === 'ready'

// 처리 흐름 진행도 (0~1, 정렬용)
export function pipelineProgress(s: SessionPipeline): number {
  const done = STAGES.filter((st) => isTerminal(s[st.status])).length
  return done / STAGES.length
}

export type PipelineStep = 'upload' | 'stt' | 'diarize' | 'pii' | 'auto_label' | 'quality'

// 실패한 단계 이름 (있으면)
export function firstFailedStep(s: SessionPipeline): PipelineStep | null {
  if (s.upload_status === 'failed') return 'upload'
  if (s.stt_status === 'failed') return 'stt'
  if (s.diarize_status === 'failed') return 'diarize'
  if (s.pii_status === 'failed') return 'pii'
  if (s.auto_label_status === 'failed') return 'auto_label'
  if (s.quality_status === 'failed') return 'quality'
  return null
}

// ── 판매 상태 ─────────────────────────────────────────────────────────────────

export type SaleStatus = 'sellable' | 'restricted' | 'locked'

/**
 * 세션의 판매 가능 상태를 판정한다.
 *
 * locked 조건 (하나라도 해당하면 locked):
 *   - consent_status !== 'both_agreed'
 *   - 파이프라인 미완료 또는 실패
 *   - pii_flag === true (PII 위험)
 *   - review_status === 'rejected'
 *   - 포함 발화 0개 (utteranceCount 또는 includedUtteranceCount가 명시적으로 0)
 *
 * sellable 조건 (locked가 아니고 모두 충족):
 *   - review_status === 'approved'
 *   - 포함 발화 1개 이상 (또는 발화 수 미지정)
 *
 * restricted: locked도 sellable도 아닌 나머지
 */
export function getSaleStatus(
  session: AdminSession,
  utteranceCount?: number,
  includedUtteranceCount?: number,
): SaleStatus {
  const included = includedUtteranceCount ?? utteranceCount

  if (session.consent_status !== 'both_agreed') return 'locked'
  if (!isPipelineComplete(session)) return 'locked'
  if (session.pii_flag === true) return 'locked'
  if (session.review_status === 'rejected') return 'locked'
  if (included !== undefined && included === 0) return 'locked'

  if (session.review_status === 'approved' && (included === undefined || included >= 1)) {
    return 'sellable'
  }

  return 'restricted'
}

/** 최소 판매 가능 조건 충족 여부 */
export function isMinSaleable(
  session: AdminSession,
  utteranceCount?: number,
  includedUtteranceCount?: number,
): boolean {
  return getSaleStatus(session, utteranceCount, includedUtteranceCount) === 'sellable'
}

/** 판매 상태 한국어 레이블 */
export function getSaleStatusLabel(status: SaleStatus): string {
  switch (status) {
    case 'sellable':   return '판매 가능'
    case 'restricted': return '제한'
    case 'locked':     return '잠김'
  }
}

/** 판매 상태에 대응하는 Badge variant */
export function getSaleStatusBadgeVariant(
  status: SaleStatus,
): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'sellable':   return 'default'
    case 'restricted': return 'secondary'
    case 'locked':     return 'destructive'
  }
}
