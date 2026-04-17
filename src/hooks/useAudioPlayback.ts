import { useCallback, useEffect, useRef, useState } from 'react'
import { type ExportUtterance, type PlaybackState } from '../types/export'

interface UseAudioPlaybackOptions {
  utterances: ExportUtterance[]
}

export function useAudioPlayback({ utterances }: UseAudioPlaybackOptions) {
  const [state, setState] = useState<PlaybackState>({
    currentId: null,
    status: 'stopped',
    mode: 'single',
    queue: [],
    currentIndex: -1,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utterancesRef = useRef<ExportUtterance[]>(utterances)

  useEffect(() => {
    utterancesRef.current = utterances
  }, [utterances])

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio

    const advanceOrStop = (prev: PlaybackState) => {
      if (prev.mode === 'continuous' && prev.currentIndex < prev.queue.length - 1) {
        const nextIndex = prev.currentIndex + 1
        const nextId = prev.queue[nextIndex]
        const nextUtt = utterancesRef.current.find(u => u.utteranceId === nextId)

        if (nextUtt?.audioUrl) {
          audio.src = nextUtt.audioUrl
          audio.play().catch(() => {})
          return { ...prev, currentId: nextId, currentIndex: nextIndex, status: 'playing' as const }
        }
      }
      return { ...prev, status: 'stopped' as const, currentId: null, currentIndex: -1, mode: 'single' as const }
    }

    const handleEnded = () => setState(prev => advanceOrStop(prev))

    const handleError = () => setState(prev => {
      if (prev.mode === 'continuous') return advanceOrStop(prev)
      return { ...prev, status: 'stopped', currentId: null }
    })

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.pause()
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audioRef.current = null
    }
  }, [])

  const play = useCallback((id: string, audioUrl?: string) => {
    if (!audioRef.current || !audioUrl) return

    setState(prev => {
      if (prev.currentId === id && prev.status === 'playing') {
        audioRef.current?.pause()
        return { ...prev, status: 'paused' }
      }

      if (prev.currentId === id && prev.status === 'paused') {
        audioRef.current?.play().catch(() => {})
        return { ...prev, status: 'playing' }
      }

      audioRef.current!.src = audioUrl
      audioRef.current!.play().catch(() => {})
      return { ...prev, currentId: id, status: 'playing', mode: 'single' }
    })
  }, [])

  const startContinuous = useCallback((startId?: string) => {
    if (!audioRef.current) return

    // 필터링된 목록 중 isIncluded인 발화들로 큐 구성
    const includedQueue = utterances.filter(u => u.isIncluded && u.audioUrl).map(u => u.utteranceId)
    if (includedQueue.length === 0) return

    const startIndex = startId ? includedQueue.indexOf(startId) : 0
    const currentId = includedQueue[startIndex === -1 ? 0 : startIndex]
    const currentUtt = utterances.find(u => u.utteranceId === currentId)

    if (currentUtt?.audioUrl) {
      audioRef.current.src = currentUtt.audioUrl
      audioRef.current.play().catch(() => {})
      setState({
        currentId,
        status: 'playing',
        mode: 'continuous',
        queue: includedQueue,
        currentIndex: startIndex === -1 ? 0 : startIndex,
      })
    }
  }, [utterances])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setState(prev => ({ ...prev, status: 'stopped', currentId: null, mode: 'single' }))
  }, [])

  const togglePause = useCallback(() => {
    if (!audioRef.current) return
    setState(prev => {
      if (prev.mode !== 'continuous') return prev
      if (prev.status === 'playing') {
        audioRef.current?.pause()
        return { ...prev, status: 'paused' }
      }
      if (prev.status === 'paused') {
        audioRef.current?.play().catch(() => {})
        return { ...prev, status: 'playing' }
      }
      return prev
    })
  }, [])

  const next = useCallback(() => {
    if (state.mode === 'continuous' && state.currentIndex < state.queue.length - 1) {
      const nextIndex = state.currentIndex + 1
      const nextId = state.queue[nextIndex]
      const nextUtt = utterances.find(u => u.utteranceId === nextId)

      if (nextUtt?.audioUrl && audioRef.current) {
        audioRef.current.src = nextUtt.audioUrl
        audioRef.current.play().catch(() => {})
        setState(prev => ({ ...prev, currentId: nextId, currentIndex: nextIndex, status: 'playing' }))
      }
    }
  }, [state.mode, state.currentIndex, state.queue, utterances])

  return {
    state,
    play,
    startContinuous,
    stop,
    next,
    togglePause,
  }
}
