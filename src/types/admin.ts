import { type SkuId } from './sku'

// ── Quality Tier (audioMetrics 유무 + 라벨 검증 수준) ────────────────────────

export type QualityTier = 'basic' | 'verified' | 'gold'

// ── Device Context Snapshot (BU 생성 시점의 기기 상태) ───────────────────────
// U-A01 + device_context (M05+M09+M10) at billable_unit granularity

export type DeviceContextSnapshot = {
  networkType: 'wifi' | 'cellular' | 'offline'   // M10 현재 네트워크
  batteryLevel: 'high' | 'medium' | 'low' | null // M09 배터리 레벨
  isCharging: boolean | null                       // M09 충전 상태
  screenActive: boolean | null                     // M08 화면 켜짐 여부
  capturedAt: string                               // ISO date-only (YYYY-MM-DD)
}

// ── Billable Unit (유효 1분 = 정산 단위) ─────────────────────────────────────

export type BillableUnit = {
  id: string                    // session_id + '_' + minuteIndex  또는  acc_userId_ts_idx
  sessionId: string             // 단일 세션 BU: 원본 sessionId / 누적 BU: 마지막 기여 세션
  minuteIndex: number           // 0-based
  effectiveSeconds: number      // 이 구간의 유효 초 (최대 60)
  qualityGrade: 'A' | 'B' | 'C'
  qaScore: number
  qualityTier: QualityTier      // basic=audioMetrics없음, verified=user_confirmed, gold=A+confirmed
  labelSource: 'auto' | 'user' | 'user_confirmed' | 'multi_confirmed' | null
  hasLabels: boolean
  consentStatus: 'PUBLIC_CONSENTED' | 'PRIVATE'
  piiStatus: 'CLEAR' | 'SUSPECT' | 'LOCKED' | 'REVIEWED'
  lockStatus: 'available' | 'locked_for_job' | 'delivered'
  lockedByJobId: string | null
  sessionDate: string           // YYYY-MM-DD (denormalized)
  userId: string | null
  sourceSessionIds?: string[]   // 누적 BU인 경우 기여 세션 목록 (단일 세션 BU는 undefined)
  deviceContext?: DeviceContextSnapshot  // BU 생성 시점 기기 컨텍스트 (U-A01 context_layer)
}

// ── Pending Balance (누적 정산 이월 잔액) ──────────────────────────────────

export type PendingBalance = {
  userId: string
  pendingSeconds: number        // 60초 미만 이월 유효 초
  weightedQaSum: number         // Σ(유효초 × qaScore) — 가중평균 산정용
  sourceSessionIds: string[]    // 이월분에 기여한 세션 ID 목록
  lastUpdated: string
}

export type BillableUnitStats = {
  total: number
  available: number
  locked: number
  delivered: number
  byGrade: Record<'A' | 'B' | 'C', number>
  byTier: Record<QualityTier, number>
  byConsent: { consented: number; private: number }
}

// ── Client (납품처) ──────────────────────────────────────────────────────────

export type Client = {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ── Delivery Profile (납품 프로필) ───────────────────────────────────────────

export type DeliveryFormat = 'json' | 'jsonl' | 'csv' | 'audio_manifest' | 'wav_bundle'

export type DeliveryProfile = {
  id: string
  clientId: string
  name: string
  format: DeliveryFormat
  fieldset: string[]            // export field keys
  channelKo: string             // '직접 전달' | 'API' | '클라우드 공유'
  requiresPiiCleaned: boolean
  requiresConsentVerified: boolean
  minQualityGrade: 'A' | 'B' | 'C' | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

// ── Client-SKU Rule (고객별 허용 SKU + 옵션) ─────────────────────────────────

export type ClientSkuRule = {
  id: string
  clientId: string
  skuId: SkuId
  presetId: string | null       // 프리셋 참조 (라벨/필터/출력 설정 결정)
  componentIds: string[]        // SkuComponentId[]
  maxUnitsPerMonth: number | null
  pricePerUnit: number | null   // ₩/billable_unit (기본 단가)
  discountPct: number           // 할인율 0~100 (납품처별)
  isActive: boolean
  createdAt: string
}

// ── SKU Component (부가옵션) ─────────────────────────────────────────────────

export type SkuComponentId =
  | 'BASIC' | 'VERIFIED' | 'GOLD'
  | 'ASR' | 'DIAR' | 'EMO'
  | 'PII_CLEANED' | 'TIMESTAMPED'

export type SkuComponentFilter = {
  minQualityGrade?: 'A' | 'B' | 'C'
  labelSource?: ('user_confirmed' | 'multi_confirmed')[]
  requirePiiCleaned?: boolean
  requireConsent?: boolean
  requireAudioMetrics?: boolean
}

export type SkuComponent = {
  id: SkuComponentId
  nameKo: string
  descriptionKo: string
  filterCriteria: SkuComponentFilter
  isEnabledMvp: boolean
  sortOrder: number
}

// ── SKU Preset (커스텀 SKU 구성) ──────────────────────────────────────────────

export type LabelRequirement = false | true | string[]  // false=불필요, true=아무 라벨, string[]=특정 필드 키

// 라벨 필드별 허용 값 (빈 배열 = 전체 허용)
// e.g. { relationship: ["동료","고객"], domain: ["비즈니스","기술"] }
export type LabelValueFilter = Record<string, string[]>

export type SkuPreset = {
  id: string
  name: string                    // e.g. "음성+라벨 골드팩"
  baseSkuId: SkuId
  componentIds: SkuComponentId[]
  // ── 소스 필터 (SkuRecipeFilters 호환) ──
  requireAudio: boolean
  requireLabels: LabelRequirement // false=불필요, true=아무거나, string[]=특정 필드
  labelValueFilter: LabelValueFilter  // 필드별 허용 값 (빈 객체 = 필터 없음)
  requireConsent: boolean
  requirePiiCleaned: boolean
  minQualityGrade: 'A' | 'B' | 'C' | null
  domainFilter: string[]          // 빈 배열 = 전체
  // ── 출력 설정 ──
  exportFields: string[]          // EXPORT_FIELD_CATALOG 키
  preferredFormat: 'json' | 'jsonl' | 'csv'
  // ── 가격/메타 ──
  suggestedPricePerUnit: number | null  // ₩/unit 참고 단가
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ── Export Job ────────────────────────────────────────────────────────────────

// ── Delivery Record (Per-client 납품 이력) ────────────────────────────────────

export type DeliveryRecord = {
  id: string
  buId: string
  clientId: string
  exportJobId: string
  deliveredAt: string
}

export type ExportJobStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'running'
  | 'reviewing'
  | 'packaging'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'delivered'

export type SamplingStrategy = 'all' | 'random' | 'quality_first' | 'stratified'

export type ExportJobLog = {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export type ExportJobFilters = {
  minQualityGrade: 'A' | 'B' | 'C' | null
  qualityTier: QualityTier[] | null
  labelSource: string[] | null
  requireConsent: boolean
  requirePiiCleaned: boolean
  dateRange: { from: string; to: string } | null
  userIds: string[]
}

export type ExportJob = {
  id: string
  clientId: string | null       // null = 내부 사용
  skuId: SkuId
  componentIds: SkuComponentId[]
  deliveryProfileId: string | null
  requestedUnits: number
  actualUnits: number
  samplingStrategy: SamplingStrategy
  filters: ExportJobFilters
  status: ExportJobStatus
  selectionManifest: string[] | null  // v1: 선택된 unit ID 배열
  outputFormat: DeliveryFormat
  logs: ExportJobLog[]
  errorMessage: string | null
  packagingStage: string | null
  reviewSyncStatus: 'idle' | 'syncing' | 'done' | 'failed' | null
  reviewSyncError: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}
