import { useCallback, useState } from 'react'
import { type ExportUtterance, type UtteranceLabels } from '../types/export'
import { loadExportUtterances } from '../lib/adminStore'
import { saveUtteranceLabelsBatchApi, patchUtteranceReviewStatusApi } from '../lib/api/admin'

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
  autoFilter: (type: 'short' | 'gradeC' | 'highBeep') => Promise<void>
  updateLabels: (utteranceIds: string[], labels: Partial<UtteranceLabels>) => Promise<void>
  handlePiiMaskApplied: () => Promise<void>
}

export function useUtteranceReview({
  jobId,
  utterances,
  setUtterances,
  labelSource,
}: UseUtteranceReviewOptions): UseUtteranceReviewReturn {
  const [piiEditId, setPiiEditId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleReview = useCallback(async (utteranceId: string, isIncluded: boolean, reason?: string) => {
    type Snapshot = { isIncluded: boolean; excludeReason: string | undefined }
    const snapshotRef: { current: Snapshot | null } = { current: null }
    setUtterances(prev =>
      prev.map(u => {
        if (u.utteranceId !== utteranceId) return u
        snapshotRef.current = { isIncluded: u.isIncluded, excludeReason: u.excludeReason }
        return { ...u, isIncluded, excludeReason: isIncluded ? undefined : (reason ?? 'manual') }
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
              ? { ...u, isIncluded: prevSnap.isIncluded, excludeReason: prevSnap.excludeReason }
              : u
          )
        )
      }
      alert(`검수 상태 저장 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [setUtterances])

  const autoFilter = useCallback(async (type: 'short' | 'gradeC' | 'highBeep') => {
    // 1) 변경 대상 식별 (낙관적 업데이트 전 prev로부터)
    const targets: Array<{ utteranceId: string; reason: string; prev: { isIncluded: boolean; excludeReason: string | undefined } }> = []
    setUtterances(prev => {
      return prev.map(u => {
        if (!u.isIncluded) return u
        const match =
          (type === 'short' && u.durationSec < 3) ||
          (type === 'gradeC' && u.qualityGrade === 'C') ||
          (type === 'highBeep' && u.beepMaskRatio >= 0.3)
        if (!match) return u
        const reason = type === 'short' ? 'too_short' : type === 'gradeC' ? 'low_grade' : 'high_beep'
        targets.push({ utteranceId: u.utteranceId, reason, prev: { isIncluded: u.isIncluded, excludeReason: u.excludeReason } })
        return { ...u, isIncluded: false, excludeReason: reason }
      })
    })

    if (targets.length === 0) return

    // 2) 병렬 PATCH 호출
    const failures: string[] = []
    await Promise.all(
      targets.map(async ({ utteranceId, reason }) => {
        try {
          const res = await patchUtteranceReviewStatusApi(utteranceId, false, reason)
          if (res.error) failures.push(utteranceId)
        } catch {
          failures.push(utteranceId)
        }
      }),
    )

    // 3) 실패분 롤백
    if (failures.length > 0) {
      const failureMap = new Map(
        targets.filter(t => failures.includes(t.utteranceId)).map(t => [t.utteranceId, t.prev]),
      )
      setUtterances(prev =>
        prev.map(u => {
          const snap = failureMap.get(u.utteranceId)
          return snap ? { ...u, isIncluded: snap.isIncluded, excludeReason: snap.excludeReason } : u
        }),
      )
      alert(`자동 필터 ${failures.length}건 저장 실패 (롤백됨)`)
    }
  }, [setUtterances])

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
    // 편집한 발화 1건만 서버 데이터로 갱신하고, 검수 상태(isIncluded/excludeReason)는 로컬 값을 유지한다.
    try {
      const data = await loadExportUtterances(jobId)
      const updated = data.find(u => u.utteranceId === editedId)
      if (!updated) return
      setUtterances(prev =>
        prev.map(u =>
          u.utteranceId === editedId
            ? { ...updated, isIncluded: u.isIncluded, excludeReason: u.excludeReason }
            : u
        )
      )
    } catch (err) {
      console.error('[useUtteranceReview] reload after mask failed:', err)
    }
  }, [jobId, piiEditId, setUtterances])

  return {
    utterances,
    piiEditId,
    setPiiEditId,
    selectedIds,
    setSelectedIds,
    toggleReview,
    autoFilter,
    updateLabels,
    handlePiiMaskApplied,
  }
}
