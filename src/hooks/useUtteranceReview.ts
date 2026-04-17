import { useCallback, useMemo, useState } from 'react'
import { type ExportUtterance, type UtteranceLabels } from '../types/export'
import { loadExportUtterances } from '../lib/adminStore'
import { saveUtteranceLabelsBatchApi, patchUtteranceReviewStatusApi, patchUtteranceReviewStatusBatchApi } from '../lib/api/admin'

type UtterancesSetter = (utts: ExportUtterance[] | ((prev: ExportUtterance[]) => ExportUtterance[])) => void

interface UseUtteranceReviewOptions {
  jobId: string | null
  utterances: ExportUtterance[]
  setUtterances: UtterancesSetter
  labelSource?: 'admin'
}

export interface UseUtteranceReviewReturn {
  utterances: ExportUtterance[]
  piiEditId: string | null
  setPiiEditId: (id: string | null) => void
  selectedIds: Set<string>
  setSelectedIds: (ids: Set<string>) => void
  toggleReview: (utteranceId: string, isIncluded: boolean, reason?: string) => Promise<void>
  bulkReview: (items: Array<{ utteranceId: string; isIncluded: boolean; reason?: string }>) => Promise<void>
  autoFilter: (type: 'short' | 'gradeC' | 'highBeep') => Promise<void>
  updateLabels: (utteranceIds: string[], labels: Partial<UtteranceLabels>) => Promise<void>
  handlePiiMaskApplied: () => Promise<void>
  reviewedCount: number
  totalCount: number
}

export function useUtteranceReview({
  jobId,
  utterances,
  setUtterances,
  labelSource,
}: UseUtteranceReviewOptions): UseUtteranceReviewReturn {
  const [piiEditId, setPiiEditId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const totalCount = utterances.length
  const reviewedCount = useMemo(() => {
    return utterances.filter(u => u.reviewedAt != null).length
  }, [utterances])

  const toggleReview = useCallback(async (utteranceId: string, isIncluded: boolean, reason?: string) => {
    const now = new Date().toISOString()
    type Snapshot = { isIncluded: boolean; excludeReason: string | undefined; reviewedAt: string | undefined }
    const snapshotRef: { current: Snapshot | null } = { current: null }
    setUtterances(prev =>
      prev.map(u => {
        if (u.utteranceId !== utteranceId) return u
        snapshotRef.current = { isIncluded: u.isIncluded, excludeReason: u.excludeReason, reviewedAt: u.reviewedAt }
        return {
          ...u,
          isIncluded,
          excludeReason: isIncluded ? undefined : (reason ?? 'manual'),
          reviewedAt: now,
        }
      })
    )

    try {
      const res = await patchUtteranceReviewStatusApi(utteranceId, isIncluded, reason)
      if (res.error) throw new Error(res.error)
    } catch (err) {
      const prevSnap = snapshotRef.current
      if (prevSnap) {
        setUtterances(prev =>
          prev.map(u =>
            u.utteranceId === utteranceId
              ? { ...u, isIncluded: prevSnap.isIncluded, excludeReason: prevSnap.excludeReason, reviewedAt: prevSnap.reviewedAt }
              : u
          )
        )
      }
      alert(`검수 상태 저장 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [setUtterances])

  const bulkReview = useCallback(async (items: Array<{ utteranceId: string; isIncluded: boolean; reason?: string }>) => {
    if (items.length === 0) return
    const now = new Date().toISOString()

    // 1) 낙관적 업데이트 + 스냅샷 저장
    const snapshotMap = new Map<string, { isIncluded: boolean; excludeReason: string | undefined; reviewedAt: string | undefined }>()
    const itemMap = new Map(items.map(i => [i.utteranceId, i]))

    setUtterances(prev =>
      prev.map(u => {
        const item = itemMap.get(u.utteranceId)
        if (!item) return u
        snapshotMap.set(u.utteranceId, { isIncluded: u.isIncluded, excludeReason: u.excludeReason, reviewedAt: u.reviewedAt })
        return {
          ...u,
          isIncluded: item.isIncluded,
          excludeReason: item.isIncluded ? undefined : (item.reason ?? 'manual'),
          reviewedAt: now,
        }
      })
    )

    // 2) 벌크 API 1회 호출
    try {
      const res = await patchUtteranceReviewStatusBatchApi(
        items.map(i => ({ utteranceId: i.utteranceId, isIncluded: i.isIncluded, excludeReason: i.reason }))
      )

      // 3) 실패분 롤백
      const failures = res.data?.failures ?? []
      if (failures.length > 0) {
        setUtterances(prev =>
          prev.map(u => {
            const snap = snapshotMap.get(u.utteranceId)
            return snap && failures.includes(u.utteranceId)
              ? { ...u, isIncluded: snap.isIncluded, excludeReason: snap.excludeReason, reviewedAt: snap.reviewedAt }
              : u
          })
        )
        alert(`${failures.length}건 저장 실패 (롤백됨)`)
      }
    } catch {
      // 전체 실패 시 전부 롤백
      setUtterances(prev =>
        prev.map(u => {
          const snap = snapshotMap.get(u.utteranceId)
          return snap ? { ...u, isIncluded: snap.isIncluded, excludeReason: snap.excludeReason, reviewedAt: snap.reviewedAt } : u
        })
      )
      alert('벌크 저장 실패 (전체 롤백됨)')
    }
  }, [setUtterances])

  const autoFilter = useCallback(async (type: 'short' | 'gradeC' | 'highBeep') => {
    // 변경 대상 식별
    const items: Array<{ utteranceId: string; isIncluded: boolean; reason: string }> = []
    utterances.forEach(u => {
      if (!u.isIncluded) return
      const match =
        (type === 'short' && u.durationSec < 3) ||
        (type === 'gradeC' && u.qualityGrade === 'C') ||
        (type === 'highBeep' && u.beepMaskRatio >= 0.3)
      if (!match) return
      const reason = type === 'short' ? 'too_short' : type === 'gradeC' ? 'low_grade' : 'high_beep'
      items.push({ utteranceId: u.utteranceId, isIncluded: false, reason })
    })

    await bulkReview(items)
  }, [utterances, bulkReview])

  const updateLabels = useCallback(async (utteranceIds: string[], labels: Partial<UtteranceLabels>) => {
    if (utteranceIds.length === 0) return
    try {
      const payload = labelSource ? { ...labels, labelSource } : labels
      const res = await saveUtteranceLabelsBatchApi(utteranceIds, payload as Record<string, unknown>)
      if (res.error) {
        alert(`라벨 저장 실패: ${res.error}`)
        return
      }
      setUtterances(prev =>
        prev.map(u =>
          utteranceIds.includes(u.utteranceId)
            ? { ...u, labels: { ...u.labels, ...labels } }
            : u
        )
      )
    } catch (err) {
      alert(`라벨 저장 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [labelSource, setUtterances])

  const handlePiiMaskApplied = useCallback(async () => {
    const editedId = piiEditId
    setPiiEditId(null)
    if (!jobId || !editedId) return
    // 편집한 발화 1건만 서버 데이터로 갱신하고, 검수 상태(isIncluded/excludeReason/reviewedAt)는 로컬 값을 유지한다.
    try {
      const data = await loadExportUtterances(jobId)
      const updated = data.find(u => u.utteranceId === editedId)
      if (!updated) return
      setUtterances(prev =>
        prev.map(u =>
          u.utteranceId === editedId
            ? { ...updated, isIncluded: u.isIncluded, excludeReason: u.excludeReason, reviewedAt: u.reviewedAt }
            : u
        )
      )
    } catch {
      // 갱신 실패 시 기존 로컬 상태 유지 (PII 마스킹은 이미 적용됨)
    }
  }, [jobId, piiEditId, setUtterances])

  return {
    utterances,
    piiEditId,
    setPiiEditId,
    selectedIds,
    setSelectedIds,
    toggleReview,
    bulkReview,
    autoFilter,
    updateLabels,
    handlePiiMaskApplied,
    reviewedCount,
    totalCount,
  }
}
