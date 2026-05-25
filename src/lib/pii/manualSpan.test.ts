import { describe, it, expect } from 'vitest'
import { extractSpanFromRange, PII_TYPE_OPTIONS, type SpanOffsets } from './manualSpan'

const TEXT_NODE = 3
const ELEMENT_NODE = 1

// 단일 텍스트 노드를 가진 container 모형.
function makeContainer(text: string) {
  const textNode = { nodeType: TEXT_NODE, textContent: text } as unknown as ChildNode
  const container = {
    childNodes: [textNode] as unknown as NodeListOf<ChildNode>,
    firstChild: textNode,
  } as unknown as Element
  return { container, textNode }
}

function makeRange(
  startContainer: unknown,
  startOffset: number,
  endContainer: unknown,
  endOffset: number,
) {
  return { startContainer, startOffset, endContainer, endOffset } as unknown as Range
}

describe('extractSpanFromRange', () => {
  it('returns Range start/end offsets when selection is fully inside the single text node', () => {
    const { container, textNode } = makeContainer('안녕하세요 문식환 소장님')
    const range = makeRange(textNode, 6, textNode, 9) // 문식환
    expect(extractSpanFromRange(range, container)).toEqual<SpanOffsets>({ charStart: 6, charEnd: 9 })
  })

  it('uses normalized Range offsets (start<=end already), no min/max needed', () => {
    const { container, textNode } = makeContainer('0123456789')
    // Range API guarantees startOffset <= endOffset regardless of drag direction.
    const range = makeRange(textNode, 2, textNode, 7)
    expect(extractSpanFromRange(range, container)).toEqual({ charStart: 2, charEnd: 7 })
  })

  it('rejects an empty/collapsed selection (charStart >= charEnd)', () => {
    const { container, textNode } = makeContainer('abcdef')
    expect(extractSpanFromRange(makeRange(textNode, 3, textNode, 3), container)).toBeNull()
    expect(extractSpanFromRange(makeRange(textNode, 5, textNode, 2), container)).toBeNull()
  })

  it('rejects when the container has more than one child node (text node was split)', () => {
    const { textNode } = makeContainer('abc')
    const container = {
      childNodes: [textNode, textNode] as unknown as NodeListOf<ChildNode>,
      firstChild: textNode,
    } as unknown as Element
    expect(extractSpanFromRange(makeRange(textNode, 0, textNode, 2), container)).toBeNull()
  })

  it('rejects when the first child is not a text node (e.g. <br> inserted)', () => {
    const elNode = { nodeType: ELEMENT_NODE } as unknown as ChildNode
    const container = {
      childNodes: [elNode] as unknown as NodeListOf<ChildNode>,
      firstChild: elNode,
    } as unknown as Element
    expect(extractSpanFromRange(makeRange(elNode, 0, elNode, 2), container)).toBeNull()
  })

  it('rejects when the range escapes the container text node (start or end elsewhere)', () => {
    const { container, textNode } = makeContainer('abcdef')
    const other = { nodeType: TEXT_NODE } as unknown as ChildNode
    expect(extractSpanFromRange(makeRange(other, 0, textNode, 3), container)).toBeNull()
    expect(extractSpanFromRange(makeRange(textNode, 0, other, 3), container)).toBeNull()
  })

  it('returns null for missing range or container', () => {
    const { container, textNode } = makeContainer('abc')
    expect(extractSpanFromRange(null, container)).toBeNull()
    expect(extractSpanFromRange(makeRange(textNode, 0, textNode, 2), null)).toBeNull()
  })
})

describe('PII_TYPE_OPTIONS', () => {
  it('maps the 9 required Korean labels to valid enum values', () => {
    const byLabel = Object.fromEntries(PII_TYPE_OPTIONS.map((o) => [o.label, o.value]))
    expect(byLabel).toEqual({
      이름: 'name',
      전화번호: 'phone',
      계좌번호: 'account',
      주소: 'address',
      IP: 'ip',
      이메일: 'email',
      '기관/회사명': 'organization',
      주민등록번호: 'resident_id',
      기타: 'other',
    })
  })

  it('uses only server-recognized enum values', () => {
    const valid = ['name', 'phone', 'account', 'address', 'ip', 'email', 'organization', 'resident_id', 'other']
    for (const o of PII_TYPE_OPTIONS) {
      expect(valid).toContain(o.value)
    }
  })
})
