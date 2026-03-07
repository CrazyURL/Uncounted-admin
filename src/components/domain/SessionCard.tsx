import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session, type SessionStatus } from '../../types/session'
import { formatDuration } from '../../lib/earnings'
import { fadeSlideVariants } from '../../lib/motionTokens'
import { maskSessionTitle } from '../../lib/displayMask'
import LabelStatusBadge from './LabelStatusBadge'

type SessionCardProps = {
  session: Session
}

function deriveGrade(session: Session): 'A' | 'B' | 'C' {
  const qa = session.qaScore ?? 0
  if (qa >= 80) return 'A'
  if (qa >= 60) return 'B'
  return 'C'
}

const GRADE_STYLE: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  A: { icon: 'check_circle', bg: 'var(--color-accent-dim)', border: 'var(--color-accent)', text: 'var(--color-accent)' },
  B: { icon: 'star', bg: 'var(--color-muted)', border: 'var(--color-border)', text: 'var(--color-text-sub)' },
  C: { icon: 'warning', bg: 'var(--color-muted)', border: 'var(--color-border)', text: 'var(--color-text-tertiary)' },
}

const STATUS_CONFIG: Record<
  Exclude<SessionStatus, 'uploaded'>,
  { label: string; icon: string; pulse: boolean }
> = {
  pending:    { label: '대기중',   icon: 'hourglass_empty', pulse: false },
  processing: { label: '분석중',   icon: 'autorenew',       pulse: true  },
  uploading:  { label: '업로드중', icon: 'cloud_upload',    pulse: true  },
  failed:     { label: '오류',     icon: 'error_outline',   pulse: false },
}

export default function SessionCard({ session }: SessionCardProps) {
  const navigate = useNavigate()
  const m = session.audioMetrics
  const grade = deriveGrade(session)
  const gs = GRADE_STYLE[grade]
  const statusCfg = session.status !== 'uploaded' ? STATUS_CONFIG[session.status] : null
  const effectiveMins = m?.effectiveMinutes ?? Math.round(session.duration / 60 * 0.75)

  return (
    <motion.button
      variants={fadeSlideVariants}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate(`/assets/${session.id}`)}
      className="w-full text-left rounded-2xl p-5 transition-all"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate" style={{ color: 'var(--color-text)' }}>
            {maskSessionTitle(session.title)}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{session.date}</span>
            <span className="text-sm" style={{ color: 'var(--color-border)' }}>·</span>
            <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{formatDuration(session.duration)}</span>
            {session.labels?.domain && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
              >
                {session.labels.domain}
              </span>
            )}
            {statusCfg && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5${statusCfg.pulse ? ' animate-pulse' : ''}`}
                style={{ color: 'var(--color-text-sub)', backgroundColor: 'var(--color-muted)' }}
              >
                <span className="material-symbols-outlined text-xs">{statusCfg.icon}</span>
                {statusCfg.label}
              </span>
            )}
          </div>
        </div>

        {/* 품질 등급 배지 */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border"
          style={{ backgroundColor: gs.bg, borderColor: gs.border }}
        >
          <span className="text-base font-bold" style={{ color: gs.text }}>{grade}</span>
        </div>
      </div>

      {/* 유효발화 + 상태 배지 행 */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-sub)' }}>
          유효 {effectiveMins}분
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {session.isPiiCleaned && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              비식별화
            </span>
          )}
          {session.isPublic && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
            >
              <span className="material-symbols-outlined text-xs">check_circle</span>
              공개
            </span>
          )}
          {session.labelStatus && (
            <LabelStatusBadge status={session.labelStatus} />
          )}
          {session.labels && (
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-accent)' }}>라벨완료</span>
          )}
        </div>
      </div>
    </motion.button>
  )
}
