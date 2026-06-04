// PII 위치 드래그 영역 선택 헬퍼 (정본 §4.4)
// GT 텍스트에서 사용자가 드래그한 영역을 PII interval 로 추가.

import { useState, useRef } from 'react'
import type { PiiInterval, PiiType } from './types'

interface PiiRangePickerProps {
  gtText: string
  existingIntervals: PiiInterval[]
  onAdd: (interval: Omit<PiiInterval, 'source'>) => void
  onRemove: (start: number, end: number) => void
}

const PII_TYPES: PiiType[] = ['이름', '전화', '주소', '회사', '기타']

export function PiiRangePicker({
  gtText,
  existingIntervals,
  onAdd,
  onRemove,
}: PiiRangePickerProps) {
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
  const [selectedType, setSelectedType] = useState<PiiType>('이름')
  const textRef = useRef<HTMLDivElement>(null)

  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    if (!textRef.current) return
    if (!textRef.current.contains(sel.anchorNode)) return

    const range = sel.getRangeAt(0)
    // 문자 offset 계산 (정확한 매핑은 contentEditable / data-offset 사용 권장)
    const start = getTextOffset(textRef.current, range.startContainer, range.startOffset)
    const end = getTextOffset(textRef.current, range.endContainer, range.endOffset)
    if (start != null && end != null && start < end) {
      setSelectedRange({ start, end })
    }
  }

  const handleAdd = () => {
    if (!selectedRange) return
    onAdd({
      start_char: selectedRange.start,
      end_char: selectedRange.end,
      pii_type: selectedType,
    })
    setSelectedRange(null)
    window.getSelection()?.removeAllRanges()
  }

  const renderHighlighted = () => {
    // 기존 PII interval + 현재 선택 영역 highlight 렌더
    const intervals = [...existingIntervals].sort((a, b) => a.start_char - b.start_char)
    const segments: { text: string; pii?: PiiInterval; isSelection?: boolean }[] = []
    let cursor = 0

    for (const itv of intervals) {
      if (itv.start_char > cursor) {
        segments.push({ text: gtText.slice(cursor, itv.start_char) })
      }
      segments.push({
        text: gtText.slice(itv.start_char, itv.end_char),
        pii: itv,
      })
      cursor = itv.end_char
    }
    if (cursor < gtText.length) {
      segments.push({ text: gtText.slice(cursor) })
    }

    return segments.map((seg, i) => {
      if (seg.pii) {
        return (
          <span
            key={i}
            className={
              seg.pii.source === 'human'
                ? 'bg-red-100 text-red-800 px-0.5 rounded'
                : 'bg-yellow-100 text-yellow-800 px-0.5 rounded'
            }
            title={`PII ${seg.pii.pii_type} (${seg.pii.source})`}
            onClick={() => {
              if (window.confirm(`PII 영역 "${seg.text}" 제거하시겠습니까?`)) {
                onRemove(seg.pii!.start_char, seg.pii!.end_char)
              }
            }}
          >
            {seg.text}
          </span>
        )
      }
      return <span key={i}>{seg.text}</span>
    })
  }

  return (
    <div className="space-y-2 p-2 border border-border-light rounded">
      <div className="text-xs text-txt-sub">PII 부분을 드래그로 선택:</div>
      <div
        ref={textRef}
        className="font-mono text-sm whitespace-pre-wrap p-2 bg-surface border border-border-light rounded select-text"
        onMouseUp={handleMouseUp}
      >
        {renderHighlighted()}
      </div>

      {selectedRange && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-txt-sub">
            영역 [{selectedRange.start}-{selectedRange.end}] "
            {gtText.slice(selectedRange.start, selectedRange.end)}"
          </span>
          <span className="text-txt-sub">유형:</span>
          {PII_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="pii_type"
                value={t}
                checked={selectedType === t}
                onChange={(e) => setSelectedType(e.target.value as PiiType)}
              />
              {t}
            </label>
          ))}
          <button
            type="button"
            className="px-2 py-0.5 bg-blue-500 text-white rounded text-xs"
            onClick={handleAdd}
          >
            ➕ PII 영역 추가
          </button>
        </div>
      )}

      {existingIntervals.length > 0 && (
        <div className="text-xs text-txt-sub">
          등록된 PII: {existingIntervals.length}건 (영역 클릭 시 제거)
        </div>
      )}
    </div>
  )
}

/**
 * contentEditable 안의 node + offset 을 plain text 의 char offset 으로 변환.
 * 정확도는 contentEditable 구조에 따라 다름. 실제 배선 시 data-attr 기반 정밀 매핑 권장.
 */
function getTextOffset(root: HTMLElement, node: Node, offset: number): number | null {
  let acc = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Node | null = walker.nextNode()
  while (n) {
    if (n === node) return acc + offset
    acc += (n.textContent || '').length
    n = walker.nextNode()
  }
  return null
}
