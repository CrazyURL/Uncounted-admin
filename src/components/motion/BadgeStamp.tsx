// ── Motion Moment #4: Badge Stamp (spring scale entrance) ────────────────────
// key prop 변경으로 리마운트해 재실행 가능.
// 등급별 컬러 + 원형 배지 + 체크/별 아이콘.

import { motion } from 'framer-motion'
import { stampVariants } from '../../lib/motionTokens'
import { type QualityGrade } from '../../types/sku'

type Props = {
  grade: QualityGrade
  label?: string
  size?: 'sm' | 'md' | 'lg'
  /** key를 바꾸면 애니메이션 재실행 */
  animKey?: number | string
}

const GRADE_CONFIG: Record<QualityGrade, { color: string; bg: string; border: string; icon: string; text: string }> = {
  A: {
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.4)',
    icon: 'verified',
    text: '최고 품질',
  },
  B: {
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.4)',
    icon: 'star',
    text: '개선 가능',
  },
  C: {
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.4)',
    icon: 'warning',
    text: '개선 필요',
  },
}

const SIZE_CONFIG = {
  sm: { outer: 64,  icon: 24, label: '11px' },
  md: { outer: 88,  icon: 32, label: '12px' },
  lg: { outer: 112, icon: 40, label: '13px' },
}

export default function BadgeStamp({ grade, label, size = 'md', animKey }: Props) {
  const cfg = GRADE_CONFIG[grade]
  const sz = SIZE_CONFIG[size]

  return (
    <motion.div
      key={animKey}
      variants={stampVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center gap-2"
    >
      {/* 원형 배지 */}
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: sz.outer,
          height: sz.outer,
          backgroundColor: cfg.bg,
          border: `2px solid ${cfg.border}`,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ color: cfg.color, fontSize: sz.icon }}
        >
          {cfg.icon}
        </span>
      </div>

      {/* 등급 텍스트 */}
      <div className="text-center">
        <p className="font-extrabold text-xl leading-none" style={{ color: cfg.color }}>
          {grade}
        </p>
        <p className="text-white/40 mt-0.5" style={{ fontSize: sz.label }}>
          {label ?? cfg.text}
        </p>
      </div>
    </motion.div>
  )
}
