// 한국어 UI 라벨 매핑 (admin 전용)
//
// 운영자가 보는 모든 텍스트는 본 파일을 경유한다.
// 직접 한국어 문자열을 컴포넌트에 박지 않는다 (i18n 확장 + 일관성).
//
// DB 기술 용어(트리거·외래키·인덱스·RLS·CHECK)는 본 매핑에 포함하지 않으며,
// 코드 내부에서만 영어 유지.
//
// 사용:
//   import { labels } from '@/lib/labels'
//   <span>{labels.status.pending}</span>  // "대기 중"
//   <span>{labels.review[session.review_status]}</span>

import { firstFailedStep, type PipelineStep, type SessionPipeline } from '../types/adminSession'

export const labels = {
  // ── 처리 흐름 단계 status (sessions.upload_status / stt_status / ...) ──
  status: {
    pending: '대기 중',
    running: '처리 중',
    done: '완료',
    failed: '실패',
  },

  // ── 검수 상태머신 (sessions.review_status) ─────────────────────────────
  review: {
    pending: '검수대기중',
    in_review: '검수 중',
    approved: '승인됨',
    rejected: '거절됨',
    needs_revision: '수정 필요',
  },

  // ── 동의 상태 (sessions.consent_status) ────────────────────────────────
  consent: {
    none: '동의 없음',
    user_only: '본인만 동의',
    both_agreed: '양측 동의',
    user_withdrew: '본인 철회',
    peer_withdrew: '상대 철회',
  },

  // ── 통화 등급 (call grade — premium/standard/excluded) ─────────────────
  grade: {
    premium: '프리미엄',
    standard: '표준',
    excluded: '거래 불가',
  },

  // ── 정산 상태 (transactions.status) ────────────────────────────────────
  payout: {
    hold: '지급 대기',
    released: '지급 완료',
  },

  // ── 처리 흐름 단계 이름 ────────────────────────────────────────────────
  pipeline: {
    upload: '업로드',
    stt: '음성 인식',
    diarize: '화자 분리',
    pii: '개인정보 마스킹',
    auto_label: '자동 라벨링',
    quality: '품질 검증',
    done: '완료',
  },

  // ── 일반 액션 ──────────────────────────────────────────────────────────
  action: {
    save: '저장',
    cancel: '취소',
    delete: '삭제',
    edit: '수정',
    create: '생성',
    confirm: '확인',
    close: '닫기',
    retry: '다시 시도',
    refresh: '새로고침',
    export: '내보내기',
    import: '가져오기',
    search: '검색',
    filter: '필터',
    sort: '정렬',
    apply: '적용',
    reset: '초기화',
    next: '다음',
    previous: '이전',
    submit: '제출',
    approve: '승인',
    reject: '거절',
    needRevision: '수정 요청',
    startReview: '검수 시작',
    deliver: '납품',
    settle: '정산',
  },

  // ── 일반 명사 ──────────────────────────────────────────────────────────
  noun: {
    dashboard: '종합 현황',
    pipeline: '처리 흐름',
    review: '검수',
    delivery: '납품',
    transaction: '거래',
    balance: '잔액',
    payout: '정산금',
    cap: '연간 한도',
    capYearly: '연간 한도 ₩3,000,000',
    yearlyReached: '연간 한도 도달',
    yearlyRemaining: '한도 잔여',
    utterance: '발화',
    call: '통화',
    session: '세션',
    buyer: '매수자',
    client: '매수자',
    user: '사용자',
    nonexclusive: '비배타적',
    settings: '설정',
    log: '로그',
    audit: '감사 추적',
  },

  // ── 빈 상태 메시지 ─────────────────────────────────────────────────────
  empty: {
    sessions: '아직 세션이 없습니다',
    sessionsHint: '클라이언트 앱에서 데이터가 업로드되면 여기에 표시됩니다',
    review: '검수 대기 항목이 없습니다',
    reviewHint: 'GPU 처리가 완료된 통화가 검수 대기열에 자동으로 추가됩니다',
    delivery: '납품 이력이 없습니다',
    deliveryHint: '검수 승인된 통화부터 납품을 진행할 수 있습니다',
    transactions: '거래 내역이 없습니다',
    balances: '잔액 정보가 없습니다',
    search: '검색 결과가 없습니다',
    searchHint: '검색어를 변경하거나 필터를 조정해 보세요',
  },

  // ── 에러 메시지 ────────────────────────────────────────────────────────
  error: {
    networkFailed: '네트워크 연결에 실패했습니다',
    fetchFailed: '데이터를 불러오지 못했습니다',
    saveFailed: '저장에 실패했습니다',
    deleteFailed: '삭제에 실패했습니다',
    unauthorized: '권한이 없습니다',
    notFound: '대상을 찾을 수 없습니다',
    duplicateDelivery: '이미 이 매수자에 납품된 데이터입니다',
    capacityExceeded: '연간 한도를 초과했습니다',
    pipelineIncomplete: '처리 흐름이 완료되지 않았습니다',
    invalidStatus: '현재 상태에서는 진행할 수 없습니다',
  },

  // ── 토스트 (성공) ──────────────────────────────────────────────────────
  toast: {
    saved: '저장되었습니다',
    deleted: '삭제되었습니다',
    approved: '승인되었습니다',
    rejected: '거절되었습니다',
    needsRevision: '수정 요청 처리되었습니다',
    startedReview: '검수가 시작되었습니다',
    delivered: '납품 처리되었습니다',
    refreshed: '데이터를 새로 불러왔습니다',
    copied: '클립보드에 복사되었습니다',

    // 창 E — v2 단건 export 다운로드
    v2ExportStarted: '다운로드를 시작합니다. 새 창에서 다운로드를 확인해주세요',
    v2ExportLinkCopied: '다운로드 창이 열리지 않아 링크를 클립보드에 복사했습니다',
    v2ExportPopupBlocked: '팝업이 차단되어 다운로드 창을 열지 못했습니다',
    v2ExportError: {
      ineligible: '이 통화는 현재 내보낼 수 없는 상태입니다. 검수 승인과 동의 상태를 확인해주세요',
      audioUnsupported: '음성 파일 포함 내보내기는 아직 지원하지 않습니다',
      safetyBlocked: '안전 검사에서 차단되었습니다. 관리자에게 문의해주세요',
      generic: '내보내기 준비에 실패했습니다. 잠시 후 다시 시도해주세요',
      network: '네트워크 연결을 확인해주세요',
    },
  },

  // ── 확인 모달 ──────────────────────────────────────────────────────────
  confirm: {
    deleteTitle: '삭제 확인',
    deleteBody: '이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?',
    rejectTitle: '거절 확인',
    rejectBody: '거절 후에는 납품할 수 없습니다. 진행하시겠습니까?',
    deliverTitle: '납품 확인',
    deliverBody: '납품을 확정하면 해당 매수자에게 동일 통화를 다시 판매할 수 없습니다.',
    deliverDuplicateBody: '이미 다른 매수자에 납품된 데이터입니다. 비배타적 라이선스로 추가 납품을 진행하시겠습니까?',
  },

  // ── 한도/경고 ──────────────────────────────────────────────────────────
  warning: {
    capApproaching: '연간 한도 80% 임박',
    capReached: '연간 한도 도달 — 추가 정산 차단',
    pipelineFailed: '처리 흐름 실패 — 재시도 필요',
    qualityLow: '저품질 통화 — 수동 검수 권장',
    duplicateAttempt: '동일 매수자 중복 납품 시도',
  },

  uploadFailure: {
    actualUpload: '업로드 실패',
    connectionRefused: '처리 서버 접속 실패',
    pollTimeout: '처리 시간 초과',
    stuck: '처리 중단 (시간 초과)',
    zeroUtterances: '발화 미감지',
    generic: '처리 오류',
  },

  // ── 처리 흐름 실패 행 — 사유 + 다음 액션 안내 ───────────────────────────
  // "업로드 실패"는 진짜 원음 미도달일 때만(raw_audio_url 부재). 그 외 단계 실패는
  // 원음이 서버에 있으므로 서버 재처리로 해소 → "재처리 필요"로 안내.
  pipelineFailure: {
    reasonGeneric: '처리 오류',
    nextReprocess: '재처리 필요',
    nextReupload: '앱에서 재업로드 필요',
  },
} as const

// 유틸 함수 — 동적 키 접근 시 안전한 fallback
export function getStatusLabel(status: string | null | undefined): string {
  if (!status) return '-'
  const map = labels.status as Record<string, string>
  return map[status] ?? status
}

export function getReviewLabel(status: string | null | undefined): string {
  if (!status) return '-'
  const map = labels.review as Record<string, string>
  return map[status] ?? status
}

export function getConsentLabel(status: string | null | undefined): string {
  if (!status) return '-'
  const map = labels.consent as Record<string, string>
  return map[status] ?? status
}

export function getGradeLabel(grade: string | null | undefined): string {
  if (!grade) return '-'
  const map = labels.grade as Record<string, string>
  return map[grade] ?? grade
}

export function classifyUploadFailureLabel(
  errorMessage: string | null | undefined,
  rawAudioUrlPresent: boolean | undefined,
): string {
  if (rawAudioUrlPresent === false) return labels.uploadFailure.actualUpload
  if (!errorMessage) return labels.uploadFailure.generic
  const s = errorMessage.toLowerCase()
  if (s.includes('econnrefused') || s.includes('cannot connect') || s.includes('localhost:8001')) {
    return labels.uploadFailure.connectionRefused
  }
  if (s.includes('poll_job timeout') || s.includes('timeout after')) {
    return labels.uploadFailure.pollTimeout
  }
  if (s.includes('stuck')) return labels.uploadFailure.stuck
  if (s.includes('voice_api_0_utterances')) return labels.uploadFailure.zeroUtterances
  return labels.uploadFailure.generic
}

/** 처리 흐름 실패 행에 표시할 사유 + 재시도 + 다음 액션 정보 */
export interface PipelineFailureInfo {
  step: PipelineStep
  /** 실패한 단계 이름 (업로드 / 음성 인식 / ...) */
  stageLabel: string
  /** 사람이 읽는 실패 사유 */
  reasonLabel: string
  /** 업로드 단계 자동 재시도 횟수 (있을 때만, 예: "재시도 2/3회") */
  retryText: string | null
  /** 운영자 다음 액션 안내 (버튼 아님, 안내 텍스트) */
  nextAction: string
  /** gpu_last_error 원문 (업로드 단계만 의미 있음 — 툴팁용) */
  errorDetail: string | null
}

// 업로드 단계 자동 재시도 상한 (migration 059: 0→1→2→3, 3 도달 시 영구 실패)
const UPLOAD_MAX_RETRY = 3

/**
 * 처리 흐름 실패 세션의 표시 정보를 산출한다.
 *
 * 업로드 단계: classifyUploadFailureLabel 로 사유 세분화 + 재시도 횟수 표시.
 *   - 원음 미도달(raw_audio_url 부재) → "앱에서 재업로드 필요"
 *   - 원음 존재(처리 서버 접속/타임아웃 등) → "재처리 필요"
 * 그 외 단계: 원음은 이미 서버에 있으므로 "재처리 필요". gpu_last_error 는
 *   업로드 단계 전용이라 사유 상세로 쓰지 않는다(§CLAUDE.md migration 059).
 *
 * 실패 단계가 없으면 null.
 */
export function classifyPipelineFailureLabel(
  session: SessionPipeline,
): PipelineFailureInfo | null {
  const step = firstFailedStep(session)
  if (!step) return null

  const stageLabel = labels.pipeline[step]

  if (step === 'upload') {
    const reasonLabel = classifyUploadFailureLabel(
      session.upload_error_message,
      session.raw_audio_url_present,
    )
    const count = session.upload_retry_count
    const retryText =
      typeof count === 'number' && count > 0
        ? `재시도 ${Math.min(count, UPLOAD_MAX_RETRY)}/${UPLOAD_MAX_RETRY}회`
        : null
    const nextAction =
      session.raw_audio_url_present === false
        ? labels.pipelineFailure.nextReupload
        : labels.pipelineFailure.nextReprocess
    return {
      step,
      stageLabel,
      reasonLabel,
      retryText,
      nextAction,
      errorDetail: session.upload_error_message ?? null,
    }
  }

  return {
    step,
    stageLabel,
    reasonLabel: labels.pipelineFailure.reasonGeneric,
    retryText: null,
    nextAction: labels.pipelineFailure.nextReprocess,
    errorDetail: null,
  }
}

// 한도 도달률 → 경고 메시지 (0~1 스케일)
export function getCapacityWarning(ratio: number): string | null {
  if (ratio >= 1.0) return labels.warning.capReached
  if (ratio >= 0.8) return labels.warning.capApproaching
  return null
}
