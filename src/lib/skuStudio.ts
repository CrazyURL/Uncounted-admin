import { type Session } from '../types/session'
import { type SkuId, type SkuRecipe, type SkuStudioEntry, SKU_CATALOG } from '../types/sku'
import { qualityGradeFromScore, isSessionPublic } from './adminHelpers'
import { SKU_FIELD_PRESETS } from './exportFields'

const RECIPE_STORAGE_KEY = 'uncounted_admin_sku_recipes'

// ── 기본 레시피 ─────────────────────────────────────────────────────────────────

export function getDefaultRecipe(skuId: SkuId): SkuRecipe {
  const preset = SKU_FIELD_PRESETS[skuId]
  const exportFields = preset ?? ['id', 'date', 'duration']

  switch (skuId) {
    case 'U-A01':
      return {
        skuId,
        filters: {
          requireAudio: true,
          requireLabels: false,
          requirePublicConsent: false,
          minQualityGrade: null,
          requirePiiCleaned: false,
          domainFilter: [],
        },
        exportFields,
        preferredFormat: 'jsonl',
      }
    case 'U-A02':
      return {
        skuId,
        filters: {
          requireAudio: true,
          requireLabels: true,
          requirePublicConsent: false,
          minQualityGrade: null,
          requirePiiCleaned: false,
          domainFilter: [],
        },
        exportFields,
        preferredFormat: 'jsonl',
      }
    case 'U-A03':
      return {
        skuId,
        filters: {
          requireAudio: true,
          requireLabels: ['tone'],
          requirePublicConsent: false,
          minQualityGrade: null,
          requirePiiCleaned: false,
          domainFilter: [],
        },
        exportFields,
        preferredFormat: 'jsonl',
      }
    case 'U-M01':
      return {
        skuId,
        filters: {
          requireAudio: false,
          requireLabels: false,
          requirePublicConsent: false,
          minQualityGrade: null,
          requirePiiCleaned: false,
          domainFilter: [],
        },
        exportFields,
        preferredFormat: 'csv',
      }
    default:
      return {
        skuId,
        filters: {
          requireAudio: false,
          requireLabels: false,
          requirePublicConsent: false,
          minQualityGrade: null,
          requirePiiCleaned: false,
          domainFilter: [],
        },
        exportFields,
        preferredFormat: 'csv',
      }
  }
}

// ── 레시피 필터 적용 ────────────────────────────────────────────────────────────

export function applyRecipeFilters(sessions: Session[], recipe: SkuRecipe): Session[] {
  return sessions.filter(s => {
    if (recipe.filters.requireAudio) {
      if (!(s.callRecordId || s.audioUrl || s.localSanitizedWavPath)) return false
    }

    if (recipe.filters.requireLabels === true) {
      if (!s.labels) return false
    } else if (Array.isArray(recipe.filters.requireLabels)) {
      for (const fieldKey of recipe.filters.requireLabels) {
        const val = s.labels?.[fieldKey as keyof typeof s.labels]
        if (val == null) return false
      }
    }

    if (recipe.filters.requirePublicConsent && !isSessionPublic(s)) return false

    if (recipe.filters.minQualityGrade) {
      const gradeOrder = { A: 3, B: 2, C: 1 } as const
      const sessionGrade = qualityGradeFromScore(s.qaScore ?? 0)
      if (gradeOrder[sessionGrade] < gradeOrder[recipe.filters.minQualityGrade]) return false
    }

    if (recipe.filters.requirePiiCleaned && !s.isPiiCleaned) return false

    if (recipe.filters.domainFilter.length > 0) {
      if (!s.labels?.domain || !recipe.filters.domainFilter.includes(s.labels.domain)) return false
    }

    return true
  })
}

// ── 레시피 → API 필터 변환 ──────────────────────────────────────────────────────

export interface RecipeApiFilters {
  labelStatus?: 'labeled' | 'unlabeled'
  qualityGrades?: string[]
  piiCleanedOnly?: boolean
  domains?: string[]
}

/**
 * SKU 레시피의 필터 조건을 /api/admin/sessions 쿼리 파라미터로 변환한다.
 * requireLabels가 true 또는 배열이면 labelStatus=labeled 를 전달하여
 * 서버에서 labels IS NOT NULL 조건으로 필터링한다.
 *
 * 주의: requireAudio는 클라이언트에서 callRecordId|audioUrl|localSanitizedWavPath
 * 3개 필드를 확인하므로 API hasAudioUrl로 매핑하지 않는다.
 */
export function recipeToApiFilters(recipe: SkuRecipe): RecipeApiFilters {
  const filters: RecipeApiFilters = {}

  if (recipe.filters.requireLabels === true || Array.isArray(recipe.filters.requireLabels)) {
    filters.labelStatus = 'labeled'
  }

  if (recipe.filters.requirePiiCleaned) {
    filters.piiCleanedOnly = true
  }

  if (recipe.filters.domainFilter.length > 0) {
    filters.domains = recipe.filters.domainFilter
  }

  if (recipe.filters.minQualityGrade) {
    const gradeOrder = ['C', 'B', 'A'] as const
    const minIdx = gradeOrder.indexOf(recipe.filters.minQualityGrade)
    filters.qualityGrades = gradeOrder.slice(minIdx)
  }

  return filters
}

// ── SKU Studio 대시보드 계산 ────────────────────────────────────────────────────

export function computeSkuStudio(sessions: Session[]): SkuStudioEntry[] {
  const recipes = loadRecipes()

  return SKU_CATALOG.filter(def => def.isAvailableMvp).map(def => {
    const recipe = recipes[def.id] ?? getDefaultRecipe(def.id)
    const matching = applyRecipeFilters(sessions, recipe)

    const qualityBreakdown: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 }
    for (const s of matching) {
      qualityBreakdown[qualityGradeFromScore(s.qaScore ?? 0)]++
    }

    const labeledCount = matching.filter(s => s.labels !== null).length

    return {
      definition: def,
      matchingSessionIds: matching.map(s => s.id),
      matchCount: matching.length,
      totalHours: matching.reduce((sum, s) => sum + s.duration, 0) / 3600,
      labelCoverage: matching.length > 0 ? labeledCount / matching.length : 0,
      qualityBreakdown,
      recipe,
    }
  })
}

/** 비MVP SKU 목록 (보류 SKU 표시용) */
export function getNonMvpSkus() {
  return SKU_CATALOG.filter(def => !def.isAvailableMvp)
}

// ── localStorage CRUD ───────────────────────────────────────────────────────────

export function loadRecipes(): Partial<Record<SkuId, SkuRecipe>> {
  try {
    const raw = localStorage.getItem(RECIPE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveRecipe(recipe: SkuRecipe): void {
  const all = loadRecipes()
  all[recipe.skuId] = recipe
  localStorage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(all))
}

export function resetRecipe(skuId: SkuId): void {
  const all = loadRecipes()
  delete all[skuId]
  localStorage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(all))
}
