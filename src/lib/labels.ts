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
    pending: '대기 중',
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
    quality: '품질 검증',
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
    delivered: '납품 처리되었습니다',
    refreshed: '데이터를 새로 불러왔습니다',
    copied: '클립보드에 복사되었습니다',
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

// 한도 도달률 → 경고 메시지 (0~1 스케일)
export function getCapacityWarning(ratio: number): string | null {
  if (ratio >= 1.0) return labels.warning.capReached
  if (ratio >= 0.8) return labels.warning.capApproaching
  return null
}
