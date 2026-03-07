// ── ReadinessSKUCard — Space C: 판매 준비 ────────────────────────────────────

import { motion } from 'framer-motion'
import { fadeSlideVariants, eligibilityBarVariants } from '../../lib/motionTokens'
import { type SkuReadiness } from '../../lib/refineryEngine'

type Props = {
  readiness: SkuReadiness
  joined: boolean
  onToggleJoin: (skuId: string, next: boolean) => void
  globalConsentEnabled?: boolean
}

export default function ReadinessSKUCard({ readiness, joined, onToggleJoin, globalConsentEnabled = false }: Props) {
  const { sku, status, fitPct, eligibleCount, totalCount, nextAction } = readiness
  const canJoin = sku.isAvailableMvp && status !== 'not_eligible'

  const statusLabel = status === 'eligible' ? '적합' : status === 'needs_work' ? '개선 필요' : '준비 불가'

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* 헤더 행 */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>{sku.nameKo}</span>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}
            >
              {sku.id}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{sku.descriptionKo}</p>
        </div>

        {/* 상태 배지 */}
        <span
          className="text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0"
          style={
            status === 'eligible'
              ? { backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }
              : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
          }
        >
          {statusLabel}
        </span>
      </div>

      {/* 적합도 바 */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>내 데이터 적합도</span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>
            {eligibleCount.toLocaleString()} / {totalCount.toLocaleString()}건 ({fitPct}%)
          </span>
        </div>
        <div
          className="w-full h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--color-muted)' }}
        >
          <motion.div
            className="h-full rounded-full"
            variants={eligibilityBarVariants}
            initial="hidden"
            animate="visible"
            custom={fitPct}
            style={{
              backgroundColor: 'var(--color-accent)',
              transformOrigin: '0%',
              scaleX: 1,
            }}
          />
        </div>
      </div>

      {/* 다음 행동 */}
      {nextAction && (
        <p className="text-[11px] mb-1.5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          → {nextAction}
        </p>
      )}

      {/* 공개 동의 자동 적용 배지 */}
      {joined && globalConsentEnabled && (
        <div className="flex items-center gap-1 mb-3">
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>check_circle</span>
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-accent)' }}>자동 공개 동의 적용 중</span>
        </div>
      )}

      {/* 하단: 가격 범위 + 참여 토글 */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>예상 단가 </span>
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-sub)' }}>
            {(sku.baseRateLow / 1000).toFixed(0)}k~{(sku.baseRateHigh / 1000).toFixed(0)}k ₩/hr
          </span>
        </div>

        {sku.isAvailableMvp ? (
          <button
            onClick={() => onToggleJoin(sku.id, !joined)}
            disabled={!canJoin && !joined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
            style={
              joined
                ? { backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }
                : canJoin
                  ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                  : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }
            }
          >
            {joined ? (
              <>
                <span className="material-symbols-outlined text-sm">check_circle</span>
                참여 중
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">add_circle</span>
                참여하기
              </>
            )}
          </button>
        ) : (
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {sku.unavailableReason ?? 'MVP 미지원'}
          </span>
        )}
      </div>
    </motion.div>
  )
}
