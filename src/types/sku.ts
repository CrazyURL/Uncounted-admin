export type SkuId =
  | 'U-A01' | 'U-A02' | 'U-A03'
  | 'U-M01' | 'U-M02' | 'U-M03' | 'U-M04' | 'U-M05'
  | 'U-M06' | 'U-M07' | 'U-M08' | 'U-M09' | 'U-M10' | 'U-M11' | 'U-M12'
  | 'U-M13' | 'U-M14' | 'U-M15' | 'U-M16' | 'U-M17'
  | 'U-M18' | 'U-M19' | 'U-M20' | 'U-M21' | 'U-M22' | 'U-M23'
  | 'U-P01'

export type UnitType = 'AUDIO_BU' | 'META_EVENT'

export type QualityGrade = 'A' | 'B' | 'C'

export type EligibilityStatus = 'eligible' | 'needs_work' | 'not_eligible'

export type SkuTier = 'Basic' | 'Verified' | 'Gold'

export type SkuEligibility = {
  skuId: SkuId
  status: EligibilityStatus
  eligibleCount: number
  totalCount: number
  eligiblePct: number
  reasons: string[]
}

export type PolicyRisk = 'Low' | 'Med' | 'High'

// 판매에 필요한 최소 동의 수준 (통신비밀보호법 준수)
// locked     = 메타데이터 SKU → 음성 무관, 즉시 판매 가능
// user_only  = 화자 분리 후 본인 음성만 → 본인 인증 필요
// both_agreed = 전체 음성 포함 → 상대방 동의 필요
export type RequiredConsentStatus = 'locked' | 'user_only' | 'both_agreed'

export type SkuDefinition = {
  id: SkuId
  nameKo: string
  descriptionKo: string
  category: 'voice' | 'metadata'
  requiredConsentStatus: RequiredConsentStatus  // 판매에 필요한 최소 동의 수준
  requiredPermissionsKo: string[]
  policyRisk: PolicyRisk
  unitType: UnitType       // AUDIO_BU: ₩/usable_hour, META_EVENT: ₩/event
  baseRateLow: number      // ₩/usable_hour (음성) 또는 ₩/event (메타)
  baseRateHigh: number     // ₩/usable_hour (음성) 또는 ₩/event (메타)
  labelMultiplierMax: number
  isAvailableMvp: boolean
  unavailableReason?: string  // 수집 불가 사유
  dropDecision?: 'drop' | 'hold' | 'hold_self_report' | 'v2'  // 의사결정 상태
  dropRationale?: string     // 의사결정 사유 (히스토리 관리용)
  policyNote?: string          // 정책 준수 명시 (컴플라이언스 문서 포함)
  // ── 카탈로그 부가 정보 ──
  buyersKo?: string[]          // 예상 구매자
  useCasesKo?: string[]        // 활용도
  contentsKo?: string[]        // 포함 정보 (데이터 구성)
  differentiatorKo?: string    // 차별점
}

// ── 프리미엄 번들 (P1/P2/P3) ─────────────────────────────────────────────────
// 여러 SKU 조합 + 사용자 라벨. "판별/추론값" 생성 금지.
// 특징량/버킷 + 유저 라벨로만 구성.

export type BundleId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7'

export type BundleDefinition = {
  id: BundleId
  nameKo: string
  descriptionKo: string
  componentSkus: SkuId[]
  requiresUserLabel: boolean
  policyRisk: PolicyRisk
  isAvailableMvp: boolean
  unavailableReason?: string
  baseRateLow: number    // ₩/unit (보수적)
  baseRateHigh: number   // ₩/unit (낙관적)
}

export const BUNDLE_CATALOG: BundleDefinition[] = [
  {
    id: 'P1',
    nameKo: '이동성 컨텍스트 팩',
    descriptionKo: '기기 버킷 특징량 + U-M05 + 사용자 환경 라벨',
    componentSkus: ['U-M05'],
    requiresUserLabel: true,
    policyRisk: 'Low',
    isAvailableMvp: true,
    baseRateLow: 8000,
    baseRateHigh: 20000,
  },
  {
    id: 'P2',
    nameKo: '이동 전환 팩',
    descriptionKo: 'U-M02 카테고리 시퀀스 + 전환 버킷 + 사용자 라벨',
    componentSkus: ['U-M02'],
    requiresUserLabel: true,
    policyRisk: 'Med',
    isAvailableMvp: false,
    unavailableReason: 'U-M02 특수 권한 필요 — v2 일정',
    baseRateLow: 10000,
    baseRateHigh: 30000,
  },
  {
    id: 'P3',
    nameKo: '생활 루틴 팩',
    descriptionKo: 'U-M05 기기/환경 + 생활 루틴 라벨 + 선택적 U-A02 조인',
    componentSkus: ['U-M05'],
    requiresUserLabel: true,
    policyRisk: 'Low',
    isAvailableMvp: true,
    baseRateLow: 12000,
    baseRateHigh: 35000,
  },
  {
    id: 'P4',
    nameKo: '디지털 웰빙 패키지',
    descriptionKo: '화면 세션 + 조도(수면) + 미디어 재생 통합 분석',
    componentSkus: ['U-M08', 'U-M13', 'U-M18'],
    requiresUserLabel: false,
    policyRisk: 'Low',
    isAvailableMvp: true,
    baseRateLow: 7000,
    baseRateHigh: 20000,
  },
  {
    id: 'P5',
    nameKo: '보험 리스크 평가 패키지',
    descriptionKo: '활동 상태 + 수면 패턴(조도) + 디바이스 모션 → 건강/운전 리스크',
    componentSkus: ['U-M11', 'U-M13', 'U-M14'],
    requiresUserLabel: false,
    policyRisk: 'Med',
    isAvailableMvp: false,
    unavailableReason: 'U-M11 Activity Recognition 권한 필요 — v2 일정',
    baseRateLow: 10000,
    baseRateHigh: 30000,
  },
  {
    id: 'P6',
    nameKo: '앱 마케팅 인텔리전스 패키지',
    descriptionKo: '앱 카테고리 시퀀스 + 설치/삭제 이벤트 + 알림 통계 → 앱 라이프사이클',
    componentSkus: ['U-M02', 'U-M16', 'U-M12'],
    requiresUserLabel: false,
    policyRisk: 'Med',
    isAvailableMvp: false,
    unavailableReason: 'U-M02/U-M12 특수 권한 필요 — v2 일정',
    baseRateLow: 15000,
    baseRateHigh: 40000,
  },
  {
    id: 'P7',
    nameKo: '음성 UX 완전판 패키지',
    descriptionKo: '익명화 음성 + 통화 메타 + 음성 환경 + 통화 패턴 → 원스톱 음성 솔루션',
    componentSkus: ['U-A01', 'U-M01', 'U-M06', 'U-M07'],
    requiresUserLabel: false,
    policyRisk: 'Low',
    isAvailableMvp: true,
    baseRateLow: 20000,
    baseRateHigh: 50000,
  },
]

// ── SKU Studio types ───────────────────────────────────────────────────────────

export type SkuRecipeFilters = {
  requireAudio: boolean
  requireLabels: boolean | string[]   // true=any, string[]=specific LabelFieldKeys
  requirePublicConsent: boolean
  minQualityGrade: 'A' | 'B' | 'C' | null
  requirePiiCleaned: boolean
  domainFilter: string[]
}

export type SkuRecipe = {
  skuId: SkuId
  filters: SkuRecipeFilters
  exportFields: string[]                        // keys from EXPORT_FIELD_CATALOG
  preferredFormat: 'json' | 'jsonl' | 'csv'
}

export type SkuStudioEntry = {
  definition: SkuDefinition
  matchingSessionIds: string[]
  matchCount: number
  totalHours: number
  labelCoverage: number             // 0~1
  qualityBreakdown: Record<'A' | 'B' | 'C', number>
  recipe: SkuRecipe
}

// ── SKU Catalog ────────────────────────────────────────────────────────────────

export const SKU_CATALOG: SkuDefinition[] = [
  {
    id: 'U-A01',
    nameKo: '익명화 음성 원천',
    descriptionKo: '비식별화 처리된 원시 음성 데이터 (내용 없음)',
    category: 'voice',
    requiredConsentStatus: 'user_only',
    requiredPermissionsKo: ['음성 파일 읽기'],
    policyRisk: 'Low',
    unitType: 'AUDIO_BU',
    baseRateLow: 15000,
    baseRateHigh: 40000,
    labelMultiplierMax: 1.0,
    isAvailableMvp: true,
    buyersKo: ['ASR/TTS 모델 학습 기업', 'AI 스타트업', '음성 인식 연구소'],
    useCasesKo: ['음성 인식(ASR) 모델 학습', 'TTS 합성 훈련', '음향 이벤트 탐지'],
    contentsKo: ['비식별화 처리된 원시 음성 파일', '샘플레이트/비트레이트/채널 메타', '품질 등급(A/B/C) + 유효발화 비율'],
    differentiatorKo: '실제 한국어 대화 음성 — 합성 데이터 대비 높은 정확도',
  },
  {
    id: 'U-A02',
    nameKo: '음성 + 상황 라벨',
    descriptionKo: '상황/활동/분위기/주제를 직접 태그한 음성 데이터',
    category: 'voice',
    requiredConsentStatus: 'user_only',
    requiredPermissionsKo: ['음성 파일 읽기', '사용자 라벨 입력'],
    policyRisk: 'Low',
    unitType: 'AUDIO_BU',
    baseRateLow: 20000,
    baseRateHigh: 60000,
    labelMultiplierMax: 1.30,
    isAvailableMvp: true,
    buyersKo: ['감정/상황 인식 AI', '대화 컨텍스트 분류', '음성 추천 시스템'],
    useCasesKo: ['감정/상황 인식 AI', '대화 컨텍스트 분류', '음성 기반 추천 시스템'],
    contentsKo: ['음성 파일 + 사용자 직접 태그', '상황/활동/분위기/주제 라벨', '라벨 신뢰도(Trust) 메타'],
    differentiatorKo: '사용자 직접 태그 — 크라우드소싱 대비 높은 신뢰도',
  },
  {
    id: 'U-A03',
    nameKo: '음성 + 대화행위 라벨',
    descriptionKo: '대화행위(진술/질문/요청 등) + 강도(1~3) 태그',
    category: 'voice',
    requiredConsentStatus: 'user_only',
    requiredPermissionsKo: ['음성 파일 읽기', '사용자 라벨 입력'],
    policyRisk: 'Low',
    unitType: 'AUDIO_BU',
    baseRateLow: 25000,
    baseRateHigh: 75000,
    labelMultiplierMax: 1.35,
    isAvailableMvp: true,
    buyersKo: ['콜센터 AI', '대화 시스템 기업', '화행 연구소'],
    useCasesKo: ['대화 시스템 의도 분류', '콜센터 자동 응대', '화행(dialog act) 연구'],
    contentsKo: ['음성 파일 + 대화행위 태그', '진술/질문/요청/감탄 분류', '강도(1~3) 라벨'],
    differentiatorKo: '대화행위+강도 조합 라벨 — 기존 데이터셋에 없는 세분화',
  },
  {
    id: 'U-M01',
    nameKo: '통화/통신 메타데이터',
    descriptionKo: '내용 없는 통화 이벤트 버킷 (건수/시간대/유형)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['통화 기록 읽기 (내용 제외)'],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 2,
    baseRateHigh: 6,
    labelMultiplierMax: 1.10,
    isAvailableMvp: true,
    buyersKo: ['통신사(SKT/KT/LGU+)', '마케팅 에이전시', 'CRM 솔루션 기업'],
    useCasesKo: ['통화 패턴 분석', '고객 이탈 예측', '통신 서비스 최적화'],
    contentsKo: ['통화 건수/시간대/유형 버킷', '내용 없는 이벤트 메타', '발신/수신/부재 구분'],
    differentiatorKo: '내용 없는 순수 메타데이터 — 프라이버시 리스크 최소',
  },
  {
    id: 'U-M02',
    nameKo: '앱 카테고리 시퀀스',
    descriptionKo: '앱명 저장 없이 카테고리 전환 패턴만 수집',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['앱 사용 통계 (특수 권한)'],
    policyRisk: 'Med',
    unitType: 'META_EVENT',
    baseRateLow: 3000,
    baseRateHigh: 10000,
    labelMultiplierMax: 1.10,
    isAvailableMvp: false,
    unavailableReason: 'PACKAGE_USAGE_STATS 특수 권한 — 설정>특별앱액세스 유도 필요, 전환율 치명적',
    dropDecision: 'hold',
    dropRationale: '[2025-02] Hold — 수요는 있으나 "특별 앱 액세스" 전환율이 낮고 온보딩에서 "감시앱?" 프레임 유발. M08(화면 세션)로 80% 커버 가능. 필요 시 기업 파일럿/사이드로드에서만 검증.',
    buyersKo: ['앱 마켓 분석 기업', '광고 플랫폼', '디지털 마케팅 에이전시'],
    useCasesKo: ['앱 카테고리 전환 패턴 분석', '사용자 관심사 세그멘테이션', '광고 타겟팅'],
    contentsKo: ['앱 카테고리(이름 제외) 시퀀스', '전환 빈도/시간 버킷', '일별 패턴 통계'],
    differentiatorKo: '앱명 없이 카테고리만 — 프라이버시 보호하면서 행동 패턴 제공',
  },
  {
    id: 'U-M03',
    nameKo: '입력 행동 프로필 (자기보고)',
    descriptionKo: '자동 수집 영구 차단 — 일일 자기보고(10초) + 기기 컨텍스트(M05/M09/M10) 교차 검증으로 대체. 음성 SKU(U-A03) 행동 프로필 컨텍스트 레이어로 활용.',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['사용자 자기보고 (자동 수집 불가)'],
    policyRisk: 'High',
    unitType: 'META_EVENT',
    baseRateLow: 1000,
    baseRateHigh: 5000,
    labelMultiplierMax: 1.0,
    isAvailableMvp: false,
    unavailableReason: 'AccessibilityService/IME 자동 수집 영구 차단 — Phase 2 자기보고 UI 개발 예정',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop(독립SKU) / Keep(흡수) — AccessibilityService/IME 자동수집은 Play Store 영구 차단. 구매자가 원하는 건 "행동 패턴"이지 "권한 기반 감시"가 아님. Self-Report+Trust로 U-A03 ctx.behaviorProfile에 흡수 완료.',
    policyNote: '본 서비스는 타 앱의 입력 이벤트, 화면 내용, 키 입력 텍스트를 수집하지 않습니다. AccessibilityService/IME 권한을 통한 자동 수집은 영구 차단됩니다.',
    buyersKo: ['키보드 앱 개발사', 'UX 연구소', '생산성 도구 기업'],
    useCasesKo: ['입력 UX 최적화', '텍스트 편집 패턴 연구', '자동완성 개선'],
    contentsKo: ['일일 자기보고 통계', '입력 빈도 버킷'],
    differentiatorKo: 'Self-Report + labelTrust 교차 검증 — 독립 상품이 아닌 음성 SKU 강화 레이어',
  },
  {
    id: 'U-M04',
    nameKo: '터치 행동 프로필 (자기보고)',
    descriptionKo: '자동 수집 영구 차단 — 일일 자기보고(10초) + 화면 세션(M08) 교차 검증으로 대체. 음성 SKU(U-A03) 행동 프로필 컨텍스트 레이어로 활용.',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['사용자 자기보고 (자동 수집 불가)'],
    policyRisk: 'High',
    unitType: 'META_EVENT',
    baseRateLow: 1000,
    baseRateHigh: 5000,
    labelMultiplierMax: 1.0,
    isAvailableMvp: false,
    unavailableReason: 'AccessibilityService 자동 수집 영구 차단 — Phase 2 자기보고 UI 개발 예정',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop(독립SKU) / Keep(흡수) — M03과 동일 사유. AccessibilityService 영구 차단. Self-Report+M08 교차 검증으로 U-A03에 흡수.',
    policyNote: '본 서비스는 타 앱의 화면 내용, 터치/제스처 원시 이벤트를 수집하지 않습니다. AccessibilityService 권한을 통한 자동 수집은 영구 차단됩니다.',
    buyersKo: ['UX 리서치 기업', '스마트폰 제조사', '모바일 앱 개발사'],
    useCasesKo: ['터치 UX 최적화', '제스처 인터페이스 설계', '사용성 테스트'],
    contentsKo: ['터치/제스처 집계 통계', '화면 내용 미포함'],
    differentiatorKo: 'Self-Report + 화면 세션(M08) 교차 검증 — 독립 상품이 아닌 음성 SKU 강화 레이어',
  },
  {
    id: 'U-M05',
    nameKo: '기기/환경 버킷',
    descriptionKo: '연결성/배터리/시간대 버킷 (정밀 위치 없음)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['네트워크 상태', '배터리 상태'],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 3,
    baseRateHigh: 10,
    labelMultiplierMax: 1.05,
    isAvailableMvp: true,
    buyersKo: ['IoT 기업', '통신사', '스마트홈 서비스'],
    useCasesKo: ['기기 환경별 서비스 최적화', '네트워크 계획', '배터리 사용 패턴 분석'],
    contentsKo: ['연결성(Wi-Fi/셀룰러) 버킷', '배터리 상태/충전 패턴', '시간대 버킷(2h/6h)'],
    differentiatorKo: '정밀 위치 없이 환경 컨텍스트 제공 — 프라이버시 안전',
  },
  {
    id: 'U-M06',
    nameKo: '음성 환경 프로필',
    descriptionKo: '기존 오디오에서 파생 — 실내/실외, 반향, 배경 소음 유형, SNR 버킷 (내용 무관)',
    category: 'metadata',
    requiredConsentStatus: 'user_only',
    requiredPermissionsKo: ['음성 파일 읽기 (파생 분석)'],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 1,
    baseRateHigh: 4,
    labelMultiplierMax: 1.10,
    isAvailableMvp: true,
    buyersKo: ['Bose/Sony/Apple 오디오 기기', 'Google/Samsung 음성 AI', '노이즈 캔슬링 개발사'],
    useCasesKo: ['노이즈 캔슬링 알고리즘 훈련', '음성 AI 환경 적응', '음향 이벤트 탐지'],
    contentsKo: ['실내/실외 환경 분류', '배경 소음 유형 버킷', 'SNR/반향 수준 통계'],
    differentiatorKo: '실제 환경 소음 데이터 — 합성 불가, 현장 수집만 가능',
  },
  {
    id: 'U-M07',
    nameKo: '통화 시간 패턴',
    descriptionKo: 'U-M01 재가공 — 요일/시간대별 통화 빈도 히트맵, 평균 길이 버킷',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['통화 기록 읽기 (내용 제외)'],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 1,
    baseRateHigh: 3,
    labelMultiplierMax: 1.05,
    isAvailableMvp: true,
    buyersKo: ['SKT/KT/LGU+ 통신사', '광고 에이전시', 'CRM 솔루션'],
    useCasesKo: ['통신 패턴 분석', '마케팅 타이밍 최적화', '고객 세그멘테이션'],
    contentsKo: ['요일/시간대별 통화 빈도 히트맵', '평균 통화 길이 버킷', '피크 시간대 분포'],
    differentiatorKo: 'U-M01 기반 재가공 — 시간대별 히트맵으로 즉시 활용 가능',
  },
  {
    id: 'U-M08',
    nameKo: '화면 세션 패턴',
    descriptionKo: '화면 On/Off 이벤트 → 세션 길이/빈도 시간대 버킷 (내용 없음)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 0.3,
    baseRateHigh: 1,
    labelMultiplierMax: 1.05,
    isAvailableMvp: true,
    buyersKo: ['Google/Apple 디지털 웰빙', '광고 플랫폼', 'UX 리서치 기업'],
    useCasesKo: ['디지털 웰빙 측정', '광고 노출 타이밍 최적화', 'UX 세션 분석'],
    contentsKo: ['화면 On/Off 세션 길이', '시간대별 사용 빈도', '일평균 세션 수'],
    differentiatorKo: '실제 사용 패턴 — 앱 내 분석으로는 불가능한 크로스앱 세션 데이터',
  },
  {
    id: 'U-M09',
    nameKo: '충전/배터리 사이클',
    descriptionKo: '충전 시작/종료 시간대 버킷, 충전 속도, 배터리 레벨 패턴',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 0.3,
    baseRateHigh: 1.5,
    labelMultiplierMax: 1.0,
    isAvailableMvp: true,
    buyersKo: ['삼성SDI/LG에너지솔루션', 'Anker/Belkin 충전기', '배터리 관리 앱'],
    useCasesKo: ['배터리 수명 예측 모델', '충전 UX 최적화', '배터리 열화 패턴 분석'],
    contentsKo: ['충전 시작/종료 시간대 버킷', '충전 속도 통계', '배터리 레벨 변화 패턴'],
    differentiatorKo: '실제 충전 행동 데이터 — 랩 테스트로 재현 불가',
  },
  {
    id: 'U-M10',
    nameKo: '네트워크 전환 이벤트',
    descriptionKo: 'WiFi/모바일/오프라인 전환 빈도, 네트워크 타입 시간대 분포 (SSID 저장 금지)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['네트워크 상태'],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 0.5,
    baseRateHigh: 2,
    labelMultiplierMax: 1.05,
    isAvailableMvp: true,
    buyersKo: ['통신사(SKT/KT/LGU+)', 'Cloudflare/Akamai CDN', '네트워크 최적화 기업'],
    useCasesKo: ['네트워크 전환 최적화', 'CDN 배치 계획', '모바일 QoS 개선'],
    contentsKo: ['WiFi/모바일/오프라인 전환 빈도', '네트워크 타입 시간대 분포', '전환 이벤트 통계'],
    differentiatorKo: 'SSID 없이 전환 패턴만 — 위치 추적 없는 네트워크 행동 데이터',
  },
  {
    id: 'U-M11',
    nameKo: '활동 상태 버킷',
    descriptionKo: 'Activity Recognition — 정지/도보/차량 등 활동 유형 시간대 분포 (위치 없음)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['활동 인식 (ACTIVITY_RECOGNITION)'],
    policyRisk: 'Med',
    unitType: 'META_EVENT',
    baseRateLow: 1,
    baseRateHigh: 3,
    labelMultiplierMax: 1.10,
    isAvailableMvp: true,
    dropDecision: 'v2',
    dropRationale: '[2025-02] Keep(v2 1순위) — ACTIVITY_RECOGNITION은 런타임 권한(일반 플로우). 전환율 높음. Transition API로 배터리 최적화 가능. M14(모션)과 교차 검증으로 이동 컨텍스트 정확도 상승. 광고/헬스/보험 수요 폭넓음.',
    buyersKo: ['삼성헬스/Fitbit 헬스케어', '보험사(삼성생명/교보)', '피트니스 앱'],
    useCasesKo: ['헬스케어 활동 분석', '보험 리스크 평가', '운동 패턴 추천'],
    contentsKo: ['정지/도보/차량 등 활동 유형 분포', '시간대별 활동 상태', '전환 횟수 통계'],
    differentiatorKo: '위치 없이 활동 패턴 — GPS 없이 라이프스타일 프로필 구축',
  },
  {
    id: 'U-M12',
    nameKo: '알림 카테고리 통계',
    descriptionKo: '앱명 없이 Play Store 카테고리 매핑 → 카테고리별 알림 건수/시간대',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['NotificationListenerService (특수 권한)'],
    policyRisk: 'Med',
    unitType: 'META_EVENT',
    baseRateLow: 3000,
    baseRateHigh: 8000,
    labelMultiplierMax: 1.10,
    isAvailableMvp: false,
    unavailableReason: 'NotificationListenerService 특수 권한 — 사용자 심리적 저항 극대, 온보딩 이탈 유발',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop(초기) — "알림 접근 허용"은 심리적 저항이 매우 큼. B2B 수요도 법무/윤리 프레임이 따라옴. 전환율 낮은 기능은 초기 제품에서 독(온보딩 복잡도 상승). 나중에 정말 필요하면 Hold로 전환.',
    buyersKo: ['Braze/Airship 푸시 플랫폼', '리서치 기관', '앱 마케팅 기업'],
    useCasesKo: ['알림 최적화', '앱 참여도 분석', '디지털 피로도 연구'],
    contentsKo: ['카테고리별 알림 건수', '시간대별 알림 분포', '카테고리 전환 패턴'],
    differentiatorKo: '앱명 없이 카테고리 매핑 — 크로스앱 알림 생태계 유일한 데이터',
  },
  // ── 센서 데이터 시리즈 ─────────────────────────────────────────────────────
  {
    id: 'U-M13',
    nameKo: '주변 조도 패턴',
    descriptionKo: '조도 센서 → 시간대별 밝기 버킷, 실내/실외 전환, 수면 패턴 추정',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 0.5,
    baseRateHigh: 2,
    labelMultiplierMax: 1.05,
    isAvailableMvp: true,
    buyersKo: ['디스플레이 제조사(삼성/LG)', '웨어러블/수면 앱', '보험사/광고 플랫폼'],
    useCasesKo: ['수면 패턴 추론', '디스플레이 밝기 최적화', '생활 리듬 분석'],
    contentsKo: ['시간대별 조도 버킷 (어두움/실내/밝음/직사광선)', '실내↔실외 전환 빈도', '수면 패턴 추정 (어두움 지속 시간)'],
    differentiatorKo: 'GPS/카메라 없이 수면 시간 추정 — 센서 기반 프라이버시 안전',
  },
  {
    id: 'U-M14',
    nameKo: '디바이스 모션 프로필',
    descriptionKo: '가속도계/자이로 → 움직임 강도 버킷, 흔들림 패턴, 화면 각도 (위치 없음)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 0.5,
    baseRateHigh: 2,
    labelMultiplierMax: 1.10,
    isAvailableMvp: true,
    buyersKo: ['피트니스 앱(Nike/Strava)', '게임회사', '보험사'],
    useCasesKo: ['운동 강도 검증', '모션 기반 게임 입력', '운전 패턴 분석'],
    contentsKo: ['시간대별 움직임 강도 버킷', '걷기/뛰기/차량 흔들림 패턴', '화면 각도 패턴 (세로/가로/책상)'],
    differentiatorKo: 'GPS 없이 활동량 추정 — 위치 비공개 상태에서 운동/이동 패턴',
  },
  {
    id: 'U-M15',
    nameKo: '근접 센서 이벤트',
    descriptionKo: '근접 센서 → 통화 중 귀 접촉 시간, 주머니/가방 감지 패턴',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 1500,
    baseRateHigh: 4000,
    labelMultiplierMax: 1.0,
    isAvailableMvp: false,
    unavailableReason: '니치 시장, ROI 낮음',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop — 구매자 풀이 너무 작고 핵심 내러티브(데이터 자산화/대중 참여)와 연결 약함. "있으면 재밌는" 수준이지 "돈 되는" 축이 아님.',
    buyersKo: ['스마트폰 제조사(삼성/LG)', '통신사', '통화 품질 연구소'],
    useCasesKo: ['통화 품질 UX 개선', '센서 캘리브레이션', '사용 환경 분류'],
    contentsKo: ['통화 중 귀 접촉 시간 비율', '주머니/가방 속 시간 추정', '근접 이벤트 통계'],
    differentiatorKo: '통화 중 디바이스 위치 패턴 — 핸즈프리/이어폰 사용률 데이터',
  },
  // ── 시스템 이벤트 시리즈 ────────────────────────────────────────────────────
  {
    id: 'U-M16',
    nameKo: '앱 설치/삭제 이벤트',
    descriptionKo: '앱명 없이 카테고리만 → 설치/삭제 빈도, 리텐션 기간 버킷',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 1,
    baseRateHigh: 4,
    labelMultiplierMax: 1.15,
    isAvailableMvp: true,
    buyersKo: ['AppsFlyer/Adjust 어트리뷰션', 'VC/투자사', '앱 퍼블리셔'],
    useCasesKo: ['앱 리텐션 분석', '카테고리별 이탈률', '시장 트렌드 예측'],
    contentsKo: ['카테고리별 설치/삭제 빈도', '설치 후 삭제까지 기간 버킷', '카테고리별 리텐션 패턴'],
    differentiatorKo: '삭제 데이터는 앱 애널리틱스도 수집 불가 — 독점 이탈 데이터',
  },
  {
    id: 'U-M17',
    nameKo: 'OS 업데이트 패턴',
    descriptionKo: 'OS 버전 분포, 업데이트 지연 시간, 기기 나이 추정',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 2000,
    baseRateHigh: 5000,
    labelMultiplierMax: 1.0,
    isAvailableMvp: false,
    unavailableReason: '차별화 불가, 대체 데이터 존재',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop — 너무 흔하고 차별화 어려움. Google/Apple/통신사 데이터로 대체 가능. AI 학습 데이터로도 매력 낮음.',
    buyersKo: ['Google Android 팀', '앱 개발사', '보안 회사'],
    useCasesKo: ['OS 채택률 분석', '하위 호환성 계획', '보안 패치 확산 속도'],
    contentsKo: ['OS 버전 분포', '업데이트 지연 시간', '기기 나이 추정'],
    differentiatorKo: '실사용자 업데이트 지연 패턴 — Google 내부 데이터 외 유일한 소스',
  },
  // ── 미디어 소비 시리즈 ──────────────────────────────────────────────────────
  {
    id: 'U-M18',
    nameKo: '미디어 재생 패턴',
    descriptionKo: 'MediaSession → 카테고리별 재생 시간, 재생 속도, 건너뛰기 빈도 (앱명 없음)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 0.5,
    baseRateHigh: 2,
    labelMultiplierMax: 1.10,
    isAvailableMvp: true,
    buyersKo: ['Spotify/Netflix/YouTube', '광고 플랫폼', '콘텐츠 추천 기업'],
    useCasesKo: ['스트리밍 소비 패턴', '광고 삽입 타이밍', '콘텐츠 추천 개선'],
    contentsKo: ['카테고리별 재생 시간 (음악/팟캐스트/동영상)', '재생 속도 패턴 (1.0x~2.0x)', '건너뛰기 빈도'],
    differentiatorKo: '재생 속도/건너뛰기 패턴 — 개별 앱에서 수집 불가능한 크로스 플랫폼 데이터',
  },
  {
    id: 'U-M19',
    nameKo: '볼륨 조절 패턴',
    descriptionKo: '시간대별 볼륨 레벨, 조절 빈도, 진동/무음 모드 비율',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 1500,
    baseRateHigh: 4000,
    labelMultiplierMax: 1.0,
    isAvailableMvp: false,
    unavailableReason: '니치, 맥락 없이 해석 불가',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop — 니치하고 라벨/맥락 없이 해석 어려움. "청력/의료"로 가면 민감해지고 일반 B2B는 안 삼.',
    buyersKo: ['이어폰 제조사(삼성/Sony)', '청력 보호 연구기관', '오디오 앱'],
    useCasesKo: ['볼륨 프로필 분석', '청력 보호 UX', '오디오 출력 최적화'],
    differentiatorKo: '시간대별 볼륨 패턴 — 청력 건강 연구에 필수적인 실사용 데이터',
  },
  // ── 접근성 & 설정 시리즈 ────────────────────────────────────────────────────
  {
    id: 'U-M20',
    nameKo: '접근성 설정 프로필',
    descriptionKo: '폰트 크기, 밝기 설정, TalkBack, 색상 반전/대비 설정 통계',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['일부 설정 읽기'],
    policyRisk: 'Med',
    unitType: 'META_EVENT',
    baseRateLow: 2000,
    baseRateHigh: 6000,
    labelMultiplierMax: 1.05,
    isAvailableMvp: false,
    unavailableReason: '자동 수집 Drop — Self-Report만 Hold',
    dropDecision: 'hold_self_report',
    dropRationale: '[2025-02] 자동수집 Drop / Self-Report Hold — 장애 관련 신호는 GDPR 등 민감정보 프레임. 자동 탐지는 리스크만 큼. "보조 기능 사용 여부" Self-Report 정도는 나중에 UX/개인화용으로 쓸 수 있음. ProfileSetupPage 문항 추가로 구현.',
    buyersKo: ['접근성 앱 개발사', '시니어 타겟 서비스', '디스플레이 제조사'],
    useCasesKo: ['접근성 니즈 분석', '시니어 시장 타겟팅', 'UI 자동 조정'],
    differentiatorKo: '실제 접근성 설정 채택률 — 장애/고령 사용자 니즈 직접 측정',
  },
  {
    id: 'U-M21',
    nameKo: '보안 설정 프로필',
    descriptionKo: '잠금 해제 방식, 자동 잠금 시간, 잠금 해제 빈도 통계',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 2000,
    baseRateHigh: 6000,
    labelMultiplierMax: 1.05,
    isAvailableMvp: false,
    unavailableReason: '자동 수집 Drop — Self-Report만 Hold',
    dropDecision: 'hold_self_report',
    dropRationale: '[2025-02] 자동수집 Drop / Self-Report Hold — 구매자는 사이버보험/보안 리서치로 매우 좁으나 팀 정체성(보안PM)과 스토리텔링에는 맞음. 예창패 "확장 가능성" 카드로 활용. 자동수집은 오해 유발. Self-Report(잠금 방식) 정도만 ProfileSetupPage 문항 추가.',
    buyersKo: ['보안 회사', '스마트폰 제조사', '보험사(사이버 보험)'],
    useCasesKo: ['보안 설정 채택률', '생체인증 UX 연구', '사이버 리스크 평가'],
    differentiatorKo: '잠금 해제 방식 분포 — 생체인증 전환률 실데이터',
  },
  // ── 입력 & 인터랙션 시리즈 ──────────────────────────────────────────────────
  {
    id: 'U-M22',
    nameKo: '키보드 입력 패턴',
    descriptionKo: '내용 없이 패턴만 → 타이핑 속도, 오타 수정 빈도, 자동완성 사용률, 언어 전환 빈도',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['AccessibilityService (특수 권한)'],
    policyRisk: 'Med',
    unitType: 'META_EVENT',
    baseRateLow: 4000,
    baseRateHigh: 12000,
    labelMultiplierMax: 1.15,
    isAvailableMvp: false,
    unavailableReason: 'AccessibilityService 영구 차단',
    dropDecision: 'drop',
    dropRationale: '[2025-02] Drop(독립SKU) — M03과 동일. AccessibilityService 영구 차단. 입력 패턴은 M03 Self-Report + BehaviorProfile로 흡수.',
    buyersKo: ['키보드 앱(삼성/Google)', '은행/금융사', '보안 회사'],
    useCasesKo: ['타이핑 UX 최적화', 'Behavioral Biometrics 본인 인증', '봇 탐지'],
    differentiatorKo: '타이핑 패턴 기반 본인 인증 — 비밀번호 없는 인증 시대의 핵심 데이터',
  },
  {
    id: 'U-M23',
    nameKo: '멀티태스킹 패턴',
    descriptionKo: '앱명 없이 전환 빈도, 백그라운드 앱 수, 스플릿 스크린 사용 통계',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: [],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 2000,
    baseRateHigh: 7000,
    labelMultiplierMax: 1.05,
    isAvailableMvp: false,
    unavailableReason: 'PACKAGE_USAGE_STATS 필요 — M02와 운명 공유',
    dropDecision: 'hold',
    dropRationale: '[2025-02] Hold(사실상 Drop) — M02가 죽으면 M23도 같이 죽음. "전환 빈도"는 M08에서 일부 추론 가능하고 그게 더 현실적.',
    buyersKo: ['스마트폰 제조사(삼성/Google)', 'RAM 최적화 앱', '생산성 앱'],
    useCasesKo: ['멀티태스킹 UX 연구', '메모리 관리 최적화', '앱 전환 패턴 분석'],
    differentiatorKo: '앱명 없이 전환 빈도/패턴 — 실사용 멀티태스킹 행동 데이터',
  },
  // ── Photo / Media Pattern SKUs ────────────────────────────────────────────
  {
    id: 'U-P01',
    nameKo: '촬영 행동 패턴',
    descriptionKo: '일별 촬영 수, 시간대 분포, 사진/영상/스크린샷 비율, 저장 증가 추이 (내용 열람 없음)',
    category: 'metadata',
    requiredConsentStatus: 'locked',
    requiredPermissionsKo: ['READ_MEDIA_IMAGES (Android 13+)', 'READ_EXTERNAL_STORAGE (Android 12-)'],
    policyRisk: 'Low',
    unitType: 'META_EVENT',
    baseRateLow: 1,
    baseRateHigh: 5,
    labelMultiplierMax: 1.0,
    isAvailableMvp: true,
    buyersKo: ['카메라 AI 기업', '디바이스 제조사', '클라우드 스토리지'],
    useCasesKo: ['촬영 모드 UX 최적화', '스토리지 관리 알고리즘', '사용 패턴 기반 추천'],
    contentsKo: ['시간대별 촬영 빈도', '사진/영상/스크린샷 비율', '연속촬영 패턴', '저장 증가 추이'],
    differentiatorKo: '파일 메타데이터만 수집 — 이미지 내용/위치/파일명 저장 금지',
  },
]

// ── SKU Component Catalog (부가옵션) ──────────────────────────────────────────

import { type SkuComponent } from './admin'

export const SKU_COMPONENT_CATALOG: SkuComponent[] = [
  {
    id: 'BASIC',
    nameKo: '기본',
    descriptionKo: '필터 없음. 기본 구성.',
    filterCriteria: {},
    isEnabledMvp: true,
    sortOrder: 0,
  },
  {
    id: 'VERIFIED',
    nameKo: '검증됨',
    descriptionKo: '사용자 직접 확인(user_confirmed) 라벨 포함 유닛만',
    filterCriteria: {
      labelSource: ['user_confirmed', 'multi_confirmed'],
    },
    isEnabledMvp: true,
    sortOrder: 1,
  },
  {
    id: 'GOLD',
    nameKo: '골드',
    descriptionKo: 'A등급 품질 + 사용자 확인 라벨',
    filterCriteria: {
      minQualityGrade: 'A',
      labelSource: ['user_confirmed', 'multi_confirmed'],
    },
    isEnabledMvp: true,
    sortOrder: 2,
  },
  {
    id: 'ASR',
    nameKo: '음성인식',
    descriptionKo: 'ASR 전사 포함 (준비 중)',
    filterCriteria: {},
    isEnabledMvp: false,
    sortOrder: 3,
  },
  {
    id: 'DIAR',
    nameKo: '화자분리',
    descriptionKo: '화자 분리 포함 (준비 중)',
    filterCriteria: {},
    isEnabledMvp: false,
    sortOrder: 4,
  },
  {
    id: 'EMO',
    nameKo: '감정',
    descriptionKo: '감정 태그 포함 (준비 중)',
    filterCriteria: {},
    isEnabledMvp: false,
    sortOrder: 5,
  },
  {
    id: 'PII_CLEANED',
    nameKo: 'PII 정제',
    descriptionKo: '비식별화 완료 유닛만',
    filterCriteria: {
      requirePiiCleaned: true,
    },
    isEnabledMvp: false,
    sortOrder: 6,
  },
  {
    id: 'TIMESTAMPED',
    nameKo: '타임스탬프',
    descriptionKo: '정밀 시간 메타데이터 포함',
    filterCriteria: {},
    isEnabledMvp: false,
    sortOrder: 7,
  },
]
