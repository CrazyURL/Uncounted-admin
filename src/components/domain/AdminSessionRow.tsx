import { useState } from 'react'
import { type Session } from '../../types/session'
import { qualityGradeFromScore, isSessionPublic, LABEL_FIELDS, countFilledLabelFields, downloadWavFromStorage } from '../../lib/adminHelpers'
import { formatDuration } from '../../lib/earnings'
import { maskSessionTitle } from '../../lib/displayMask'

type Props = {
  session: Session
  selected: boolean
  onToggle: (id: string) => void
  hasTranscript?: boolean
}

const GRADE_COLORS: Record<string, string> = {
  A: 'var(--color-success)',
  B: 'var(--color-warning)',
  C: 'var(--color-danger)',
}

export default function AdminSessionRow({ session, selected, onToggle, hasTranscript }: Props) {
  const grade = qualityGradeFromScore(session.qaScore ?? 0)
  const gradeColor = GRADE_COLORS[grade]
  const filledCount = countFilledLabelFields(session.labels)
  const isPublic = isSessionPublic(session)
  const [downloading, setDownloading] = useState(false)

  async function handleWavDownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (!session.audioUrl || downloading) return
    setDownloading(true)
    const { error } = await downloadWavFromStorage(session.audioUrl, session.id)
    if (error) alert(`다운로드 실패: ${error}`)
    setDownloading(false)
  }

  return (
    <button
      onClick={() => onToggle(session.id)}
      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border-light transition-colors ${
        selected ? 'bg-accent-dim' : 'bg-transparent hover:bg-surface-alt'
      }`}
    >
      {/* 체크박스 */}
      <div
        className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border ${
          selected ? 'bg-accent border-accent' : 'bg-transparent border-border'
        }`}
      >
        {selected && (
          <span className="material-symbols-outlined text-on-accent text-sm">check</span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm text-txt truncate">{maskSessionTitle(session.title)}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-txt-tertiary">
            {session.date}
          </span>
          <span className="text-xs text-txt-tertiary">
            {formatDuration(session.duration)}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-alt text-txt-sub">
            {session.labels?.domain ?? '미지정'}
          </span>
        </div>
      </div>

      {/* 우측 배지 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`material-symbols-outlined text-base ${
            isPublic ? 'text-success' : 'text-txt-tertiary'
          }`}
          title={isPublic ? '공개' : '비공개'}
        >
          {isPublic ? 'visibility' : 'visibility_off'}
        </span>
        <div className="flex items-center gap-0.5" title={`라벨: ${filledCount}/5`}>
          {LABEL_FIELDS.map(f => (
            <div
              key={f.key}
              className={`w-1.5 h-1.5 rounded-full ${
                session.labels?.[f.key] != null ? 'bg-success' : 'bg-border'
              }`}
              title={`${f.labelKo}: ${session.labels?.[f.key] ?? '미입력'}`}
            />
          ))}
        </div>
        {session.audioUrl && (
          <span
            className="material-symbols-outlined text-base text-accent"
            title="비식별화 완료 (WAV 업로드됨)"
          >
            shield
          </span>
        )}
        {session.hasDiarization && (
          <span
            className="material-symbols-outlined text-base text-accent"
            title="화자분리 완료"
          >
            record_voice_over
          </span>
        )}
        {hasTranscript && (
          <span
            className="material-symbols-outlined text-base text-success"
            title="STT 자막 있음"
          >
            subtitles
          </span>
        )}
        {session.audioUrl && (
          <button
            onClick={handleWavDownload}
            title="WAV 다운로드"
            className={`flex items-center justify-center w-6 h-6 rounded ${
              downloading ? 'text-txt-tertiary' : 'text-accent'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {downloading ? 'hourglass_empty' : 'download'}
            </span>
          </button>
        )}
        {session.isPiiCleaned && (
          <span
            className="material-symbols-outlined text-base text-accent"
            title="PII 처리 완료"
          >
            verified_user
          </span>
        )}
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
        >
          {grade}
        </span>
      </div>
    </button>
  )
}
