// ── Motion Moment #2: SKU Card (tap spring + hover glow) ─────────────────────
// MVP에서 사용 가능한 SKU는 브랜드 컬러, 불가 항목은 dimmed.
// whileTap: scale + subtle border flash (kinetic accent)

import { motion } from 'framer-motion'
import { fadeSlideVariants, SPRING } from '../../lib/motionTokens'
import { type SkuDefinition } from '../../types/sku'
import { formatWonShort } from '../../lib/earnings'

type Props = {
  sku: SkuDefinition
}

const RISK_COLOR: Record<string, string> = {
  Low:  '#22c55e',
  Med:  '#f59e0b',
  High: '#ef4444',
}

export default function SKUCard({ sku }: Props) {
  const available = sku.isAvailableMvp

  return (
    <motion.div
      variants={fadeSlideVariants}
      whileTap={available ? { scale: 0.96 } : undefined}
      whileHover={available ? { y: -2 } : undefined}
      transition={SPRING.snappy}
      className="rounded-xl p-4"
      style={{
        backgroundColor: available ? '#1b1e2e' : 'rgba(27,30,46,0.4)',
        border: available
          ? '1px solid rgba(19,55,236,0.25)'
          : '1px solid rgba(255,255,255,0.05)',
        opacity: available ? 1 : 0.55,
      }}
    >
      {/* ID + 정책 리스크 */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#6b8fff' }}
        >
          {sku.id}
        </span>
        <span
          className="text-[10px] font-semibold"
          style={{ color: RISK_COLOR[sku.policyRisk] ?? '#9ca3af' }}
        >
          {sku.policyRisk} risk
        </span>
      </div>

      {/* 이름 */}
      <p className="text-white font-bold text-sm mb-0.5">{sku.nameKo}</p>
      <p className="text-white/40 text-[11px] leading-relaxed mb-3">{sku.descriptionKo}</p>

      {/* 가격 범위 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/30 text-[9px]">시간당 단가 (보수~낙관)</p>
          <p className="text-sm font-bold" style={{ color: available ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}>
            ₩{formatWonShort(sku.baseRateLow)} ~ ₩{formatWonShort(sku.baseRateHigh)}
          </p>
        </div>
        {available ? (
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-lg"
            style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
          >
            MVP 사용가능
          </span>
        ) : (
          <span
            className="text-[10px] text-white/25 text-right max-w-[80px] leading-tight"
          >
            {sku.unavailableReason}
          </span>
        )}
      </div>
    </motion.div>
  )
}
