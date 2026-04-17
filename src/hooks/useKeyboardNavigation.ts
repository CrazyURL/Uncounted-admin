import { useCallback, useEffect, useState } from 'react'

interface UseKeyboardNavigationOptions {
  itemCount: number
  onToggleReview: (index: number) => void
  onPlay: (index: number) => void
  onToggleSelection: (index: number) => void
  onPiiEdit: (index: number) => void
  onToggleViewMode: () => void
  disabled?: boolean
  scrollToIndex?: (index: number) => void
}

export function useKeyboardNavigation({
  itemCount,
  onToggleReview,
  onPlay,
  onToggleSelection,
  onPiiEdit,
  onToggleViewMode,
  disabled = false,
  scrollToIndex,
}: UseKeyboardNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled) return

    // 입력 필드(PII 에디터 등)에서 키 입력 무시
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    switch (e.key.toLowerCase()) {
      case 'arrowdown':
        e.preventDefault()
        setFocusedIndex(prev => {
          const next = Math.min(prev + 1, itemCount - 1)
          if (scrollToIndex) scrollToIndex(next)
          return next
        })
        break
      case 'arrowup':
        e.preventDefault()
        setFocusedIndex(prev => {
          const next = Math.max(prev - 1, 0)
          if (scrollToIndex) scrollToIndex(next)
          return next
        })
        break
      case ' ':
        e.preventDefault()
        if (focusedIndex >= 0) onToggleReview(focusedIndex)
        break
      case 'enter':
        e.preventDefault()
        if (focusedIndex >= 0) onPlay(focusedIndex)
        break
      case 'x':
        if (focusedIndex >= 0) onToggleSelection(focusedIndex)
        break
      case 'p':
        if (focusedIndex >= 0) onPiiEdit(focusedIndex)
        break
      case 't':
        onToggleViewMode()
        break
    }
  }, [disabled, focusedIndex, itemCount, onToggleReview, onPlay, onToggleSelection, onPiiEdit, onToggleViewMode, scrollToIndex])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    focusedIndex,
    setFocusedIndex,
  }
}
