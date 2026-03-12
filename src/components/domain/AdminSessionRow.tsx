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
  A: '#22c55e',
  B: '#f59e0b',
  C: '#ef4444',
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
      className="w-full flex items-center gap-3 px-4 py-3 border-b transition-colors"
      style={{
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: selected ? 'rgba(19,55,236,0.08)' : 'transparent',
      }}
    >
      {/* 체크박스 */}
      <div
        className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border"
        style={{
          borderColor: selected ? '#1337ec' : 'rgba(255,255,255,0.2)',
          backgroundColor: selected ? '#1337ec' : 'transparent',
        }}
      >
        {selected && (
          <span className="material-symbols-outlined text-white text-sm">check</span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm text-white truncate">{maskSessionTitle(session.title)}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {session.date}
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {formatDuration(session.duration)}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
          >
            {session.labels?.domain ?? '미지정'}
          </span>
        </div>
      </div>

      {/* 우측 배지 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="material-symbols-outlined text-base"
          style={{ color: isPublic ? '#22c55e' : 'rgba(255,255,255,0.2)' }}
          title={isPublic ? '공개' : '비공개'}
        >
          {isPublic ? 'visibility' : 'visibility_off'}
        </span>
        <div className="flex items-center gap-0.5" title={`라벨: ${filledCount}/5`}>
          {LABEL_FIELDS.map(f => (
            <div
              key={f.key}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: session.labels?.[f.key] != null ? '#22c55e' : 'rgba(255,255,255,0.12)' }}
              title={`${f.labelKo}: ${session.labels?.[f.key] ?? '미입력'}`}
            />
          ))}
        </div>
        {session.audioUrl && (
          <span
            className="material-symbols-outlined text-base"
            style={{ color: '#60a5fa' }}
            title="비식별화 완료 (WAV 업로드됨)"
          >
            shield
          </span>
        )}
        {session.hasDiarization && (
          <span
            className="material-symbols-outlined text-base"
            style={{ color: '#a78bfa' }}
            title="화자분리 완료"
          >
            record_voice_over
          </span>
        )}
        {hasTranscript && (
          <span
            className="material-symbols-outlined text-base"
            style={{ color: '#22c55e' }}
            title="STT 자막 있음"
          >
            subtitles
          </span>
        )}
        {session.audioUrl && (
          <button
            onClick={handleWavDownload}
            title="WAV 다운로드"
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: downloading ? 'rgba(255,255,255,0.2)' : '#a78bfa' }}
          >
            <span className="material-symbols-outlined text-base">
              {downloading ? 'hourglass_empty' : 'download'}
            </span>
          </button>
        )}
        {session.isPiiCleaned && (
          <span
            className="material-symbols-outlined text-base"
            style={{ color: '#60a5fa' }}
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
