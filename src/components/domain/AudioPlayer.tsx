import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { formatDuration } from '../../lib/earnings'

export type AudioPlayerHandle = {
  seekTo: (timeSec: number) => void
}

type PiiMarker = {
  timeSec: number
  durationSec?: number
}

type AudioPlayerProps = {
  duration: number
  audioUrl?: string
  piiMarkers?: PiiMarker[]
}

const BARS = 40

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  function AudioPlayer({ duration, audioUrl, piiMarkers }, ref) {
    const [playing, setPlaying] = useState(false)
    const [current, setCurrent] = useState(0)
    const [realDuration, setRealDuration] = useState<number | null>(null)
    const [canPlay, setCanPlay] = useState(false)
    const [loadError, setLoadError] = useState(false)
    const [liveBars, setLiveBars] = useState<number[] | null>(null)

    // DOM에 마운트된 <audio> 요소 ref
    const audioRef = useRef<HTMLAudioElement>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const ctxRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const rafRef = useRef<number | null>(null)
    const lastTickRef = useRef<number>(0)

    // 외부에서 seekTo 호출할 수 있도록 imperative handle 노출
    useImperativeHandle(ref, () => ({
      seekTo(timeSec: number) {
        const audio = audioRef.current
        if (audio) {
          audio.currentTime = timeSec
        }
        setCurrent(Math.floor(timeSec))
      },
    }))

    // 정적 파형 (시각화 불가 시 폴백)
    const staticBars = useMemo(
      () => Array.from({ length: BARS }, (_, i) => 16 + Math.sin(i * 0.7) * 12 + ((i * 13 + 5) % 9)),
      [],
    )

    // audioUrl 변경 시 완전 초기화
    useEffect(() => {
      setPlaying(false)
      setCurrent(0)
      setRealDuration(null)
      setCanPlay(false)
      setLoadError(false)
      stopAnimation()
      ctxRef.current?.close()
      ctxRef.current = null
      analyserRef.current = null
    }, [audioUrl])

    // DOM <audio> 이벤트 구독
    useEffect(() => {
      const audio = audioRef.current
      if (!audio) return

      const onMeta = () => {
        if (isFinite(audio.duration) && audio.duration > 0) setRealDuration(audio.duration)
      }
      const onTime = () => setCurrent(Math.floor(audio.currentTime))
      const onEnded = () => { setPlaying(false); setCurrent(0); stopAnimation() }
      const onCanPlay = () => { setCanPlay(true); setLoadError(false) }
      const onError = () => { setCanPlay(false); setLoadError(true) }

      audio.addEventListener('loadedmetadata', onMeta)
      audio.addEventListener('timeupdate', onTime)
      audio.addEventListener('ended', onEnded)
      audio.addEventListener('canplay', onCanPlay)
      audio.addEventListener('error', onError)

      return () => {
        audio.removeEventListener('loadedmetadata', onMeta)
        audio.removeEventListener('timeupdate', onTime)
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('canplay', onCanPlay)
        audio.removeEventListener('error', onError)
        audio.pause()
      }
    }, [audioUrl])

    // 목 타이머 (audioUrl 없을 때)
    useEffect(() => {
      if (audioUrl) return
      if (playing) {
        intervalRef.current = setInterval(() => {
          setCurrent((c) => {
            if (c >= duration) { setPlaying(false); return 0 }
            return c + 1
          })
        }, 1000)
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
      return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [playing, duration, audioUrl])

    /**
     * captureStream으로 실시간 파형 분석
     * - 원본 재생(스피커)은 <audio> 요소가 직접 처리 → 음량에 영향 없음
     * - captureStream은 출력 스트림을 복사해 analyser에만 연결
     */
    async function connectVisualizer(audio: HTMLAudioElement) {
      if (analyserRef.current) return  // 이미 연결됨

      const capture = (audio as any).captureStream ?? (audio as any).mozCaptureStream
      if (!capture) return  // 미지원 → 정적 파형 유지

      try {
        const stream: MediaStream = capture.call(audio)
        const ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256  // 128 샘플 → 부드러운 파형

        const source = ctx.createMediaStreamSource(stream)
        // analyser 전용 무음 출력 — "orphaned node" 최적화 방지용
        const silentGain = ctx.createGain()
        silentGain.gain.value = 0
        source.connect(analyser)
        analyser.connect(silentGain)
        silentGain.connect(ctx.destination)

        await ctx.resume()
        ctxRef.current = ctx
        analyserRef.current = analyser
      } catch {
        // captureStream 실패 → 정적 파형 유지 (음성은 이미 재생 중)
      }
    }

    function startAnimation() {
      const analyser = analyserRef.current
      if (!analyser) return

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      function tick(now: number) {
        if (now - lastTickRef.current > 66) {  // ~15fps
          lastTickRef.current = now
          analyser!.getByteTimeDomainData(dataArray)
          const bars = Array.from({ length: BARS }, (_, i) => {
            const idx = Math.floor((i / BARS) * dataArray.length)
            const amp = Math.abs(dataArray[idx] - 128) / 128
            return Math.max(3, Math.round(3 + amp * 33))
          })
          setLiveBars(bars)
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    function stopAnimation() {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setLiveBars(null)
    }

    async function handleToggle() {
      const audio = audioRef.current
      if (!audio || !audioUrl) {
        // 목 모드
        setPlaying((p) => !p)
        return
      }

      if (playing) {
        audio.pause()
        setPlaying(false)
        stopAnimation()
      } else {
        try {
          await audio.play()
          setPlaying(true)
        } catch {
          return
        }
        // play() 성공 후 파형 시각화 연결 (실패해도 음성에 영향 없음)
        await connectVisualizer(audio)
        startAnimation()
      }
    }

    function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
      const val = Number(e.target.value)
      setCurrent(val)
      const audio = audioRef.current
      if (audio) audio.currentTime = val
    }

    const totalDuration = audioUrl ? (realDuration ?? duration) : duration
    const progress = totalDuration > 0 ? (current / totalDuration) * 100 : 0
    const barHeights = liveBars ?? staticBars

    return (
      <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {/* DOM에 마운트된 audio 요소 — Android WebView 음성 재생 호환성 */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            playsInline
            style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
          />
        )}

        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>graphic_eq</span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-sub)' }}>오디오 미리보기</span>
          <span className="ml-auto">
            {audioUrl && canPlay && !loadError && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-success-dim)', color: 'var(--color-success)' }}
              >
                {liveBars ? '실시간' : '실제 음원'}
              </span>
            )}
            {audioUrl && !canPlay && !loadError && (
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>로딩 중...</span>
            )}
            {loadError && (
              <span className="text-[10px]" style={{ color: 'var(--color-danger)' }}>재생 불가</span>
            )}
          </span>
        </div>

        {/* 파형 — 재생 중이면 실시간 진폭, 아니면 정적 */}
        <div className="flex items-end gap-0.5 h-10 mb-3">
          {barHeights.map((height, i) => {
            const filled = (i / BARS) * 100 < progress
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{ height: `${height}px`, backgroundColor: filled ? 'var(--color-accent)' : 'var(--color-muted)' }}
              />
            )
          })}
        </div>

        {/* PII 마커 — 시크바 위, 탐지 위치를 빨간 점/구간으로 표시 */}
        {piiMarkers && piiMarkers.length > 0 && totalDuration > 0 && (
          <div className="relative w-full h-1.5 rounded-full mb-1 overflow-hidden" style={{ backgroundColor: 'var(--color-muted)' }}>
            {piiMarkers.map((marker, i) => {
              const leftPct = Math.min(100, (marker.timeSec / totalDuration) * 100)
              const widthPct = marker.durationSec
                ? Math.max(0.8, (marker.durationSec / totalDuration) * 100)
                : 0.8
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: 'var(--color-danger)',
                    opacity: 0.7,
                  }}
                />
              )
            })}
          </div>
        )}

        <input
          type="range"
          min={0}
          max={Math.round(totalDuration)}
          value={current}
          onChange={handleSeek}
          className="w-full h-1 cursor-pointer mb-3"
          style={{ accentColor: 'var(--color-accent)' }}
        />

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{formatDuration(current)}</span>
          <button
            onClick={handleToggle}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-on-accent)' }}>
              {playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{formatDuration(Math.round(totalDuration))}</span>
        </div>
      </div>
    )
  },
)

export default AudioPlayer
