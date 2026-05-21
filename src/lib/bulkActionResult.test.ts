import { describe, it, expect } from 'vitest'
import { summarizeBulkResults, type ApiResultLike } from './bulkActionResult'

const fulfilled = (v: ApiResultLike): PromiseSettledResult<ApiResultLike> => ({ status: 'fulfilled', value: v })
const rejected = (reason: unknown): PromiseSettledResult<ApiResultLike> => ({ status: 'rejected', reason })

describe('summarizeBulkResults', () => {
  it('counts only resolved values with data and no error as success', () => {
    const r = summarizeBulkResults([
      fulfilled({ data: { ok: true } }),
      fulfilled({ data: { ok: true } }),
    ])
    expect(r).toEqual({ succeeded: 2, failed: 0, firstError: null })
  })

  it('treats fulfilled-with-error as FAILURE (the apiFetch bug)', () => {
    // apiFetch resolves { error } on a 409 — must NOT be counted as success
    const r = summarizeBulkResults([
      fulfilled({ error: 'invalid transition: pending → in_review (pipeline not complete)' }),
    ])
    expect(r.succeeded).toBe(0)
    expect(r.failed).toBe(1)
    expect(r.firstError).toMatch(/pipeline not complete/)
  })

  it('treats rejected promises as failure and surfaces the reason', () => {
    const r = summarizeBulkResults([rejected(new Error('network down'))])
    expect(r.succeeded).toBe(0)
    expect(r.failed).toBe(1)
    expect(r.firstError).toBe('network down')
  })

  it('treats fulfilled-without-data as failure', () => {
    const r = summarizeBulkResults([fulfilled({})])
    expect(r).toEqual({ succeeded: 0, failed: 1, firstError: '알 수 없는 오류' })
  })

  it('counts a mixed batch correctly and reports the first error', () => {
    const r = summarizeBulkResults([
      fulfilled({ data: { ok: true } }),
      fulfilled({ error: 'boom' }),
      rejected(new Error('net')),
    ])
    expect(r.succeeded).toBe(1)
    expect(r.failed).toBe(2)
    expect(r.firstError).toBe('boom')
  })
})
