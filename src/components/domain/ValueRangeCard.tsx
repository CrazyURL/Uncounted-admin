import { useState } from 'react'
import { type ValueBreakdown } from '../../lib/valueEngine'
import { formatWonTruncK } from '../../lib/earnings'

type Props = {
  breakdown: ValueBreakdown
  publicCount: number
  totalCount: number
}

export default function ValueRangeCard({ breakdown, publicCount, totalCount }: Props) {
  const [showDetail, setShowDetail] = useState(false)

  const { range, qualityGrade, usableHours, totalHours, conditions, ctas } = breakdown
  const hasConditions = conditions.length > 0

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)' }}
    >
      {/* 배경 glow */}
      <div
        className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--color-accent-dim) 0%, transparent 70%)',
          transform: 'translate(30%, -30%)',
        }}
      />

      <div className="relative p-5">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>payments</span>
          <p className="text-xs tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            예상 가치 범위
          </p>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
          >
            조건부
          </span>
        </div>

        {/* 범위 금액 — 숫자 콤마 포맷 */}
        <p
          className="text-xl font-extrabold leading-tight mb-1 truncate"
          style={{ color: 'var(--color-text)' }}
        >
          ₩{formatWonTruncK(range.low)} ~ ₩{formatWonTruncK(range.high)}
        </p>

        {/* 과대 기대 방지 문구 */}
        <p className="text-[10px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
          이는 확정 수익이 아닌, 데이터 상태 기반의 추정 범위입니다.
        </p>

        {/* 지표 3칸 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div
            className="rounded-xl p-2.5 text-center"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>사용 가능</p>
            <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{usableHours}h</p>
            <p className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>/ {totalHours}h 전체</p>
          </div>
          <div
            className="rounded-xl p-2.5 text-center"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>품질 등급</p>
            <p className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>
              {qualityGrade}
            </p>
            <p className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {qualityGrade === 'A' ? '최고 품질' : qualityGrade === 'B' ? '개선 가능' : '개선 필요'}
            </p>
          </div>
          <div
            className="rounded-xl p-2.5 text-center"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>공개</p>
            <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{publicCount.toLocaleString()}</p>
            <p className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>/ {totalCount.toLocaleString()}건</p>
          </div>
        </div>

        {/* 공개 비율 바 */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="flex-1 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${totalCount > 0 ? Math.round((publicCount / totalCount) * 100) : 0}%`,
                backgroundColor: 'var(--color-accent)',
              }}
            />
          </div>
          <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)' }}>
            {totalCount > 0 ? Math.round((publicCount / totalCount) * 100) : 0}% 공개
          </span>
        </div>

        {/* "왜 변동?" 토글 */}
        {hasConditions && (
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span className="material-symbols-outlined text-sm">
              {showDetail ? 'expand_less' : 'info'}
            </span>
            {showDetail ? '접기' : '왜 변동하나요?'}
          </button>
        )}

        {/* 조건 상세 */}
        {showDetail && hasConditions && (
          <div
            className="mt-3 rounded-xl p-3 flex flex-col gap-2"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-sub)' }}>현재 적용 중인 조건</p>
            {conditions.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="material-symbols-outlined flex-shrink-0 text-sm mt-0.5" style={{ color: 'var(--color-warning)' }}>
                  warning
                </span>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{c}</p>
              </div>
            ))}
            {ctas.length > 0 && (
              <>
                <p className="text-xs font-semibold mt-2 mb-1" style={{ color: 'var(--color-text-sub)' }}>
                  가치를 올리는 방법
                </p>
                {ctas.map((cta, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="material-symbols-outlined flex-shrink-0 text-sm mt-0.5"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      arrow_upward
                    </span>
                    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{cta}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
