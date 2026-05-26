import { describe, it, expect } from 'vitest'
import {
  parseFiltersFromSearch,
  buildFiltersFromState,
  migrateLegacyFilter,
  buildFilterGroups,
  type FilterState,
} from './adminFilters'

const sp = (q: string) => new URLSearchParams(q)

describe('parseFiltersFromSearch', () => {
  it('빈 쿼리 → 전부 미설정', () => {
    expect(parseFiltersFromSearch(sp(''))).toEqual({ process: undefined, review: undefined, flags: [] })
  })

  it('process/review/flags 파싱', () => {
    expect(parseFiltersFromSearch(sp('process=done&review=pending&flags=pii,quality_c'))).toEqual({
      process: 'done',
      review: 'pending',
      flags: ['quality_c', 'pii'], // 정의 순서로 정규화
    })
  })

  it('알 수 없는 값은 버린다(방어적)', () => {
    expect(parseFiltersFromSearch(sp('process=bogus&review=nope&flags=pii,xxx'))).toEqual({
      process: undefined,
      review: undefined,
      flags: ['pii'],
    })
  })
})

describe('buildFiltersFromState — FilterState → API 필터(AND 조합)', () => {
  it('process=done → processStatus=done', () => {
    expect(buildFiltersFromState({ flags: [], process: 'done' }, 1).processStatus).toBe('done')
  })

  it('process=done + flags=[pii] → processStatus + piiFlag 동시(AND)', () => {
    const f = buildFiltersFromState({ process: 'done', flags: ['pii'] }, 1)
    expect(f.processStatus).toBe('done')
    expect(f.piiFlag).toBe(true)
  })

  it('review=pending + flags=[quality_c] → reviewStatus + qualityGradeMin', () => {
    const f = buildFiltersFromState({ review: 'pending', flags: ['quality_c'] }, 1)
    expect(f.reviewStatus).toBe('pending')
    expect(f.qualityGradeMin).toBe('C')
  })

  it('flags=[quality_c,pii] → qualityGradeMin + piiFlag (둘 다)', () => {
    const f = buildFiltersFromState({ flags: ['quality_c', 'pii'] }, 1)
    expect(f.qualityGradeMin).toBe('C')
    expect(f.piiFlag).toBe(true)
  })

  it('flags=[label_missing] → labelMissing=true', () => {
    expect(buildFiltersFromState({ flags: ['label_missing'] }, 1).labelMissing).toBe(true)
  })

  it('page/limit/search 보존', () => {
    const f = buildFiltersFromState({ flags: [] }, 3, 'abc')
    expect(f.page).toBe(3)
    expect(f.limit).toBe(20)
    expect(f.search).toBe('abc')
  })

  it('빈 상태 → 어떤 필터 필드도 설정 안 함(전체)', () => {
    const f = buildFiltersFromState({ flags: [] }, 1)
    expect(f.processStatus).toBeUndefined()
    expect(f.reviewStatus).toBeUndefined()
    expect(f.piiFlag).toBeUndefined()
    expect(f.qualityGradeMin).toBeUndefined()
    expect(f.labelMissing).toBeUndefined()
  })
})

describe('migrateLegacyFilter — ?filter= shim', () => {
  const migrateTo = (q: string): FilterState | null => {
    const next = migrateLegacyFilter(sp(q))
    return next ? parseFiltersFromSearch(next) : null
  }

  it('filter 없으면 null', () => {
    expect(migrateLegacyFilter(sp('page=2'))).toBeNull()
  })

  it.each([
    ['quality_c', { process: undefined, review: undefined, flags: ['quality_c'] }],
    ['pii_flag', { process: undefined, review: undefined, flags: ['pii'] }],
    ['label_skipped', { process: undefined, review: undefined, flags: ['label_missing'] }],
    ['failed', { process: 'failed', review: undefined, flags: [] }],
    ['pipeline_idle', { process: 'pending', review: undefined, flags: [] }],
    ['pipeline_running', { process: 'processing', review: undefined, flags: [] }],
    ['pipeline_waiting', { process: 'stopped', review: undefined, flags: [] }],
    ['pipeline_stuck', { process: 'stopped', review: undefined, flags: [] }],
    ['pending', { process: undefined, review: 'pending', flags: [] }],
    ['in_review', { process: undefined, review: 'in_review', flags: [] }],
    ['approved', { process: undefined, review: 'approved', flags: [] }],
    ['needs_revision', { process: undefined, review: 'needs_revision', flags: [] }],
    ['rejected', { process: undefined, review: 'rejected', flags: [] }],
  ] as const)('legacy ?filter=%s → 새 차원', (legacy, expected) => {
    expect(migrateTo(`filter=${legacy}`)).toEqual(expected)
  })

  it('filter=all → 전체(clear)', () => {
    expect(migrateTo('filter=all')).toEqual({ process: undefined, review: undefined, flags: [] })
  })

  it('변환 결과에서 filter 키 제거', () => {
    expect(migrateLegacyFilter(sp('filter=failed'))?.get('filter')).toBeNull()
  })

  it('q/page 등 다른 param 은 보존', () => {
    const next = migrateLegacyFilter(sp('filter=pii_flag&q=abc&page=2'))!
    expect(next.get('q')).toBe('abc')
    expect(next.get('page')).toBe('2')
    expect(next.get('flags')).toBe('pii')
  })

  it('이미 새 param 이 있으면 레거시 무시하고 filter 만 제거(중복변환 방지)', () => {
    const next = migrateLegacyFilter(sp('filter=failed&process=done'))!
    expect(next.get('process')).toBe('done') // 기존 새 param 유지
    expect(next.get('filter')).toBeNull()
  })
})

describe('buildFilterGroups', () => {
  const stats = {
    review: { pending: 10, in_review: 2, approved: 5, rejected: 1, needs_revision: 3 },
    alerts: { pipelineFailedCount: 7, piiSessionCount: 4 },
  } as unknown as Parameters<typeof buildFilterGroups>[0]

  it('처리현황(A) — 전체+5상태, 처리오류는 danger+count', () => {
    const g = buildFilterGroups(stats)
    expect(g.process.map((o) => o.id)).toEqual(['all', 'pending', 'processing', 'done', 'stopped', 'failed'])
    const failed = g.process.find((o) => o.id === 'failed')!
    expect(failed.danger).toBe(true)
    expect(failed.count).toBe(7)
  })

  it('검수현황(B) — count 는 stats.review 에서', () => {
    const g = buildFilterGroups(stats)
    expect(g.review.find((o) => o.id === 'approved')?.count).toBe(5)
    expect(g.review.find((o) => o.id === 'pending')?.label).toBe('검수 대기')
  })

  it('데이터 특이사항(C) — 3개 플래그, PII 만 count', () => {
    const g = buildFilterGroups(stats)
    expect(g.flags.map((o) => o.id)).toEqual(['quality_c', 'pii', 'label_missing'])
    expect(g.flags.find((o) => o.id === 'pii')?.count).toBe(4)
    expect(g.flags.find((o) => o.id === 'quality_c')?.count).toBeUndefined()
  })

  it('stats=null 이어도 그룹 구조 반환(count 미표기)', () => {
    const g = buildFilterGroups(null)
    expect(g.process).toHaveLength(6)
    expect(g.flags).toHaveLength(3)
    expect(g.process.find((o) => o.id === 'failed')?.count).toBe(0)
  })
})
