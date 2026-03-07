// ── Motion Moment #5: Range Value Bar (animated scaleX fill) ─────────────────
// originX: 0 → 왼쪽에서 오른쪽으로 채워짐
// barFillVariants의 custom prop으로 목표 퍼센트 전달

import { motion } from 'framer-motion'
import { barFillVariants, fadeSlideVariants } from '../../lib/motionTokens'
import { formatWonShort } from '../../lib/earnings'

type Props = {
  low: number
  high: number
  /** 현재 채워질 비율 (0~100) */
  fillPct: number
  label?: string
  /** key를 바꾸면 애니메이션 재실행 */
  animKey?: number | string
}

export default function RangeValueBar({ low, high, fillPct, label = '예상 가치 범위', animKey }: Props) {
  return (
    <motion.div
      key={animKey}
      variants={fadeSlideVariants}
      initial="hidden"
      animate="visible"
      className="rounded-xl p-4"
      style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* 라벨 */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-white/45 text-xs uppercase tracking-widest">{label}</p>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
        >
          조건부
        </span>
      </div>

      {/* 금액 범위 */}
      <p className="text-xl font-extrabold leading-none mb-3" style={{ color: '#f59e0b' }}>
        ₩{formatWonShort(low)} ~ ₩{formatWonShort(high)}
      </p>

      {/* 애니메이션 바 */}
      <div
        className="h-3 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
      >
        <motion.div
          key={animKey}
          custom={fillPct}
          variants={barFillVariants}
          initial="hidden"
          animate="visible"
          className="h-full rounded-full"
          style={{
            originX: 0,
            background: 'linear-gradient(90deg, #1337ec 0%, #4d6fff 50%, #f59e0b 100%)',
          }}
        />
      </div>

      {/* 퍼센트 */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-white/25 text-[10px]">보수적</span>
        <span className="text-white/40 text-xs font-semibold">{fillPct}% 수준</span>
        <span className="text-white/25 text-[10px]">낙관적</span>
      </div>
    </motion.div>
  )
}
