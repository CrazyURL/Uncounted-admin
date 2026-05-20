// 일괄 작업 결과 집계 헬퍼.
//
// apiFetch 는 API 에러(409/400/500)에도 throw 하지 않고 { error } 로 resolve 한다.
// 따라서 Promise.allSettled 의 status==='fulfilled' 만으로 성공을 세면
// API 가 거부한 호출까지 "성공"으로 오집계된다. 실제 성공은 value.data 존재 + error 부재로 판정해야 한다.

export interface ApiResultLike {
  data?: unknown
  error?: string
}

export interface BulkActionSummary {
  succeeded: number
  failed: number
  firstError: string | null
}

export function summarizeBulkResults(
  results: PromiseSettledResult<ApiResultLike>[],
): BulkActionSummary {
  let succeeded = 0
  let failed = 0
  let firstError: string | null = null

  for (const r of results) {
    const ok = r.status === 'fulfilled' && r.value?.data != null && !r.value?.error
    if (ok) {
      succeeded += 1
      continue
    }
    failed += 1
    if (firstError === null) {
      if (r.status === 'rejected') {
        firstError = r.reason instanceof Error ? r.reason.message : String(r.reason)
      } else {
        firstError = r.value?.error ?? '알 수 없는 오류'
      }
    }
  }

  return { succeeded, failed, firstError }
}
