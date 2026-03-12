import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { type SkuId, type SkuRecipe } from '../../types/sku'
import { loadAllSessions, invalidateSessionCache } from '../../lib/sessionMapper'
import { computeSkuStudio, getNonMvpSkus, saveRecipe, resetRecipe } from '../../lib/skuStudio'
import { saveDataset } from '../../lib/datasetStore'
import { generateUUID } from '../../lib/uuid'
import { type DatasetFilterCriteria } from '../../types/dataset'
import SkuStudioCard from '../../components/domain/SkuStudioCard'
import SkuRecipeEditor from '../../components/domain/SkuRecipeEditor'

const DEFAULT_FILTERS: DatasetFilterCriteria = {
  domains: [],
  qualityGrades: [],
  labelStatus: 'all',
  publicStatus: 'all',
  piiCleanedOnly: false,
  hasAudioUrl: false,
  diarizationStatus: 'all',
  transcriptStatus: 'all',
  dateRange: null,
  uploadStatuses: [],
}

export default function AdminSkuStudioPage() {
  const navigate = useNavigate()
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRecipe, setEditingRecipe] = useState<SkuRecipe | null>(null)
  const [showNonMvp, setShowNonMvp] = useState(false)

  useEffect(() => {
    invalidateSessionCache()
    loadAllSessions({ skipUserFilter: true }).then(sessions => {
      setAllSessions(sessions)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminSkuStudio] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  const studioEntries = useMemo(() => computeSkuStudio(allSessions), [allSessions])
  const nonMvpSkus = useMemo(() => getNonMvpSkus(), [])

  const totalMatching = useMemo(
    () => {
      const uniqueIds = new Set<string>()
      for (const e of studioEntries) {
        for (const id of e.matchingSessionIds) uniqueIds.add(id)
      }
      return uniqueIds.size
    },
    [studioEntries],
  )

  function handleBuild(skuId: SkuId) {
    const entry = studioEntries.find(e => e.definition.id === skuId)
    if (!entry || entry.matchCount === 0) return

    const now = new Date().toISOString()
    const dataset = {
      id: generateUUID(),
      name: `${skuId}_${now.slice(0, 10)}_${entry.matchCount}건`,
      description: `${entry.definition.nameKo} 기준 자동 생성`,
      sessionIds: entry.matchingSessionIds,
      status: 'draft' as const,
      filters: DEFAULT_FILTERS,
      createdAt: now,
      updatedAt: now,
      exportedAt: null,
    }
    saveDataset(dataset)
    navigate(`/admin/datasets/${dataset.id}`)
  }

  function handleCustomize(skuId: SkuId) {
    const entry = studioEntries.find(e => e.definition.id === skuId)
    if (entry) setEditingRecipe({ ...entry.recipe })
  }

  function handleSaveRecipe(recipe: SkuRecipe) {
    saveRecipe(recipe)
    setEditingRecipe(null)
    // 강제 리렌더 (studioEntries 재계산)
    setAllSessions(prev => [...prev])
  }

  function handleResetRecipe() {
    if (!editingRecipe) return
    resetRecipe(editingRecipe.skuId)
    setEditingRecipe(null)
    setAllSessions(prev => [...prev])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <span className="material-symbols-outlined text-4xl mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          precision_manufacturing
        </span>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          세션이 없습니다
        </p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
          앱에서 세션을 업로드하면 SKU별 현황이 표시됩니다
        </p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4 space-y-4">
      {/* 상단 요약 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg p-2.5 text-center" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>총 세션</p>
          <p className="text-sm font-bold text-white mt-0.5">{allSessions.length.toLocaleString()}</p>
        </div>
        <div className="rounded-lg p-2.5 text-center" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>MVP SKU</p>
          <p className="text-sm font-bold text-white mt-0.5">{studioEntries.length}개</p>
        </div>
        <div className="rounded-lg p-2.5 text-center" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>총 매칭</p>
          <p className="text-sm font-bold text-white mt-0.5">{totalMatching.toLocaleString()}</p>
        </div>
      </div>

      {/* SKU 카드 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {studioEntries.map(entry => (
          <SkuStudioCard
            key={entry.definition.id}
            entry={entry}
            onBuild={handleBuild}
            onCustomize={handleCustomize}
          />
        ))}
      </div>

      {/* 보류 SKU */}
      {nonMvpSkus.length > 0 && (
        <div>
          <button
            onClick={() => setShowNonMvp(!showNonMvp)}
            className="flex items-center gap-1 text-xs"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <span className="material-symbols-outlined text-sm">
              {showNonMvp ? 'expand_less' : 'expand_more'}
            </span>
            보류 SKU ({nonMvpSkus.length})
          </button>

          {showNonMvp && (
            <div className="mt-2 space-y-2">
              {nonMvpSkus.map(sku => (
                <div
                  key={sku.id}
                  className="rounded-lg p-3 flex items-center justify-between"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}
                    >
                      {sku.id}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {sku.nameKo}
                    </span>
                  </div>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {sku.unavailableReason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 레시피 편집 모달 */}
      {editingRecipe && (
        <SkuRecipeEditor
          isOpen={true}
          recipe={editingRecipe}
          onSave={handleSaveRecipe}
          onReset={handleResetRecipe}
          onClose={() => setEditingRecipe(null)}
        />
      )}
    </motion.div>
  )
}
