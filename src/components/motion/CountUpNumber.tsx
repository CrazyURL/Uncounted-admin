import { useEffect, useRef, useState } from 'react'
import { DURATION } from '../../lib/motionTokens'

type Props = {
  value: number
  duration?: number        // seconds, 기본 DURATION.countUp (0.75)
  format?: (n: number) => string
  delay?: number           // ms
  className?: string
  style?: React.CSSProperties
}

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ease-out 곡선 (decelerate)
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

export default function CountUpNumber({
  value,
  duration = DURATION.countUp,
  format = (n) => Math.round(n).toLocaleString(),
  delay = 0,
  className,
  style,
}: Props) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef<number>(0)
  const prevRef = useRef(value)
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    prevRef.current = value

    if (prefersReduced || from === to) {
      setDisplay(to)
      return
    }

    const start = () => {
      const startTime = performance.now()
      const durationMs = duration * 1000

      const tick = (now: number) => {
        const elapsed = now - startTime
        const t = Math.min(elapsed / durationMs, 1)
        const eased = easeOut(t)
        setDisplay(from + (to - from) * eased)

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          setDisplay(to)
        }
      }

      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }

    if (delay > 0) {
      delayRef.current = setTimeout(start, delay)
    } else {
      start()
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (delayRef.current) clearTimeout(delayRef.current)
    }
  }, [value, duration, delay])

  return (
    <span className={className} style={style}>
      {format(display)}
    </span>
  )
}
