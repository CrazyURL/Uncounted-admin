// PII 후보 스니펫 하이라이트 분할 (순수 함수).
//
// 서버가 준 최소 스니펫(snippet)과 그 안의 후보 구간(highlight_start/end)을 받아
// before / mark(후보) / after 세 조각으로 나눈다. 전체 transcript 를 다루지 않는다.
// 오프셋이 없거나 잘못되면 하이라이트 없이 전체를 before 로 반환(렌더는 평문).

export interface SnippetParts {
  before: string
  mark: string
  after: string
}

export function splitSnippetForHighlight(
  snippet: string | null | undefined,
  start: number | null | undefined,
  end: number | null | undefined,
): SnippetParts | null {
  if (!snippet) return null
  if (typeof start !== 'number' || typeof end !== 'number') {
    return { before: snippet, mark: '', after: '' }
  }
  const s = Math.max(0, Math.min(start, snippet.length))
  const e = Math.max(s, Math.min(end, snippet.length))
  return {
    before: snippet.slice(0, s),
    mark: snippet.slice(s, e),
    after: snippet.slice(e),
  }
}
