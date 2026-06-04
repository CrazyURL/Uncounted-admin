// Review Panel v2 — 단축키 편집/네비 모드 분리 (정본 §4.3)
// 정합 가드: 텍스트박스 포커스 시 1-9/Tab 등 일반 입력으로, 외부에서만 단축키 발동.

import { useEffect, useRef, useState } from 'react'

export type ReviewKeyAction =
  | { type: 'toggle_text' }
  | { type: 'toggle_speaker' }
  | { type: 'toggle_pii' }
  | { type: 'toggle_exclude' }
  | { type: 'play_pause' }
  | { type: 'seek'; deltaSec: number }
  | { type: 'next_red' }
  | { type: 'save_draft' }
  | { type: 'jump_to_time'; seconds: number } // vim G + 시간 산출
  | { type: 'jump_to_utterance'; sequence: number }

interface UseReviewKeyboardOptions {
  enabled: boolean
  onAction: (action: ReviewKeyAction) => void
}

/**
 * 편집/네비 모드 분리 단축키 hook.
 *
 * 편집 모드 = document.activeElement 가 INPUT / TEXTAREA / contentEditable
 * 네비 모드 = 그 외 (체크박스/버튼/빈 영역)
 *
 * 정본 §4.3 단축키 표 참조.
 */
export function useReviewKeyboard({ enabled, onAction }: UseReviewKeyboardOptions): {
  jumpBuffer: string
} {
  const [jumpBuffer, setJumpBuffer] = useState('')
  const jumpModeRef = useRef(false)
  const jumpBufferRef = useRef('')

  useEffect(() => {
    if (!enabled) return

    const isEditingTarget = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      if (t.isContentEditable) return true
      return false
    }

    const handleKey = (e: KeyboardEvent) => {
      // 편집 모드 = 단축키 비활성 (일반 입력)
      if (isEditingTarget(e)) return

      // vim G + 시간 점프 모드
      if (jumpModeRef.current) {
        if (e.key >= '0' && e.key <= '9') {
          jumpBufferRef.current += e.key
          setJumpBuffer(jumpBufferRef.current)
          e.preventDefault()
          return
        }
        if (e.key === 'Enter') {
          // M:SS 또는 MM:SS 또는 그냥 초
          const buf = jumpBufferRef.current
          if (buf) {
            const seconds = parseTimeBuffer(buf)
            if (seconds != null) onAction({ type: 'jump_to_time', seconds })
          }
          jumpModeRef.current = false
          jumpBufferRef.current = ''
          setJumpBuffer('')
          e.preventDefault()
          return
        }
        if (e.key === 'Escape') {
          jumpModeRef.current = false
          jumpBufferRef.current = ''
          setJumpBuffer('')
          e.preventDefault()
          return
        }
      }

      // 일반 네비 단축키
      switch (e.key) {
        case '1':
          onAction({ type: 'toggle_text' })
          e.preventDefault()
          break
        case '2':
          onAction({ type: 'toggle_speaker' })
          e.preventDefault()
          break
        case '3':
          onAction({ type: 'toggle_pii' })
          e.preventDefault()
          break
        case '4':
          onAction({ type: 'toggle_exclude' })
          e.preventDefault()
          break
        case ' ':
          onAction({ type: 'play_pause' })
          e.preventDefault()
          break
        case 'ArrowLeft':
          onAction({ type: 'seek', deltaSec: -3 })
          e.preventDefault()
          break
        case 'ArrowRight':
          onAction({ type: 'seek', deltaSec: 3 })
          e.preventDefault()
          break
        case 'Tab':
          onAction({ type: 'next_red' })
          e.preventDefault()
          break
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            onAction({ type: 'save_draft' })
            e.preventDefault()
          }
          break
        case 'g':
        case 'G':
          jumpModeRef.current = true
          jumpBufferRef.current = ''
          setJumpBuffer('')
          e.preventDefault()
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [enabled, onAction])

  return { jumpBuffer }
}

/**
 * 시간 buffer 파싱.
 * "42"      → 42초
 * "1:30"    → 90초
 * "10:15"   → 615초
 */
function parseTimeBuffer(buf: string): number | null {
  if (!buf) return null
  if (buf.includes(':')) {
    const [m, s] = buf.split(':')
    const mm = parseInt(m, 10)
    const ss = parseInt(s, 10)
    if (Number.isFinite(mm) && Number.isFinite(ss)) return mm * 60 + ss
    return null
  }
  const n = parseInt(buf, 10)
  return Number.isFinite(n) ? n : null
}
