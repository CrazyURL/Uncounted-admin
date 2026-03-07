// ── Consent Types — 일괄 데이터 공개 동의 ─────────────────────────────────────
// 법적/윤리적 민감 모듈. 변경 시 consent_version 업데이트 필수.

// ── 동의 버전 ─────────────────────────────────────────────────────────────────
export type ConsentVersion = string  // 형식: 'v1-YYYY-MM'
export const CURRENT_CONSENT_VERSION: ConsentVersion = 'v1-2026-02'

// ── 글로벌 공개 동의 범위 ────────────────────────────────────────────────────
export type GlobalShareScope = 'enabled_skus_only' | 'all_skus'

// ── 사용자 설정 ───────────────────────────────────────────────────────────────
export type UserSettings = {
  globalShareConsentEnabled: boolean           // 일괄 공개 동의 ON/OFF
  globalShareConsentScope: GlobalShareScope    // 적용 범위 (기본: enabled_skus_only)
  globalShareConsentUpdatedAt: string          // day bucket 'YYYY-MM-DD'
  consentVersion: ConsentVersion | null        // 동의한 버전 (미동의 시 null)
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  globalShareConsentEnabled: false,
  globalShareConsentScope: 'enabled_skus_only',
  globalShareConsentUpdatedAt: '',
  consentVersion: null,
}

// ── 레코드 공개 상태 ──────────────────────────────────────────────────────────
export type VisibilityStatus = 'PUBLIC_CONSENTED' | 'PRIVATE'

// ── 공개 상태 변경 출처 ───────────────────────────────────────────────────────
// GLOBAL_DEFAULT: 글로벌 토글에 의해 자동 설정
// MANUAL:         사용자가 개별 레코드에서 직접 변경 → 글로벌 토글 변경 시 유지
// SKU_DEFAULT:    SKU 미참여 또는 글로벌 OFF로 인한 기본 비공개
export type VisibilitySource = 'GLOBAL_DEFAULT' | 'MANUAL' | 'SKU_DEFAULT'

// ── 일괄 적용 결과 ────────────────────────────────────────────────────────────
export type BatchApplyResult = {
  updated: number   // 실제 변경된 레코드 수
  skipped: number   // MANUAL 또는 SKU 미참여로 건너뜀
  failed: number    // Supabase 업데이트 실패
}

// ── PIPA (개인정보보호법) 동의 ──────────────────────────────────────────────
// 제15조 수집·이용 동의와 제17조 제3자 제공 동의는 반드시 분리
export type PipaConsentRecord = {
  // 수집·이용 동의 (제15조)
  collectConsentAt: string | null       // ISO 날짜. null = 미동의
  collectPurpose: string                // 수집 목적 (고지 사항)
  // 제3자 제공 동의 (제17조) — 수집 동의와 별도
  thirdPartyConsentAt: string | null    // ISO 날짜. null = 미동의
  thirdPartyRecipients: string          // 제공받는 자 (고지 사항)
  thirdPartyPurpose: string             // 제공 목적
  retentionPeriod: string               // 보유·이용 기간
  // 철회
  withdrawnAt: string | null            // 철회 날짜. null = 유효
  withdrawalNotifiedAt: string | null   // 이미 납품된 데이터 통지 날짜
}

export const PIPA_CONSENT_DEFAULTS: PipaConsentRecord = {
  collectConsentAt: null,
  collectPurpose: '음성 파일 및 통화 메타데이터의 비식별화 처리 및 품질 분석',
  thirdPartyConsentAt: null,
  thirdPartyRecipients: 'AI 학습 데이터를 필요로 하는 기업 및 연구 기관',
  thirdPartyPurpose: 'AI 모델 학습용 데이터셋으로 제3자에 제공',
  retentionPeriod: '동의 철회 시까지 (최대 3년)',
  withdrawnAt: null,
  withdrawalNotifiedAt: null,
}

// PIPA 동의 localStorage 키
export const PIPA_CONSENT_KEY = 'uncounted_pipa_consent'

export function loadPipaConsent(): PipaConsentRecord {
  try {
    const raw = localStorage.getItem(PIPA_CONSENT_KEY)
    return raw ? { ...PIPA_CONSENT_DEFAULTS, ...JSON.parse(raw) } : { ...PIPA_CONSENT_DEFAULTS }
  } catch {
    return { ...PIPA_CONSENT_DEFAULTS }
  }
}

export function savePipaConsent(record: PipaConsentRecord): void {
  localStorage.setItem(PIPA_CONSENT_KEY, JSON.stringify(record))
}

/** 수집 동의 완료 여부 */
export function hasCollectConsent(r: PipaConsentRecord): boolean {
  return r.collectConsentAt !== null && r.withdrawnAt === null
}

/** 제3자 제공 동의 완료 여부 */
export function hasThirdPartyConsent(r: PipaConsentRecord): boolean {
  return r.thirdPartyConsentAt !== null && r.withdrawnAt === null
}

/** 판매 가능 여부 (수집+제3자 제공 둘 다 동의 필요) */
export function canSellUnderPipa(r: PipaConsentRecord): boolean {
  return hasCollectConsent(r) && hasThirdPartyConsent(r)
}

// ── 공개 준비 배치 ──────────────────────────────────────────────────────────
export type ShareBatchStatus = 'RUNNING' | 'DONE' | 'FAILED'

export type ShareBatch = {
  id: string
  targetScope: 'PRIVATE' | 'GROUP' | 'PUBLIC'
  status: ShareBatchStatus
  totalSessions: number
  eligibleSessions: number
  lockedSessions: number
  startedAt: string
  completedAt: string | null
  userId?: string | null
}
