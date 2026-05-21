import { type AdminSession } from '../../types/adminSession'
import { speakerDisplayLabel } from '../../lib/speakerLabel'

interface Props {
  session: AdminSession
}

function GenderLabel({ gender }: { gender: string | null }) {
  if (gender === 'male') return <span className="text-blue-600 dark:text-blue-400">남성</span>
  if (gender === 'female') return <span className="text-pink-600 dark:text-pink-400">여성</span>
  return <span className="text-txt-sub">미상</span>
}

function QualityBadge({ grade }: { grade: 'A' | 'B' | 'C' | null | undefined }) {
  if (grade === 'A') return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">A</span>
  if (grade === 'B') return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">B</span>
  if (grade === 'C') return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">C</span>
  return <span className="text-txt-sub text-xs">-</span>
}

function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDurationSec(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}초`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}분 ${s}초`
}

function getPiiTypeLabel(piiType: string | null): string {
  switch (piiType) {
    case 'name': return '이름'
    case 'phone': return '전화번호'
    case 'address': return '주소'
    case 'id': return '신원정보'
    case 'account': return '계좌번호'
    case 'email': return '이메일'
    case 'date': return '날짜'
    case 'organization': return '기관명'
    default: return piiType ?? 'PII'
  }
}

function snrColor(snr: number): string {
  if (snr < 20) return 'text-red-600 dark:text-red-400'
  if (snr < 30) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-emerald-600 dark:text-emerald-400'
}

function ratioColor(ratio: number): string {
  if (ratio < 0.4) return 'text-red-600 dark:text-red-400'
  if (ratio < 0.6) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-emerald-600 dark:text-emerald-400'
}

export function SessionReviewPanel({ session }: Props) {
  const hasSpeakers = (session.speakers?.length ?? 0) > 0
  const hasQuality = session.quality_score_avg != null || session.snr_db_avg != null || session.speech_ratio_avg != null
  const hasPii = (session.pii_count ?? 0) > 0

  if (!hasSpeakers && !hasQuality && !hasPii) return null

  const piiSamples = session.pii_interval_samples ?? []
  const piiOverflow = (session.pii_count ?? 0) - piiSamples.length

  return (
    <div className="px-4 py-3 bg-surface border-b border-border-light text-xs">
      <div className="grid grid-cols-3 gap-4">

        {/* 화자 */}
        <div>
          <div className="font-medium text-txt-sub mb-2">화자</div>
          {hasSpeakers ? (
            <div className="space-y-2">
              {session.speakers!.map((sp) => (
                <div
                  key={sp.speaker_label}
                  className="p-2 rounded-md border border-border-light bg-surface-alt"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-medium text-txt">{speakerDisplayLabel(sp.speaker_label, sp.speaker_role)}</span>
                    <span className="text-border-light">·</span>
                    <GenderLabel gender={sp.speaker_gender} />
                  </div>
                  <div className="space-y-0.5 text-txt-sub">
                    {sp.speaker_voice_age_range && (
                      <div>목소리연령 <span className="text-txt">{sp.speaker_voice_age_range}</span></div>
                    )}
                    {sp.speaker_speech_age_range && (
                      <div>말투연령 <span className="text-txt">{sp.speaker_speech_age_range}</span></div>
                    )}
                    {sp.speaker_relation ? (
                      <div>관계 <span className="text-txt">{sp.speaker_relation}</span></div>
                    ) : sp.speaker_role === 'other' ? (
                      <div>관계 <span className="text-txt-sub">미검출</span></div>
                    ) : null}
                    {sp.speaker_role === 'self' && sp.speaker_accent_group && (
                      <div>사투리 <span className="text-txt">{sp.speaker_accent_group}</span></div>
                    )}
                    {sp.speaker_role === 'self' && sp.speaker_region_group && (
                      <div>지역 <span className="text-txt">{sp.speaker_region_group}</span></div>
                    )}
                    <div className="pt-0.5">
                      {sp.utterance_count}발화 · {formatDurationSec(sp.total_duration_sec)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-txt-sub">-</span>
          )}
        </div>

        {/* 품질 지표 */}
        <div>
          <div className="font-medium text-txt-sub mb-2">품질 지표</div>
          {hasQuality ? (
            <div className="space-y-1.5">
              {session.quality_grade_min != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-txt-sub">등급</span>
                  <QualityBadge grade={session.quality_grade_min} />
                </div>
              )}
              {session.snr_db_avg != null && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] leading-none ${snrColor(session.snr_db_avg)}`}>●</span>
                  <span className="text-txt-sub">SNR</span>
                  <span className={`font-medium ${snrColor(session.snr_db_avg)}`}>
                    {session.snr_db_avg.toFixed(1)} dB
                  </span>
                </div>
              )}
              {session.speech_ratio_avg != null && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] leading-none ${ratioColor(session.speech_ratio_avg)}`}>●</span>
                  <span className="text-txt-sub">음성비율</span>
                  <span className={`font-medium ${ratioColor(session.speech_ratio_avg)}`}>
                    {(session.speech_ratio_avg * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              {session.quality_score_avg != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] leading-none text-txt-sub">●</span>
                  <span className="text-txt-sub">점수</span>
                  <span className="font-medium text-txt">{session.quality_score_avg.toFixed(1)}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-txt-sub">-</span>
          )}
        </div>

        {/* 개인정보(PII) */}
        <div>
          <div className="font-medium text-txt-sub mb-2 flex items-center flex-wrap gap-1.5">
            개인정보(PII)
            {hasPii && (
              <>
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
                  {session.pii_count}건
                </span>
                <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">무음 처리 완료</span>
              </>
            )}
          </div>
          {hasPii ? (
            <div className="space-y-1">
              {piiSamples.length > 0 ? (
                <>
                  {piiSamples.map((iv, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                        {getPiiTypeLabel(iv.piiType)}
                      </span>
                      <span className="font-mono text-txt-sub">
                        {formatMmSs(iv.startSec)}–{formatMmSs(iv.endSec)}
                      </span>
                    </div>
                  ))}
                  {piiOverflow > 0 && (
                    <div className="text-txt-sub">외 {piiOverflow}건 더</div>
                  )}
                </>
              ) : (
                <span className="text-txt-sub">{session.pii_count}건 (샘플 없음)</span>
              )}
            </div>
          ) : (
            <span className="text-txt-sub">없음</span>
          )}
        </div>

      </div>
    </div>
  )
}
