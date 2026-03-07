import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadExportJobs } from '../../lib/adminStore'
import { type ExportJob } from '../../types/admin'
import ExportJobCard from '../../components/domain/ExportJobCard'

export default function AdminExportJobsPage() {
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadExportJobs().then(j => { setJobs(j); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Export 작업 ({jobs.length}건)
        </h2>
        <button
          onClick={() => navigate('/admin/build')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ backgroundColor: '#1337ec' }}
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새 빌드
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
          <p className="text-xs mt-2">로딩 중...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span className="material-symbols-outlined text-4xl">work_off</span>
          <p className="text-sm mt-2">작업 없음</p>
          <p className="text-xs mt-1">빌드 위자드에서 새 작업을 생성하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <ExportJobCard
              key={job.id}
              job={job}
              onClick={() => navigate(`/admin/jobs/${job.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
