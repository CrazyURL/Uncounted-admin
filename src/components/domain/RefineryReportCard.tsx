// ── RefineryReportCard — Space B: 정제소 ─────────────────────────────────────

import { useState } from 'react'
import { motion } from 'framer-motion'
import { fadeSlideVariants } from '../../lib/motionTokens'
import { type RefineryMetrics, type ImprovementHint } from '../../lib/refineryEngine'

type Props = {
  metrics: RefineryMetrics
  sessionCount: number
}

function MetricRow({ label, value, pct }: {
  label: string; value: string; pct: number
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--color-text-sub)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }}
        />
      </div>
      <span className="text-xs w-14 text-right font-medium" style={{ color: 'var(--color-text)' }}>{value}</span>
    </div>
  )
}

function HintRow({ hint }: { hint: ImprovementHint }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0"
      style={{ borderColor: 'var(--color-border)' }}>
      <div
        className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
        style={{ backgroundColor: 'var(--color-accent)' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{hint.field}</span>
          <span
            className="text-[9px] px-1 py-0.5 rounded"
            style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
          >
            영향 {hint.impact === 'high' ? '높음' : hint.impact === 'med' ? '보통' : '낮음'}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{hint.issue}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-accent)' }}>→ {hint.cta}</p>
      </div>
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{hint.affectedCount.toLocaleString()}건</span>
    </div>
  )
}

export default function RefineryReportCard({ metrics, sessionCount }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (sessionCount === 0) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>
          스캔 후 품질 리포트가 표시됩니다
        </p>
      </div>
    )
  }

  const visibleHints = expanded ? metrics.improvements : metrics.improvements.slice(0, 2)

  return (
    <motion.div
      variants={fadeSlideVariants}
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* 헤더 */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>품질 리포트</span>
          {!metrics.hasRealMetrics && (
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              추정값
            </span>
          )}
        </div>

        {/* 핵심 지표 바 */}
        <div className="flex flex-col gap-2.5">
          <MetricRow
            label="유효 발화"
            value={`${Math.round(metrics.validSpeechRatio * 100)}%`}
            pct={Math.round(metrics.validSpeechRatio * 100)}
          />
          <MetricRow
            label="SNR 품질"
            value={metrics.hasRealMetrics ? `${metrics.avgSnrDb}dB` : '—'}
            pct={Math.min(100, Math.round((metrics.avgSnrDb / 42) * 100))}
          />
          <MetricRow
            label="저품질 파일"
            value={`${metrics.lowQualityCount.toLocaleString()}개`}
            pct={sessionCount > 0 ? Math.round((metrics.lowQualityCount / sessionCount) * 100) : 0}
          />
        </div>
      </div>

      {/* 개선 힌트 */}
      {metrics.improvements.length > 0 && (
        <>
          <div className="mx-5 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <div className="px-5 pt-3 pb-1">
            <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>개선하면 올라가는 항목</p>
            {visibleHints.map((h, i) => <HintRow key={i} hint={h} />)}
          </div>
          {metrics.improvements.length > 2 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-center py-2 text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {expanded ? '접기' : `${metrics.improvements.length - 2}개 더 보기`}
            </button>
          )}
        </>
      )}

      {metrics.improvements.length === 0 && (
        <div className="px-5 pb-4">
          <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
            현재 개선 필요 항목이 없습니다
          </p>
        </div>
      )}
    </motion.div>
  )
}
