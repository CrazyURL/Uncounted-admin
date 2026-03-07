import { type UploadStatus } from '../../types/session'
import { type QualityGrade } from '../../types/dataset'
import { DOMAIN_OPTIONS } from '../../lib/labelOptions'

const QUALITY_GRADES: QualityGrade[] = ['A', 'B', 'C']
const LABEL_OPTIONS = [
  { value: 'all' as const, label: '전체' },
  { value: 'labeled' as const, label: '완료' },
  { value: 'unlabeled' as const, label: '미완료' },
]
const PUBLIC_OPTIONS = [
  { value: 'all' as const, label: '전체' },
  { value: 'public' as const, label: '공개' },
  { value: 'private' as const, label: '비공개' },
]
const UPLOAD_OPTIONS: { value: UploadStatus; label: string }[] = [
  { value: 'LOCAL', label: '로컬' },
  { value: 'UPLOADED', label: '업로드됨' },
  { value: 'FAILED', label: '실패' },
]

type Props = {
  selectedDomains: string[]
  onToggleDomain: (d: string) => void
  selectedGrades: QualityGrade[]
  onToggleGrade: (g: QualityGrade) => void
  labelStatus: 'all' | 'labeled' | 'unlabeled'
  onLabelStatus: (s: 'all' | 'labeled' | 'unlabeled') => void
  publicStatus: 'all' | 'public' | 'private'
  onPublicStatus: (s: 'all' | 'public' | 'private') => void
  piiOnly: boolean
  onPiiOnly: (v: boolean) => void
  selectedUploadStatuses: UploadStatus[]
  onToggleUploadStatus: (u: UploadStatus) => void
  dateRange: { from: string; to: string } | null
  onDateRange: (range: { from: string; to: string } | null) => void
  onReset: () => void
}

export default function AdminFilterBar({
  selectedDomains, onToggleDomain,
  selectedGrades, onToggleGrade,
  labelStatus, onLabelStatus,
  publicStatus, onPublicStatus,
  piiOnly, onPiiOnly,
  selectedUploadStatuses, onToggleUploadStatus,
  dateRange, onDateRange,
  onReset,
}: Props) {
  const activeCount =
    selectedDomains.length + selectedGrades.length + selectedUploadStatuses.length +
    (labelStatus !== 'all' ? 1 : 0) + (publicStatus !== 'all' ? 1 : 0) +
    (piiOnly ? 1 : 0) + (dateRange ? 1 : 0)

  function handleDateChange(field: 'from' | 'to', value: string) {
    if (!value && !dateRange) return
    const current = dateRange ?? { from: '', to: '' }
    const updated = { ...current, [field]: value }
    if (!updated.from && !updated.to) {
      onDateRange(null)
    } else {
      onDateRange(updated)
    }
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* 도메인 */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>도메인</p>
        <div className="flex flex-wrap gap-1.5">
          {DOMAIN_OPTIONS.map(d => {
            const on = selectedDomains.includes(d)
            return (
              <button
                key={d}
                onClick={() => onToggleDomain(d)}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: on ? 'rgba(19,55,236,0.15)' : 'transparent',
                  borderColor: on ? '#1337ec' : 'rgba(255,255,255,0.12)',
                  color: on ? '#1337ec' : 'rgba(255,255,255,0.6)',
                }}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {/* 등급 + 라벨 + 공개 + 업로드 + PII */}
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>품질 등급</p>
          <div className="flex gap-1.5">
            {QUALITY_GRADES.map(g => {
              const on = selectedGrades.includes(g)
              const color = g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#ef4444'
              return (
                <button
                  key={g}
                  onClick={() => onToggleGrade(g)}
                  className="w-8 h-8 rounded-lg text-xs font-bold border transition-colors"
                  style={{
                    backgroundColor: on ? `${color}20` : 'transparent',
                    borderColor: on ? color : 'rgba(255,255,255,0.12)',
                    color: on ? color : 'rgba(255,255,255,0.6)',
                  }}
                >
                  {g}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>라벨</p>
          <div className="flex gap-1.5">
            {LABEL_OPTIONS.map(o => {
              const on = labelStatus === o.value
              return (
                <button
                  key={o.value}
                  onClick={() => onLabelStatus(o.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: on ? 'rgba(19,55,236,0.15)' : 'transparent',
                    borderColor: on ? '#1337ec' : 'rgba(255,255,255,0.12)',
                    color: on ? '#1337ec' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>공개 상태</p>
          <div className="flex gap-1.5">
            {PUBLIC_OPTIONS.map(o => {
              const on = publicStatus === o.value
              return (
                <button
                  key={o.value}
                  onClick={() => onPublicStatus(o.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: on ? 'rgba(19,55,236,0.15)' : 'transparent',
                    borderColor: on ? '#1337ec' : 'rgba(255,255,255,0.12)',
                    color: on ? '#1337ec' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>업로드 상태</p>
          <div className="flex gap-1.5">
            {UPLOAD_OPTIONS.map(o => {
              const on = selectedUploadStatuses.includes(o.value)
              return (
                <button
                  key={o.value}
                  onClick={() => onToggleUploadStatus(o.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: on ? 'rgba(19,55,236,0.15)' : 'transparent',
                    borderColor: on ? '#1337ec' : 'rgba(255,255,255,0.12)',
                    color: on ? '#1337ec' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>PII 처리</p>
          <button
            onClick={() => onPiiOnly(!piiOnly)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              backgroundColor: piiOnly ? 'rgba(34,197,94,0.15)' : 'transparent',
              borderColor: piiOnly ? '#22c55e' : 'rgba(255,255,255,0.12)',
              color: piiOnly ? '#22c55e' : 'rgba(255,255,255,0.6)',
            }}
          >
            비식별 완료만
          </button>
        </div>
      </div>

      {/* 기간 */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>기간</p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange?.from ?? ''}
            onChange={e => handleDateChange('from', e.target.value)}
            className="px-2 py-1 rounded-lg text-xs text-white border outline-none"
            style={{
              backgroundColor: '#101322',
              borderColor: dateRange?.from ? '#1337ec' : 'rgba(255,255,255,0.1)',
              colorScheme: 'dark',
            }}
          />
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>~</span>
          <input
            type="date"
            value={dateRange?.to ?? ''}
            onChange={e => handleDateChange('to', e.target.value)}
            className="px-2 py-1 rounded-lg text-xs text-white border outline-none"
            style={{
              backgroundColor: '#101322',
              borderColor: dateRange?.to ? '#1337ec' : 'rgba(255,255,255,0.1)',
              colorScheme: 'dark',
            }}
          />
        </div>
      </div>

      {/* 초기화 */}
      {activeCount > 0 && (
        <button
          onClick={onReset}
          className="text-xs flex items-center gap-1"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <span className="material-symbols-outlined text-sm">restart_alt</span>
          필터 초기화 ({activeCount})
        </button>
      )}
    </div>
  )
}
