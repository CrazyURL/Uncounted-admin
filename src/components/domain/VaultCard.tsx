// ── VaultCard — Space A: 금고 ─────────────────────────────────────────────────

import { motion } from 'framer-motion'
import { vaultPulseVariants, stampVariants } from '../../lib/motionTokens'
import { type QualityGrade } from '../../types/sku'

type Props = {
  fileCount: number
  totalHours: number
  publicCount: number
  usableHoursLow: number
  usableHoursHigh: number
  qualityGrade: QualityGrade
  labeledCount: number
  pulseKey?: number | string
}

export default function VaultCard({
  fileCount, totalHours, publicCount,
  usableHoursLow, usableHoursHigh,
  qualityGrade, labeledCount, pulseKey,
}: Props) {
  return (
    <motion.div
      key={pulseKey}
      variants={vaultPulseVariants}
      initial="idle"
      animate={pulseKey ? 'pulse' : 'idle'}
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* ── 상단: 확정 데이터 ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>lock</span>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>확정 자산</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="font-extrabold text-xl leading-none" style={{ color: 'var(--color-text)' }}>{fileCount.toLocaleString()}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>음성 파일</p>
          </div>
          <div>
            <p className="font-extrabold text-xl leading-none" style={{ color: 'var(--color-text)' }}>
              {totalHours >= 10 ? Math.round(totalHours).toLocaleString() : totalHours.toFixed(1)}h
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>총 시간</p>
          </div>
          <div>
            <p className="font-extrabold text-xl leading-none" style={{ color: 'var(--color-text)' }}>{labeledCount.toLocaleString()}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>라벨 완료</p>
          </div>
        </div>
      </div>

      <div className="mx-5 h-px" style={{ backgroundColor: 'var(--color-border)' }} />

      {/* ── 하단: 추정 데이터 ── */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>추정 유효 발화</span>
            <span
              className="text-[9px] font-bold px-1 py-0.5 rounded"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              추정
            </span>
          </div>
          {/* 품질 등급 배지 */}
          <motion.div
            variants={stampVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }}
          >
            <span className="font-extrabold text-sm" style={{ color: 'var(--color-accent)' }}>
              {qualityGrade}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--color-accent)' }}>
              {qualityGrade === 'A' ? '최고 품질' : qualityGrade === 'B' ? '개선 가능' : '개선 필요'}
            </span>
          </motion.div>
        </div>

        {/* usable hours 범위 */}
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>{usableHoursLow.toFixed(1)}h</span>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>~</span>
          <span className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>{usableHoursHigh.toFixed(1)}h</span>
          <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>유효 발화</span>
        </div>

        {/* 공개 현황 */}
        <div className="flex items-center gap-2">
          <div
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: fileCount > 0 ? `${Math.round((publicCount / fileCount) * 100)}%` : '0%',
                backgroundColor: 'var(--color-accent)',
              }}
            />
          </div>
          <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)' }}>
            {publicCount.toLocaleString()}/{fileCount.toLocaleString()} 공개
          </span>
        </div>
      </div>
    </motion.div>
  )
}
