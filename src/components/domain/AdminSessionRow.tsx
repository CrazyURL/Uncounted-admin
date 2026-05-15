import { useState } from 'react'
import { type Session } from '../../types/session'
import { qualityGradeFromScore, countFilledLabelFields, downloadSessionPackage } from '../../lib/adminHelpers'
import { formatDuration } from '../../lib/earnings'
import { maskSessionTitle } from '../../lib/displayMask'

type Props = {
  session: Session
  selected: boolean
  onToggle: (id: string) => void
  hasTranscript?: boolean
  reviewStatus?: string
}

const GRADE_COLORS: Record<string, string> = {
  A: 'var(--color-success)',
  B: 'var(--color-warning)',
  C: 'var(--color-danger)',
}

const REVIEW_LABELS: Record<string, string> = {
  pending: '대기',
  in_review: '검수 중',
  approved: '승인',
  rejected: '거절',
  needs_revision: '수정 필요',
}

export default function AdminSessionRow({ session, selected, onToggle, hasTranscript, reviewStatus }: Props) {
  const grade = qualityGradeFromScore(session.qaScore ?? 0)
  const gradeColor = GRADE_COLORS[grade]
  const [packaging, setPackaging] = useState(false)

  const pipelineSteps = [
    { title: '업로드',     done: !!session.audioUrl },
    { title: '화자분리',   done: !!session.hasDiarization },
    { title: 'STT',        done: !!hasTranscript },
    { title: 'PII처리',    done: !!session.isPiiCleaned },
    { title: '자동라벨링', done: countFilledLabelFields(session.labels) > 0 },
    { title: '품질검증',   done: session.qaScore != null },
  ]

  async function handlePackageDownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (packaging) return
    setPackaging(true)
    const { error } = await downloadSessionPackage(session.id, `${session.title}.zip`)
    if (error) alert(`풀패키지 다운로드 실패: ${error}`)
    setPackaging(false)
  }

  return (
    <div
      className={`w-full flex items-center border-b border-border-light transition-colors text-sm ${
        selected ? 'bg-accent-dim' : 'bg-transparent hover:bg-surface-alt'
      }`}
    >
      {/* 체크박스 */}
      <div
        onClick={() => onToggle(session.id)}
        className="flex-shrink-0 w-9 flex items-center justify-center py-2.5 cursor-pointer"
      >
        <div
          className={`w-4 h-4 rounded flex items-center justify-center border ${
            selected ? 'bg-accent border-accent' : 'bg-transparent border-border'
          }`}
        >
          {selected && (
            <span className="material-symbols-outlined text-on-accent" style={{ fontSize: '12px' }}>check</span>
          )}
        </div>
      </div>

      {/* 파일명(가명처리) */}
      <div className="flex-1 min-w-0 py-2.5 pr-2 truncate text-txt">
        {maskSessionTitle(session.title)}
      </div>

      {/* 길이 */}
      <div className="w-16 flex-shrink-0 py-2.5 text-xs text-txt-sub text-right pr-3">
        {formatDuration(session.duration)}
      </div>

      {/* 날짜 */}
      <div className="w-24 flex-shrink-0 py-2.5 text-xs text-txt-sub text-center">
        {session.date}
      </div>

      {/* 처리흐름 */}
      <div className="w-36 flex-shrink-0 py-2.5 flex items-center gap-1.5 justify-center">
        {pipelineSteps.map((step) => (
          <div
            key={step.title}
            title={`${step.title}: ${step.done ? '완료' : '미처리'}`}
            className={`w-3 h-3 rounded-full flex-shrink-0 ${
              step.done ? 'bg-success' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* 검수결과 */}
      <div className="w-20 flex-shrink-0 py-2.5 text-center">
        <span className="text-xs text-txt-sub">
          {reviewStatus ? (REVIEW_LABELS[reviewStatus] ?? reviewStatus) : '—'}
        </span>
      </div>

      {/* 품질등급 */}
      <div className="w-14 flex-shrink-0 py-2.5 flex items-center justify-center">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
        >
          {grade}
        </span>
      </div>

      {/* 풀패키지 다운로드 */}
      <div className="w-12 flex-shrink-0 py-2.5 flex items-center justify-center">
        <button
          onClick={handlePackageDownload}
          title="풀패키지 다운로드 (raw + 발화 WAV + 전사 + 메타 zip)"
          className={`flex items-center justify-center w-7 h-7 rounded hover:bg-surface-alt ${
            packaging ? 'text-txt-tertiary' : 'text-accent'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {packaging ? 'hourglass_empty' : 'folder_zip'}
          </span>
        </button>
      </div>
    </div>
  )
}
