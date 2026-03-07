// ── 라벨 옵션 단일 소스 (수동 + 자동 공용) ──────────────────────────────
// 모든 페이지(LabelingPage, ContactCallsPage, AssetsPage)와
// 자동 라벨링(ruleEngine, batchProcessor)이 이 파일을 참조.
// 자동 라벨링이 생성하는 값은 반드시 이 목록에 포함되어야 함.

export const RELATIONSHIP_OPTIONS = [
  '동료', '상사', '고객', '거래처', '가족', '친구',
  '이웃', '금융', '공공', '병원', '기타',
] as const

export const DOMAIN_OPTIONS = [
  '비즈니스', '기술', '교육', '일상', '의료', '법률', '금융', '기타',
] as const

export const PURPOSE_OPTIONS = [
  '보고', '협의', '교육', '영업', '인터뷰', '일상',
] as const

export const TONE_OPTIONS = [
  '공식적', '캐주얼', '긴박', '차분', '열정적',
] as const

export const NOISE_OPTIONS = [
  '없음', '약함', '중간', '심함',
] as const

// ── 자동 라벨 영어 키 → 한국어 매핑 ────────────────────────────────────
// 값은 반드시 위 옵션 목록에 있는 것만 사용

export const REL_EN_TO_KO: Record<string, string> = {
  FAMILY: '가족',
  WORK: '동료',
  CLIENT: '고객',
  FRIEND: '친구',
  UNKNOWN: '기타',
}

export const DOMAIN_EN_TO_KO: Record<string, string> = {
  BIZ: '비즈니스',
  SALES: '비즈니스',
  EDU: '교육',
  DAILY: '일상',
  TECH: '기술',
  MEDICAL: '의료',
  LEGAL: '법률',
  FINANCE: '금융',
  ETC: '기타',
}

// ── 한국어 관계 → 영어 RelationshipKey ─────────────────────────────────
// scoreRelationship에서 사용자 설정 관계 보너스 매칭용

export const REL_KO_TO_EN: Record<string, string> = {
  '가족': 'FAMILY',
  '동료': 'WORK',
  '상사': 'WORK',
  '고객': 'CLIENT',
  '거래처': 'CLIENT',
  '파트너': 'CLIENT',
  '친구': 'FRIEND',
  '이웃': 'FRIEND',
  '금융': 'CLIENT',
  '공공': 'CLIENT',
  '병원': 'CLIENT',
  '기타': 'UNKNOWN',
}

// ── 한국어 관계 → 도메인 힌트 (관계-도메인 상관관계) ────────────────────
// 가족→일상, 병원→의료, 금융→금융 등 강한 상관관계만 지정
// 동료/상사는 BIZ/TECH 양쪽 가능하므로 힌트 미지정 (cross-boost로 처리)

export const REL_KO_TO_DOMAIN_HINT: Record<string, string> = {
  '가족': 'DAILY',
  '친구': 'DAILY',
  '이웃': 'DAILY',
  '병원': 'MEDICAL',
  '금융': 'FINANCE',
  '고객': 'SALES',
  '거래처': 'SALES',
  '파트너': 'SALES',
}

// ── A03 대화행위 옵션 ─────────────────────────────────────────────────

export const SPEECH_ACT_OPTIONS = [
  '진술', '질문', '요청', '감사', '사과', '거절', '동의',
  '확인', '제안', '경고', '지시', '칭찬', '불만', '설명', '인사',
] as const

export const INTERACTION_MODE_OPTIONS = [
  { key: 'qa' as const, label: '질의응답' },
  { key: 'explanatory' as const, label: '설명형' },
  { key: 'negotiation' as const, label: '협상/논의형' },
  { key: 'casual' as const, label: '일상/캐주얼' },
] as const

// ── 정규화 (영어 키 또는 이전 한국어 매핑 → 현재 표준) ────────────────

const NORMALIZE_MAP: Record<string, string> = {
  // 영어 관계 키
  FAMILY: '가족', WORK: '동료', CLIENT: '고객', FRIEND: '친구', UNKNOWN: '기타',
  // 영어 도메인 키
  BIZ: '비즈니스', SALES: '비즈니스', EDU: '교육', DAILY: '일상', ETC: '기타',
  TECH: '기술', MEDICAL: '의료', LEGAL: '법률', FINANCE: '금융',
  // 이전 매핑 호환
  '직장': '동료', '미분류': '기타',
  // 파트너 → 거래처 마이그레이션
  '파트너': '거래처',
  // ── 구 LabelBottomSheet 값 → 현재 표준 ──
  // relationship
  '모르는 사람': '기타',
  // purpose
  '일상대화': '일상', '업무 협의': '협의', '정보 교환': '협의',
  '감정 지원': '일상', '문제 해결': '협의',
  // domain
  '쇼핑': '비즈니스', '여행': '일상', '게임': '기타',
  // tone
  '격식': '공식적', '비격식': '캐주얼', '긴장': '긴박', '친근': '캐주얼', '중립': '차분',
  // noise
  '조용함': '없음', '약간 소음': '약함', '소음 많음': '심함', '이동 중': '중간',
}

/** 라벨 값이 영어 키이거나 이전 매핑이면 현재 표준 한국어로 정규화 */
export function normalizeLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return NORMALIZE_MAP[value] ?? value
}
