import { describe, it, expect } from 'vitest'
import { buildFilters, buildChips, type FilterId } from './adminFilters'

// 칩 id → 필터 파라미터에 특정 필드가 설정되어야 함 (default fallthrough 금지)
const PIPELINE_STATES: Array<{ chipId: FilterId; pipelineState: string }> = [
  { chipId: 'pipeline_idle',    pipelineState: 'idle' },
  { chipId: 'pipeline_waiting', pipelineState: 'waiting' },
  { chipId: 'pipeline_running', pipelineState: 'running' },
  { chipId: 'pipeline_stuck',   pipelineState: 'stuck' },
]

describe('buildChips', () => {
  it('includes pipeline_waiting chip', () => {
    const ids = buildChips(null).map((c) => c.id)
    expect(ids).toContain('pipeline_waiting')
  })

  it('pipeline_waiting chip label is 처리 중단', () => {
    const chip = buildChips(null).find((c) => c.id === 'pipeline_waiting')
    expect(chip).toBeDefined()
    expect(chip?.label).toBe('처리 중단')
  })

  it('includes pipeline_stuck chip', () => {
    const ids = buildChips(null).map((c) => c.id)
    expect(ids).toContain('pipeline_stuck')
  })

  it('pipeline_stuck chip label is 처리 병목', () => {
    const chip = buildChips(null).find((c) => c.id === 'pipeline_stuck')
    expect(chip).toBeDefined()
    expect(chip?.label).toBe('처리 병목')
  })

  it('pipeline_stuck chip is warn', () => {
    const chip = buildChips(null).find((c) => c.id === 'pipeline_stuck')
    expect(chip?.warn).toBe(true)
  })

  it('every non-all chip id maps to a specific filter (no default fallthrough)', () => {
    for (const chip of buildChips(null)) {
      if (chip.id === 'all') continue
      const filters = buildFilters(chip.id as FilterId, 1)
      const hasSpecific =
        filters.reviewStatus !== undefined ||
        filters.pipelineFailed !== undefined ||
        filters.piiFlag !== undefined ||
        filters.qualityGradeMin !== undefined ||
        filters.pipelineState !== undefined
      expect(hasSpecific, `chip '${chip.id}' falls through to default — no filter field set`).toBe(true)
    }
  })
})

describe('buildFilters — pipeline_waiting', () => {
  it('returns pipelineState waiting', () => {
    expect(buildFilters('pipeline_waiting', 1).pipelineState).toBe('waiting')
  })

  it('preserves page and limit', () => {
    const f = buildFilters('pipeline_waiting', 3)
    expect(f.page).toBe(3)
    expect(f.limit).toBe(20)
  })

  it('includes search when provided', () => {
    const f = buildFilters('pipeline_waiting', 1, 'test')
    expect(f.search).toBe('test')
  })
})

describe('buildFilters — pipeline_stuck', () => {
  it('returns pipelineState stuck', () => {
    expect(buildFilters('pipeline_stuck', 1).pipelineState).toBe('stuck')
  })
})

describe('buildFilters — pipeline state regressions', () => {
  it.each(PIPELINE_STATES)('$chipId → pipelineState $pipelineState', ({ chipId, pipelineState }) => {
    expect(buildFilters(chipId, 1).pipelineState).toBe(pipelineState)
  })
})
