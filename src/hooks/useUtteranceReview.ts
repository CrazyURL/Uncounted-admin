import { useCallback, useState } from 'react'
import { type ExportUtterance, type UtteranceLabels } from '../types/export'
import { loadExportUtterances } from '../lib/adminStore'
import { saveUtteranceLabelsBatchApi } from '../lib/api/admin'

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
  toggleReview: (utteranceId: string, isIncluded: boolean, reason?: string) => void
  autoFilter: (type: 'short' | 'gradeC' | 'highBeep') => void
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

  const toggleReview = useCallback((utteranceId: string, isIncluded: boolean, reason?: string) => {
    setUtterances(prev =>
      prev.map(u =>
        u.utteranceId === utteranceId
          ? { ...u, isIncluded, excludeReason: isIncluded ? undefined : (reason ?? 'manual') }
          : u
      )
    )
  }, [setUtterances])

  const autoFilter = useCallback((type: 'short' | 'gradeC' | 'highBeep') => {
    setUtterances(prev =>
      prev.map(u => {
        if (!u.isIncluded) return u
        const match =
          (type === 'short' && u.durationSec < 3) ||
          (type === 'gradeC' && u.qualityGrade === 'C') ||
          (type === 'highBeep' && u.beepMaskRatio >= 0.3)
        if (!match) return u
        const reason = type === 'short' ? 'too_short' : type === 'gradeC' ? 'low_grade' : 'high_beep'
        return { ...u, isIncluded: false, excludeReason: reason }
      })
    )
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
