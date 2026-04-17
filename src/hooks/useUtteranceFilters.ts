import { useMemo, useState } from 'react'
import { type ExportUtterance, type FilterMode, type SortField, type SortOrder } from '../types/export'

interface UseUtteranceFiltersOptions {
  utterances: ExportUtterance[]
  initialSnapshotMap: Map<string, { isIncluded: boolean; excludeReason: string | undefined }>
}

export function useUtteranceFilters({
  utterances,
  initialSnapshotMap,
}: UseUtteranceFiltersOptions) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortField, setSortField] = useState<SortField>('chunk')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const filteredUtterances = useMemo(() => {
    let result = [...utterances]

    // 1. Filter
    if (filterMode === 'included') {
      result = result.filter(u => u.isIncluded)
    } else if (filterMode === 'excluded') {
      result = result.filter(u => !u.isIncluded)
    } else if (filterMode === 'unreviewed') {
      result = result.filter(u => {
        const initial = initialSnapshotMap.get(u.utteranceId)
        if (!initial) return true
        // 초기 상태와 현재 상태가 동일하면 미검토로 간주 (단, 자동필터 제외 사유가 있으면 검토된 것으로 봄)
        const isDefaultExcluded = initial.excludeReason && initial.excludeReason !== 'manual'
        return u.isIncluded === initial.isIncluded && !isDefaultExcluded
      })
    } else if (filterMode === 'pii_needed') {
      result = result.filter(u => (u.piiIntervals?.length ?? 0) > 0 && !u.piiMasked)
    } else if (filterMode === 'no_labels') {
      result = result.filter(u => !u.labels || Object.keys(u.labels).length === 0)
    }

    // 2. Sort
    result.sort((a, b) => {
      let comparison = 0
      if (sortField === 'duration') {
        comparison = a.durationSec - b.durationSec
      } else if (sortField === 'snr') {
        comparison = a.snrDb - b.snrDb
      } else if (sortField === 'beep') {
        comparison = a.beepMaskRatio - b.beepMaskRatio
      } else if (sortField === 'grade') {
        comparison = a.qualityGrade.localeCompare(b.qualityGrade)
      } else if (sortField === 'chunk') {
        const aVal = (a.chunkIndex ?? 0) * 1000 + (a.sequenceInChunk ?? 0)
        const bVal = (b.chunkIndex ?? 0) * 1000 + (b.sequenceInChunk ?? 0)
        comparison = aVal - bVal
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [utterances, filterMode, sortField, sortOrder, initialSnapshotMap])

  const counts = useMemo(() => {
    const stats = {
      all: utterances.length,
      included: 0,
      excluded: 0,
      unreviewed: 0,
      pii_needed: 0,
      no_labels: 0,
    }

    utterances.forEach(u => {
      if (u.isIncluded) stats.included++
      else stats.excluded++

      if ((u.piiIntervals?.length ?? 0) > 0 && !u.piiMasked) stats.pii_needed++
      if (!u.labels || Object.keys(u.labels).length === 0) stats.no_labels++

      const initial = initialSnapshotMap.get(u.utteranceId)
      const isDefaultExcluded = initial?.excludeReason && initial.excludeReason !== 'manual'
      if (initial && u.isIncluded === initial.isIncluded && !isDefaultExcluded) {
        stats.unreviewed++
      }
    })

    return stats
  }, [utterances, initialSnapshotMap])

  return {
    filterMode,
    setFilterMode,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    filteredUtterances,
    counts,
  }
}
