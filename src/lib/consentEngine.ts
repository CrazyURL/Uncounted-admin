// ── consentEngine — 동의 상태 기반 판매 가능 여부 판정 ─────────────────────────
// 통신비밀보호법 + PIPA(개인정보보호법) 이중 준수
// 1) 세션 consentStatus: 통신비밀보호법 (상대방 동의)
// 2) PIPA consent: 수집 동의(15조) + 제3자 제공 동의(17조) 분리

import { type Session, type ConsentStatus } from '../types/session'
import { SKU_CATALOG, type SkuId, type RequiredConsentStatus } from '../types/sku'
import { loadPipaConsent, canSellUnderPipa } from '../types/consent'

// ── 동의 수준 비교 (locked < user_only < both_agreed) ─────────────────────────
const CONSENT_LEVEL: Record<ConsentStatus, number> = {
  locked: 0,
  user_only: 1,
  both_agreed: 2,
}

/** 세션의 동의 수준이 요구 수준 이상인지 확인 */
export function meetsConsentLevel(
  sessionConsent: ConsentStatus | undefined,
  required: RequiredConsentStatus,
): boolean {
  const actual = sessionConsent ?? 'locked'
  return CONSENT_LEVEL[actual] >= CONSENT_LEVEL[required]
}

// ── 세션별 SKU 판매 가능 판정 ────────────────────────────────────────────────
export type SkuSellability = 'sellable' | 'consent_needed' | 'pipa_needed' | 'unavailable'

export type SkuSellCheck = {
  skuId: SkuId
  status: SkuSellability
  reason: string   // 한국어 사유
}

/** 특정 세션에서 특정 SKU 판매 가능 여부 */
export function canSellSku(session: Session, skuId: SkuId): SkuSellCheck {
  const sku = SKU_CATALOG.find((s) => s.id === skuId)
  if (!sku) {
    return { skuId, status: 'unavailable', reason: '알 수 없는 SKU' }
  }

  // MVP 미지원 SKU
  if (!sku.isAvailableMvp) {
    return { skuId, status: 'unavailable', reason: sku.unavailableReason ?? '현재 수집 불가' }
  }

  // PIPA 동의 확인 (수집 + 제3자 제공 둘 다 필요)
  const pipa = loadPipaConsent()
  if (!canSellUnderPipa(pipa)) {
    return { skuId, status: 'pipa_needed', reason: '개인정보 수집·제3자 제공 동의가 필요합니다' }
  }

  // 통신비밀보호법 동의 수준 확인
  if (!meetsConsentLevel(session.consentStatus, sku.requiredConsentStatus)) {
    const reasonMap: Record<RequiredConsentStatus, string> = {
      locked: '',
      user_only: '본인 목소리 인증이 필요합니다',
      both_agreed: '상대방 동의가 필요합니다',
    }
    return { skuId, status: 'consent_needed', reason: reasonMap[sku.requiredConsentStatus] }
  }

  return { skuId, status: 'sellable', reason: '' }
}

/** 세션의 모든 SKU에 대한 판매 가능 여부 일괄 판정 */
export function checkAllSkus(session: Session): SkuSellCheck[] {
  return SKU_CATALOG.map((sku) => canSellSku(session, sku.id))
}

/** 세션에서 즉시 판매 가능한 SKU 목록 */
export function getSellableSkus(session: Session): SkuId[] {
  return checkAllSkus(session)
    .filter((c) => c.status === 'sellable')
    .map((c) => c.skuId)
}

/** 세션에서 동의만 받으면 판매 가능한 SKU 목록 */
export function getConsentNeededSkus(session: Session): SkuSellCheck[] {
  return checkAllSkus(session).filter((c) => c.status === 'consent_needed')
}

// ── 세션 목록 집계 ───────────────────────────────────────────────────────────

export type ConsentSummary = {
  locked: number
  userOnly: number
  bothAgreed: number
  total: number
}

/** 세션 목록의 동의 상태 집계 */
export function summarizeConsent(sessions: Session[]): ConsentSummary {
  const summary: ConsentSummary = { locked: 0, userOnly: 0, bothAgreed: 0, total: sessions.length }
  for (const s of sessions) {
    const status = s.consentStatus ?? 'locked'
    if (status === 'locked') summary.locked++
    else if (status === 'user_only') summary.userOnly++
    else summary.bothAgreed++
  }
  return summary
}

/** 한국어 동의 상태 라벨 */
export function consentStatusLabel(status: ConsentStatus | undefined): string {
  switch (status ?? 'locked') {
    case 'locked': return '메타데이터만'
    case 'user_only': return '본인 음성'
    case 'both_agreed': return '전체 공개'
  }
}

/** 동의 상태 아이콘 (Material Symbols) */
export function consentStatusIcon(status: ConsentStatus | undefined): string {
  switch (status ?? 'locked') {
    case 'locked': return 'lock'
    case 'user_only': return 'person'
    case 'both_agreed': return 'group'
  }
}
