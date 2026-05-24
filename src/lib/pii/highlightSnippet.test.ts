import { describe, it, expect } from 'vitest'
import { splitSnippetForHighlight } from './highlightSnippet'

// 모든 이름/문장은 가짜(테스트 픽스처)다.
describe('splitSnippetForHighlight', () => {
  it('문장 중간 후보 → before/mark/after 정확 분할', () => {
    const r = splitSnippetForHighlight('어제 김철수 과장님', 3, 6)
    expect(r).toEqual({ before: '어제 ', mark: '김철수', after: ' 과장님' })
  })

  it('문장 시작 후보 → before 빈 문자열', () => {
    const r = splitSnippetForHighlight('홍길동 안녕', 0, 3)
    expect(r).toEqual({ before: '', mark: '홍길동', after: ' 안녕' })
  })

  it('문장 끝 후보 → after 빈 문자열', () => {
    const r = splitSnippetForHighlight('담당자 이영희', 4, 7)
    expect(r).toEqual({ before: '담당자 ', mark: '이영희', after: '' })
  })

  it('재결합하면 원본 snippet 과 동일', () => {
    const s = '연락처는 이순신 님입니다'
    const r = splitSnippetForHighlight(s, 5, 8)!
    expect(r.before + r.mark + r.after).toBe(s)
  })

  it('snippet 이 null/empty 면 null', () => {
    expect(splitSnippetForHighlight(null, 0, 3)).toBeNull()
    expect(splitSnippetForHighlight(undefined, 0, 3)).toBeNull()
    expect(splitSnippetForHighlight('', 0, 3)).toBeNull()
  })

  it('offset 이 null 이면 하이라이트 없이 전체를 before 로', () => {
    expect(splitSnippetForHighlight('홍길동', null, null)).toEqual({ before: '홍길동', mark: '', after: '' })
    expect(splitSnippetForHighlight('홍길동', 0, null)).toEqual({ before: '홍길동', mark: '', after: '' })
  })

  it('offset 이 범위를 벗어나면 클램프', () => {
    const r = splitSnippetForHighlight('홍길동', 0, 99)
    expect(r).toEqual({ before: '', mark: '홍길동', after: '' })
    const r2 = splitSnippetForHighlight('홍길동', 99, 100)
    expect(r2).toEqual({ before: '홍길동', mark: '', after: '' })
  })
})
