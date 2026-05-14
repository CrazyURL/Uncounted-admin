import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchTrainingStats,
  triggerTraining,
  fetchTrainingStatus,
  exportTrainingData,
  type TrainingStats,
  type TrainingJob,
} from '../../lib/api/training'

const POLL_INTERVAL_MS = 5000

export default function AdminTrainingPage() {
  const [stats, setStats] = useState<TrainingStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [job, setJob] = useState<TrainingJob | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError(null)
    const res = await fetchTrainingStats()
    if (res.error) {
      setStatsError(res.error)
    } else if (res.data) {
      setStats(res.data)
    }
    setStatsLoading(false)
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollStatus = useCallback(
    (jobId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        const res = await fetchTrainingStatus(jobId)
        if (res.data) {
          setJob(res.data)
          if (res.data.status === 'completed' || res.data.status === 'failed') {
            stopPolling()
            loadStats()
          }
        }
      }, POLL_INTERVAL_MS)
    },
    [stopPolling, loadStats],
  )

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  async function handleTrigger() {
    if (!stats?.canTrigger) return
    setTriggering(true)
    setTriggerError(null)
    const res = await triggerTraining()
    if (res.error) {
      setTriggerError(res.error)
      setTriggering(false)
      return
    }
    if (res.data?.jobId) {
      const initialJob: TrainingJob = {
        jobId: res.data.jobId,
        status: 'running',
        progress: 0,
        currentEpoch: 0,
        totalEpochs: 5,
        valLoss: null,
        modelVersion: null,
        message: '학습 시작 중...',
        startedAt: new Date().toISOString(),
        completedAt: null,
      }
      setJob(initialJob)
      pollStatus(res.data.jobId)
    }
    setTriggering(false)
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportTrainingData()
    } finally {
      setExporting(false)
    }
  }

  const emotionDist = stats?.emotionDistribution
  const distTotal = emotionDist
    ? (emotionDist['긍정'] ?? 0) + (emotionDist['중립'] ?? 0) + (emotionDist['부정'] ?? 0)
    : 0

  function pct(n: number) {
    return distTotal > 0 ? Math.round((n / distTotal) * 100) : 0
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          모델 학습
        </h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-sub)',
            opacity: exporting ? 0.6 : 1,
          }}
        >
          <span className="material-symbols-outlined text-sm">download</span>
          {exporting ? '내보내는 중...' : 'TSV 내보내기'}
        </button>
      </div>

      {/* Stats cards */}
      {statsLoading && (
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          불러오는 중...
        </div>
      )}
      {statsError && (
        <div className="text-sm text-red-500">통계 오류: {statsError}</div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="확인된 레이블"
              value={stats.totalConfirmed.toLocaleString()}
              sub="auto + 어드민 합산"
              icon="check_circle"
              accent
            />
            <StatCard
              label="자동 확인"
              value={stats.autoConfirmedCount.toLocaleString()}
              sub="confidence ≥ 0.85"
              icon="auto_awesome"
            />
            <StatCard
              label="어드민 확인"
              value={stats.adminConfirmedCount.toLocaleString()}
              sub="직접 검수"
              icon="admin_panel_settings"
            />
            <StatCard
              label="마지막 학습"
              value={stats.lastRetrainAt ? formatDate(stats.lastRetrainAt) : '없음'}
              sub="재학습 이력"
              icon="history"
            />
          </div>

          {/* Emotion distribution */}
          {distTotal > 0 && emotionDist && (
            <div
              className="rounded-lg p-4 space-y-3"
              style={{ backgroundColor: 'var(--color-surface-alt)' }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--color-text-sub)' }}>
                감정 분포
              </div>
              <EmotionBar label="긍정" count={emotionDist['긍정'] ?? 0} pct={pct(emotionDist['긍정'] ?? 0)} color="#22c55e" />
              <EmotionBar label="중립" count={emotionDist['중립'] ?? 0} pct={pct(emotionDist['중립'] ?? 0)} color="#6b7280" />
              <EmotionBar label="부정" count={emotionDist['부정'] ?? 0} pct={pct(emotionDist['부정'] ?? 0)} color="#ef4444" />
            </div>
          )}

          {/* Trigger card */}
          <div
            className="rounded-lg p-5 space-y-4"
            style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border-light)' }}
          >
            <div className="space-y-1">
              <div className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
                재학습 트리거
              </div>
              {!stats.canTrigger && (
                <div className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
                  재학습 시작까지{' '}
                  <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                    {stats.needsMoreCount.toLocaleString()}건
                  </span>{' '}
                  더 필요합니다 (초회 기준 500건, 이후 200건).
                </div>
              )}
              {stats.canTrigger && (
                <div className="text-xs" style={{ color: '#22c55e' }}>
                  재학습 가능 상태입니다.
                </div>
              )}
            </div>

            {triggerError && (
              <div className="text-xs text-red-500">{triggerError}</div>
            )}

            <button
              onClick={handleTrigger}
              disabled={!stats.canTrigger || triggering || job?.status === 'running'}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{
                backgroundColor:
                  stats.canTrigger && job?.status !== 'running' && !triggering
                    ? 'var(--color-accent)'
                    : 'var(--color-surface)',
                color:
                  stats.canTrigger && job?.status !== 'running' && !triggering
                    ? '#fff'
                    : 'var(--color-text-sub)',
                cursor:
                  !stats.canTrigger || triggering || job?.status === 'running'
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  !stats.canTrigger || triggering || job?.status === 'running' ? 0.6 : 1,
              }}
            >
              <span className="material-symbols-outlined text-base">model_training</span>
              {triggering ? '요청 중...' : '재학습 시작'}
            </button>
          </div>
        </>
      )}

      {/* Job progress */}
      {job && (
        <JobProgress job={job} />
      )}
    </div>
  )
}

/* ── Sub-components ── */

interface StatCardProps {
  label: string
  value: string
  sub: string
  icon: string
  accent?: boolean
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div
      className="rounded-lg p-4 space-y-1"
      style={{
        backgroundColor: accent ? 'rgba(19,55,236,0.08)' : 'var(--color-surface-alt)',
        border: accent ? '1px solid rgba(19,55,236,0.2)' : '1px solid var(--color-border-light)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="material-symbols-outlined text-base"
          style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-sub)' }}
        >
          {icon}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
          {label}
        </span>
      </div>
      <div
        className="text-2xl font-bold"
        style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {sub}
      </div>
    </div>
  )
}

interface EmotionBarProps {
  label: string
  count: number
  pct: number
  color: string
}

function EmotionBar({ label, count, pct, color }: EmotionBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-10 text-right" style={{ color: 'var(--color-text-sub)' }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border-light)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs w-16 text-right" style={{ color: 'var(--color-text-sub)' }}>
        {count.toLocaleString()} ({pct}%)
      </span>
    </div>
  )
}

function JobProgress({ job }: { job: TrainingJob }) {
  const isRunning = job.status === 'running'
  const isCompleted = job.status === 'completed'
  const isFailed = job.status === 'failed'

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{
        backgroundColor: isCompleted
          ? 'rgba(34,197,94,0.08)'
          : isFailed
          ? 'rgba(239,68,68,0.08)'
          : 'var(--color-surface-alt)',
        border: isCompleted
          ? '1px solid rgba(34,197,94,0.3)'
          : isFailed
          ? '1px solid rgba(239,68,68,0.3)'
          : '1px solid var(--color-border-light)',
      }}
    >
      {isCompleted && job.modelVersion && (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={{ color: '#22c55e' }}>
            check_circle
          </span>
          <span className="font-semibold text-sm" style={{ color: '#22c55e' }}>
            모델 {job.modelVersion} 배포됨
          </span>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-red-500">error</span>
          <span className="font-semibold text-sm text-red-500">학습 실패</span>
        </div>
      )}

      {isRunning && (
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-base animate-spin"
            style={{ color: 'var(--color-accent)' }}
          >
            progress_activity
          </span>
          <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
            학습 진행 중...
          </span>
        </div>
      )}

      <div className="space-y-2 text-xs" style={{ color: 'var(--color-text-sub)' }}>
        <div className="flex justify-between">
          <span>진행률</span>
          <span className="font-medium">{job.progress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border-light)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${job.progress}%`,
              backgroundColor: isCompleted ? '#22c55e' : isFailed ? '#ef4444' : 'var(--color-accent)',
            }}
          />
        </div>

        <div className="flex justify-between pt-1">
          <span>에포크</span>
          <span>
            {job.currentEpoch} / {job.totalEpochs}
          </span>
        </div>

        {job.valLoss !== null && (
          <div className="flex justify-between">
            <span>검증 손실</span>
            <span>{job.valLoss.toFixed(4)}</span>
          </div>
        )}

        {job.message && (
          <div className="pt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {job.message}
          </div>
        )}

        <div className="flex justify-between pt-1">
          <span>작업 ID</span>
          <span className="font-mono text-xs">{job.jobId.slice(0, 8)}...</span>
        </div>

        <div className="flex justify-between">
          <span>시작</span>
          <span>{formatDate(job.startedAt)}</span>
        </div>

        {job.completedAt && (
          <div className="flex justify-between">
            <span>완료</span>
            <span>{formatDate(job.completedAt)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
