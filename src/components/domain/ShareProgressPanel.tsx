import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type SharePrepProgress, type SharePrepResult } from '../../lib/sharePrepEngine'
import { getSharePrepSnapshot } from '../../lib/sharePrepStore'
import StepperProgress from '../motion/StepperProgress'
import CountUpNumber from '../motion/CountUpNumber'

type ShareProgressPanelProps = {
  progress: SharePrepProgress
  result: SharePrepResult | null
  onCancel: () => void
  onClose: () => void
}

const PHASE_ORDER: Record<string, number> = {
  scanning: 0,
  sanitizing: 1,
  applying: 2,
  queueing: 3,
  done: 4,
  failed: 4,
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}초`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}분 ${s}초`
}

// 가중 진행률: 단계별 비중
// scan 10%, sanitize 40%, apply 30%, queue 20%
function calcWeightedPct(p: SharePrepProgress): number {
  const phases = [
    { done: p.scanDone, total: p.scanTotal, weight: 10 },
    { done: p.sanitizeDone, total: p.sanitizeTotal, weight: 40 },
    { done: p.applyDone, total: p.applyTotal, weight: 30 },
    { done: p.queueDone, total: p.queueTotal, weight: 20 },
  ]

  let totalWeight = 0
  let doneWeight = 0
  for (const ph of phases) {
    if (ph.total > 0) {
      totalWeight += ph.weight
      doneWeight += (ph.done / ph.total) * ph.weight
    }
  }

  return totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0
}

export default function ShareProgressPanel({ progress, result, onCancel, onClose }: ShareProgressPanelProps) {
  const navigate = useNavigate()
  const isDone = progress.phase === 'done'
  const isFailed = progress.phase === 'failed'
  const isRunning = !isDone && !isFailed

  // 경과 시간 (1초마다 갱신)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning) return
    const startedAt = getSharePrepSnapshot().startedAt ?? Date.now()
    setElapsed(Date.now() - startedAt)
    const timer = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 1000)
    return () => clearInterval(timer)
  }, [isRunning])

  const pct = isDone ? 100 : calcWeightedPct(progress)
  const phaseIdx = PHASE_ORDER[progress.phase] ?? 0
  const stepLabel = isRunning ? `단계 ${Math.min(phaseIdx + 1, 4)}/4` : ''

  const PHASE_DISPLAY: Record<string, string> = {
    scanning: 'PII 점검',
    sanitizing: '정제 처리',
    applying: '결과 적용',
    queueing: '큐 등록',
    done: '완료',
    failed: '오류 발생',
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined text-lg ${isRunning ? 'animate-spin' : ''}`}
            style={{ color: isDone ? 'var(--color-accent)' : isFailed ? 'var(--color-text-sub)' : 'var(--color-accent)' }}
          >
            {isDone ? 'check_circle' : isFailed ? 'error' : 'autorenew'}
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {isDone ? '공개 준비 완료' : isFailed ? '공개 준비 오류' : `공개 준비 — ${PHASE_DISPLAY[progress.phase]}`}
            </p>
            {isRunning && (
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {stepLabel} · {formatElapsed(elapsed)}
              </p>
            )}
          </div>
        </div>
        {isRunning && (
          <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>{pct}%</span>
        )}
      </div>

      {/* 진행률 바 */}
      {isRunning && (
        <div className="h-2 rounded-full mb-3" style={{ backgroundColor: 'var(--color-muted)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }}
          />
        </div>
      )}

      {/* 단계별 상세 — 수평 StepperProgress */}
      <StepperProgress
        className="mb-3"
        steps={[
          { label: 'PII 점검', done: progress.scanDone, total: progress.scanTotal },
          { label: '정제', done: progress.sanitizeDone, total: progress.sanitizeTotal },
          { label: '적용', done: progress.applyDone, total: progress.applyTotal },
          { label: '큐 등록', done: progress.queueDone, total: progress.queueTotal },
        ]}
        activeIndex={isRunning ? phaseIdx : -1}
        completedUpTo={isDone ? 3 : phaseIdx - 1}
      />

      {/* 완료 결과 요약 (CountUpNumber) */}
      {isDone && result && (
        <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: 'var(--color-accent-dim)' }}>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--color-text-sub)' }}>공개 대기</span>
              <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
                <CountUpNumber value={result.queuedSessions} format={(n) => `${Math.round(n).toLocaleString()}건`} />
              </span>
            </div>
            {result.lockedSessions > 0 && (
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--color-text-sub)' }}>잠금 (PII)</span>
                <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                  <CountUpNumber value={result.lockedSessions} format={(n) => `${Math.round(n).toLocaleString()}건`} delay={100} />
                </span>
              </div>
            )}
            {result.skippedSessions > 0 && (
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--color-text-tertiary)' }}>건너뜀 (품질 미달)</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  <CountUpNumber value={result.skippedSessions} format={(n) => `${Math.round(n).toLocaleString()}건`} delay={200} />
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex flex-col gap-2">
        {isRunning ? (
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}
          >
            취소
          </button>
        ) : (
          <>
            {isDone && result && result.lockedSessions > 0 && (
              <button
                onClick={() => navigate('/pii-review')}
                className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock</span>
                잠금 세션 검토하기 ({result.lockedSessions.toLocaleString()}건)
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
            >
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  )
}

