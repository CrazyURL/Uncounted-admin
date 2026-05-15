import { type AdminSession } from '../../types/adminSession'

interface Props {
  session: AdminSession
}

function GenderLabel({ gender }: { gender: string | null }) {
  if (gender === 'male') return <span className="text-blue-600 dark:text-blue-400">남성</span>
  if (gender === 'female') return <span className="text-pink-600 dark:text-pink-400">여성</span>
  return <span className="text-txt-sub">미상</span>
}

function RoleLabel({ role }: { role: string | null }) {
  if (role === 'self') return <span className="text-emerald-600 dark:text-emerald-400">본인</span>
  if (role === 'other') return <span className="text-violet-600 dark:text-violet-400">상대방</span>
  return <span className="text-txt-sub">-</span>
}

function QualityBadge({ grade }: { grade: 'A' | 'B' | 'C' | null | undefined }) {
  if (grade === 'A') return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">A</span>
  if (grade === 'B') return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">B</span>
  if (grade === 'C') return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">C</span>
  return <span className="text-txt-sub text-xs">-</span>
}

export function SessionReviewPanel({ session }: Props) {
  const hasSpeakers = (session.speakers?.length ?? 0) > 0
  const hasQuality = session.quality_score_avg != null || session.snr_db_avg != null || session.speech_ratio_avg != null
  const hasPii = (session.pii_count ?? 0) > 0

  if (!hasSpeakers && !hasQuality && !hasPii) return null

  return (
    <div className="px-4 py-3 bg-surface border-b border-border-light text-xs space-y-3">
      {hasSpeakers && (
        <div>
          <div className="font-medium text-txt-sub mb-1.5">화자 정보</div>
          <div className="flex flex-wrap gap-2">
            {session.speakers!.map((sp) => (
              <div
                key={sp.speaker_label}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-light bg-surface-alt"
              >
                <span className="font-mono text-txt-sub">{sp.speaker_label}</span>
                <span className="text-border-light">|</span>
                <RoleLabel role={sp.speaker_role} />
                <span className="text-border-light">|</span>
                <GenderLabel gender={sp.speaker_gender} />
                {sp.speaker_voice_age_range && (
                  <>
                    <span className="text-border-light">|</span>
                    <span className="text-txt-sub">{sp.speaker_voice_age_range}</span>
                  </>
                )}
                {sp.speaker_relation && (
                  <>
                    <span className="text-border-light">|</span>
                    <span className="text-txt">{sp.speaker_relation}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasQuality && (
        <div>
          <div className="font-medium text-txt-sub mb-1.5">품질 지표 (발화 평균)</div>
          <div className="flex flex-wrap gap-4">
            {session.quality_score_avg != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-txt-sub">품질점수</span>
                <span className="font-medium text-txt">{session.quality_score_avg.toFixed(1)}</span>
                <QualityBadge grade={session.quality_grade_min} />
              </div>
            )}
            {session.snr_db_avg != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-txt-sub">SNR</span>
                <span className="font-medium text-txt">{session.snr_db_avg.toFixed(1)} dB</span>
              </div>
            )}
            {session.speech_ratio_avg != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-txt-sub">음성비율</span>
                <span className="font-medium text-txt">{(session.speech_ratio_avg * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasPii && (
        <div>
          <div className="font-medium text-txt-sub mb-1.5">
            PII 처리 현황
            <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
              {session.pii_count}건 의심
            </span>
          </div>
          {(session.pii_interval_samples?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {session.pii_interval_samples!.map((iv, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-mono"
                >
                  {iv.startSec.toFixed(1)}s–{iv.endSec.toFixed(1)}s
                </span>
              ))}
              {(session.pii_count ?? 0) > (session.pii_interval_samples?.length ?? 0) && (
                <span className="text-txt-sub px-1">외 더 있음</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
