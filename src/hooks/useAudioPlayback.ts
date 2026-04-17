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
  // 큐 시작 시점의 발화 데이터 스냅샷 (제외/필터 변경에도 audioUrl 유지)
  const queueSnapshotRef = useRef<Map<string, ExportUtterance>>(new Map())
  // 최신 utterances (단건 play용)
  const utterancesRef = useRef<ExportUtterance[]>(utterances)

  useEffect(() => {
    utterancesRef.current = utterances
  }, [utterances])

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio

    const advanceOrStop = (prev: PlaybackState): PlaybackState => {
      if (prev.mode === 'continuous' && prev.currentIndex < prev.queue.length - 1) {
        const nextIndex = prev.currentIndex + 1
        const nextId = prev.queue[nextIndex]
        const nextUtt = queueSnapshotRef.current.get(nextId)

        if (nextUtt?.audioUrl) {
          audio.src = nextUtt.audioUrl
          audio.play().catch(() => {})
          return { ...prev, currentId: nextId, currentIndex: nextIndex, status: 'playing' }
        }
      }
      return { ...prev, status: 'stopped', currentId: null, currentIndex: -1, mode: 'single' }
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

    // 현재 utterances 기준으로 포함+audioUrl 있는 발화로 큐 + 스냅샷 구성
    const included = utterances.filter(u => u.isIncluded && u.audioUrl)
    if (included.length === 0) return

    const queue = included.map(u => u.utteranceId)
    const snapshot = new Map(included.map(u => [u.utteranceId, u]))
    queueSnapshotRef.current = snapshot

    const startIndex = startId ? queue.indexOf(startId) : 0
    const idx = startIndex === -1 ? 0 : startIndex
    const currentId = queue[idx]
    const currentUtt = snapshot.get(currentId)

    if (currentUtt?.audioUrl) {
      audioRef.current.src = currentUtt.audioUrl
      audioRef.current.play().catch(() => {})
      setState({
        currentId,
        status: 'playing',
        mode: 'continuous',
        queue,
        currentIndex: idx,
      })
    }
  }, [utterances])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    queueSnapshotRef.current = new Map()
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
    setState(prev => {
      if (prev.mode !== 'continuous' || prev.currentIndex >= prev.queue.length - 1) return prev
      const nextIndex = prev.currentIndex + 1
      const nextId = prev.queue[nextIndex]
      const nextUtt = queueSnapshotRef.current.get(nextId)

      if (nextUtt?.audioUrl && audioRef.current) {
        audioRef.current.src = nextUtt.audioUrl
        audioRef.current.play().catch(() => {})
        return { ...prev, currentId: nextId, currentIndex: nextIndex, status: 'playing' }
      }
      return prev
    })
  }, [])

  return {
    state,
    play,
    startContinuous,
    stop,
    next,
    togglePause,
  }
}
