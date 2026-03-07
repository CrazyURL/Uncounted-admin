import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { DURATION, EASE } from '../../lib/motionTokens'

type Step = {
  label: string
  done?: number
  total?: number
}

type Props = {
  steps: Step[]
  activeIndex: number     // 현재 진행 중 (-1 = 없음)
  completedUpTo: number   // 마지막 완료 인덱스 (-1 = 없음)
  className?: string
}

export default function StepperProgress({ steps, activeIndex, completedUpTo, className = '' }: Props) {
  return (
    <div className={`flex items-start ${className}`}>
      {steps.map((step, i) => {
        const isCompleted = i <= completedUpTo
        const isActive = i === activeIndex
        const isPending = !isCompleted && !isActive
        const lineCompleted = i > 0 && (i - 1) <= completedUpTo

        return (
          <Fragment key={i}>
            {/* 연결선 */}
            {i > 0 && (
              <div
                className="flex-1 relative mt-2"
                style={{ height: 2, backgroundColor: 'var(--color-border)' }}
              >
                <motion.div
                  className="absolute inset-0 origin-left"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                  initial={false}
                  animate={{ scaleX: lineCompleted ? 1 : 0 }}
                  transition={{ duration: DURATION.medium, ease: EASE.standard }}
                />
              </div>
            )}

            {/* 단계 컬럼 */}
            <div className="flex flex-col items-center" style={{ minWidth: 48 }}>
              {/* 점 */}
              <motion.div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: isCompleted || isActive ? 'var(--color-accent)' : 'transparent',
                  border: isPending ? '2px solid var(--color-border)' : '2px solid var(--color-accent)',
                }}
                initial={false}
                animate={{ scale: 1 }}
                transition={{ duration: DURATION.stepDot, ease: EASE.standard }}
              >
                {isCompleted && (
                  <motion.span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--color-text-on-accent)', fontSize: 14 }}
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  >
                    check
                  </motion.span>
                )}
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-text-on-accent)' }} />
                )}
              </motion.div>

              {/* 라벨 */}
              <p
                className="text-[10px] mt-1 text-center leading-tight"
                style={{
                  color: isActive ? 'var(--color-text)' : isCompleted ? 'var(--color-text-sub)' : 'var(--color-text-tertiary)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {step.label}
              </p>

              {/* 건수 */}
              {(isActive || isCompleted) && step.total != null && step.total > 0 && (
                <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {(step.done ?? 0).toLocaleString()}/{step.total.toLocaleString()}
                </p>
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
