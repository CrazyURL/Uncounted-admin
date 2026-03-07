import { useState, useEffect } from 'react'
import { type Session } from '../types/session'
import {
  MISSIONS,
  LIFETIME_TIERS,
  MONTHLY_TIERS,
  computeLifetimeTier,
  computeMonthlyTier,
  computeBonus,
  type TierInfo,
} from '../types/campaign'
import { calcMissionProgress, checkAndCompleteMissions, getMissionCycles } from '../lib/campaigns'
import { loadAllSessions } from '../lib/sessionMapper'

/** 세션별 CP 동적 계산 */
function calcSessionCP(s: Session): number {
  const qa = s.qaScore ?? 0
  const qMul = qa >= 80 ? 2.0 : qa >= 60 ? 1.2 : 0.6
  const labelBonus = s.labels ? 0.5 : 0
  const publicBonus = s.isPublic ? 0.3 : 0
  return Math.round(s.duration * qMul * (1 + labelBonus + publicBonus))
}

function getMonthlyCP(sessions: Session[]): number {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return sessions
    .filter((s) => s.date.startsWith(ym))
    .reduce((sum, ss) => sum + calcSessionCP(ss), 0)
}

function TierRoadmap({ tiers, currentCP, label }: { tiers: TierInfo[]; currentCP: number; label: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-sub)' }}>{label}</p>
      <div className="flex items-center gap-1">
        {tiers.map((t, i) => {
          const reached = currentCP >= t.minCP
          return (
            <div key={t.name} className="flex items-center gap-1 flex-1">
              <div
                className="flex-1 text-center rounded-lg py-1.5"
                style={{
                  backgroundColor: reached ? 'var(--color-accent-dim)' : 'var(--color-muted)',
                  border: reached ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                }}
              >
                <p className="text-[9px] font-bold" style={{ color: reached ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  {t.name}
                </p>
                <p className="text-[8px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.minCP.toLocaleString()}+
                </p>
              </div>
              {i < tiers.length - 1 && (
                <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  chevron_right
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MissionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    loadAllSessions().then((s) => {
      checkAndCompleteMissions(s)
      setSessions(s)
    })
  }, [])

  const lifetimeCP = sessions.reduce((s, ss) => s + calcSessionCP(ss), 0)
  const monthlyCP = getMonthlyCP(sessions)
  const ltTier = computeLifetimeTier(lifetimeCP)
  const mtTier = computeMonthlyTier(monthlyCP)
  const bonus = computeBonus(lifetimeCP, monthlyCP)

  const ltNext = LIFETIME_TIERS.find((t) => t.minCP > lifetimeCP)
  const mtNext = MONTHLY_TIERS.find((t) => t.minCP > monthlyCP)

  const ltProgress = ltNext
    ? Math.round(((lifetimeCP - ltTier.minCP) / (ltNext.minCP - ltTier.minCP)) * 100)
    : 100
  const mtProgress = mtNext
    ? Math.round(((monthlyCP - mtTier.minCP) / (mtNext.minCP - mtTier.minCP)) * 100)
    : 100

  return (
    <div className="min-h-full px-4 py-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 합산 보너스 배너 */}
      <div
        className="rounded-xl p-3 flex items-center justify-between"
        style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>bolt</span>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>CP 보너스</span>
        </div>
        <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>+{bonus}%</span>
      </div>

      {/* Lifetime 티어 카드 */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent-dim)', border: '2px solid var(--color-accent)' }}
          >
            <span className="text-base font-bold" style={{ color: 'var(--color-accent)' }}>
              {ltTier.name[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>누적 {ltTier.name}</p>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
                +{ltTier.bonusPct}%
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              누적 CP: {lifetimeCP.toLocaleString()}
              {ltNext ? ` / 다음까지 ${(ltNext.minCP - lifetimeCP).toLocaleString()}` : ' — 최고 티어'}
            </p>
          </div>
        </div>
        <div className="h-1.5 rounded-full mb-1" style={{ backgroundColor: 'var(--color-muted)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${ltProgress}%`, backgroundColor: 'var(--color-accent)' }} />
        </div>
        <p className="text-[10px] text-right" style={{ color: 'var(--color-text-tertiary)' }}>{ltProgress}%</p>
      </div>

      {/* Monthly 티어 카드 */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent-dim)', border: '2px solid var(--color-accent)' }}
          >
            <span className="text-base font-bold" style={{ color: 'var(--color-accent)' }}>
              {mtTier.name[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>이번 달 {mtTier.name}</p>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
                +{mtTier.bonusPct}%
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              월간 CP: {monthlyCP.toLocaleString()}
              {mtNext ? ` / 다음까지 ${(mtNext.minCP - monthlyCP).toLocaleString()}` : ' — 최고 티어'}
            </p>
          </div>
        </div>
        <div className="h-1.5 rounded-full mb-1" style={{ backgroundColor: 'var(--color-muted)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${mtProgress}%`, backgroundColor: 'var(--color-accent)' }} />
        </div>
        <p className="text-[10px] text-right" style={{ color: 'var(--color-text-tertiary)' }}>{mtProgress}%</p>
      </div>

      {/* 티어 로드맵 */}
      <TierRoadmap tiers={LIFETIME_TIERS} currentCP={lifetimeCP} label="누적 티어 로드맵" />
      <TierRoadmap tiers={MONTHLY_TIERS} currentCP={monthlyCP} label="월간 티어 로드맵" />

      {/* 미션 목록 */}
      <p className="text-sm font-semibold px-0.5" style={{ color: 'var(--color-text-sub)' }}>진행 중 미션</p>

      {MISSIONS.map((mission) => {
        const current = calcMissionProgress(mission.code, sessions)
        const pct = Math.min(100, Math.round((current / mission.targetValue) * 100))
        const done = current >= mission.targetValue
        const cycles = getMissionCycles(mission.code)

        return (
          <div
            key={mission.code}
            className="rounded-xl p-4"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: done ? '1px solid var(--color-success)' : '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: done ? 'var(--color-success-dim)' : 'var(--color-muted)' }}
              >
                <span
                  className="material-symbols-outlined text-base"
                  style={{ color: done ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
                >
                  {done ? 'task_alt' : 'assignment'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{mission.title}</p>
                  {cycles > 0 && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                    >
                      {cycles}회 완료
                    </span>
                  )}
                  {done && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-success-dim)', color: 'var(--color-success)' }}
                    >
                      완료
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                  {mission.description}
                </p>
              </div>
            </div>

            {/* 진행 바 */}
            <div className="h-1.5 rounded-full mb-1" style={{ backgroundColor: 'var(--color-muted)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: done ? 'var(--color-success)' : 'var(--color-accent)',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {current.toLocaleString()} / {mission.targetValue.toLocaleString()}개
              </p>
              <p
                className="text-xs font-semibold"
                style={{ color: done ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
              >
                보상: CP +{mission.cpReward}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
