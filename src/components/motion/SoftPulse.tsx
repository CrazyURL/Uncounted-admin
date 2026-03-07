import { useEffect, useRef, useState, type ReactNode } from 'react'

// 세션(페이지 수명) 동안 키별 펄스 횟수 추적
const pulseCountMap = new Map<string, number>()

type Props = {
  children: ReactNode
  maxPulses?: number            // 기본 2
  triggerKey?: string | number  // 변경 시 펄스 트리거
  className?: string
}

export default function SoftPulse({
  children,
  maxPulses = 2,
  triggerKey = 'default',
  className = '',
}: Props) {
  const [pulsing, setPulsing] = useState(false)
  const mountRef = useRef(false)

  useEffect(() => {
    // 마운트 직후 첫 트리거 포함
    const key = String(triggerKey)
    const count = pulseCountMap.get(key) ?? 0

    if (count >= maxPulses) return
    if (!mountRef.current) {
      mountRef.current = true
    }

    pulseCountMap.set(key, count + 1)
    setPulsing(true)
    const timer = setTimeout(() => setPulsing(false), 250)
    return () => clearTimeout(timer)
  }, [triggerKey, maxPulses])

  return (
    <div className={`${className} ${pulsing ? 'soft-pulse' : ''}`}>
      {children}
    </div>
  )
}
