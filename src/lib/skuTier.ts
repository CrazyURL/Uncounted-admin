// ── SKU 티어 분화 ────────────────────────────────────────────────────────────
// Basic: auto 라벨 중심
// Verified: user_confirmed >= 50%
// Gold: user_confirmed >= 50% + quality A

import { type SkuId, type SkuTier, type QualityGrade } from '../types/sku'

export type SkuTierResult = {
  skuId: SkuId
  tier: SkuTier
  labelKo: string
  requirements: string[]
}

const TIER_LABEL_KO: Record<SkuTier, string> = {
  Basic: '기본',
  Verified: '검증됨',
  Gold: '골드',
}

// Voice SKU만 티어 적용
const VOICE_SKUS: Set<SkuId> = new Set(['U-A01', 'U-A02', 'U-A03'])

export function calcSkuTier(params: {
  skuId: SkuId
  userConfirmedRatio: number
  qualityGrade: QualityGrade
}): SkuTierResult {
  const { skuId, userConfirmedRatio, qualityGrade } = params

  // Metadata SKU는 항상 Basic
  if (!VOICE_SKUS.has(skuId)) {
    return {
      skuId,
      tier: 'Basic',
      labelKo: TIER_LABEL_KO.Basic,
      requirements: [],
    }
  }

  const hasConfirmed = userConfirmedRatio >= 0.50
  const hasQualityA = qualityGrade === 'A'

  if (hasConfirmed && hasQualityA) {
    return {
      skuId,
      tier: 'Gold',
      labelKo: TIER_LABEL_KO.Gold,
      requirements: [],
    }
  }

  if (hasConfirmed) {
    const requirements: string[] = []
    if (!hasQualityA) requirements.push('품질 등급 A 달성 시 Gold 승격')
    return {
      skuId,
      tier: 'Verified',
      labelKo: TIER_LABEL_KO.Verified,
      requirements,
    }
  }

  const requirements: string[] = []
  requirements.push(`라벨 확인율 50% 이상 필요 (현재 ${Math.round(userConfirmedRatio * 100)}%)`)
  return {
    skuId,
    tier: 'Basic',
    labelKo: TIER_LABEL_KO.Basic,
    requirements,
  }
}
