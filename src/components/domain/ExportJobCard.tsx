import { type ExportJob } from '../../types/admin'

const STATUS_CONFIG: Record<string, { text: string; color: string; icon: string }> = {
  draft: { text: '초안', color: '#6b7280', icon: 'edit_note' },
  queued: { text: '대기', color: '#3b82f6', icon: 'schedule' },
  running: { text: '실행 중', color: '#f59e0b', icon: 'progress_activity' },
  completed: { text: '완료', color: '#22c55e', icon: 'check_circle' },
  failed: { text: '실패', color: '#ef4444', icon: 'error' },
  cancelled: { text: '취소', color: '#6b7280', icon: 'cancel' },
}

type Props = {
  job: ExportJob
  onClick: () => void
}

export default function ExportJobCard({ job, onClick }: Props) {
  const st = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.draft

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl p-4 text-left transition-colors"
      style={{ backgroundColor: '#1b1e2e' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-base"
            style={{ color: st.color }}
          >
            {st.icon}
          </span>
          <span className="text-sm font-medium text-white">{job.skuId}</span>
          <div className="flex gap-1">
            {job.componentIds.map(c => (
              <span
                key={c}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: `${st.color}20`, color: st.color }}
        >
          {st.text}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <span>요청: {job.requestedUnits.toLocaleString()}유닛</span>
        {job.actualUnits > 0 && <span>실제: {job.actualUnits.toLocaleString()}</span>}
        <span>{job.samplingStrategy}</span>
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {job.createdAt}
        </span>
        {job.clientId && (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            고객: {job.clientId}
          </span>
        )}
      </div>
    </button>
  )
}
