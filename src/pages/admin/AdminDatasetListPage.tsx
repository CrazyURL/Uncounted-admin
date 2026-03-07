import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { type Dataset } from '../../types/dataset'
import { loadAllSessions } from '../../lib/sessionMapper'
import { loadDatasets, deleteDataset } from '../../lib/datasetStore'
import { calcDatasetSummary } from '../../lib/adminHelpers'
import DatasetCard from '../../components/domain/DatasetCard'

export default function AdminDatasetListPage() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      loadAllSessions({ skipUserFilter: true }),
      Promise.resolve(loadDatasets()),
    ]).then(([sessions, ds]) => {
      setAllSessions(sessions)
      setDatasets(ds)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminDatasetList] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>()
    for (const s of allSessions) map.set(s.id, s)
    return map
  }, [allSessions])

  function getSummary(ds: Dataset) {
    const sessions = ds.sessionIds
      .map(id => sessionMap.get(id))
      .filter((s): s is Session => s !== undefined)
    return calcDatasetSummary(sessions)
  }

  function handleDelete(id: string) {
    if (confirmDelete === id) {
      deleteDataset(id)
      setDatasets(prev => prev.filter(d => d.id !== id))
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <span className="material-symbols-outlined text-4xl mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          inventory_2
        </span>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          아직 생성된 데이터셋이 없습니다
        </p>
        <button
          onClick={() => navigate('/admin/sessions')}
          className="mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#1337ec' }}
        >
          공개 세션 보기
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-4 py-4 space-y-3"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          총 {datasets.length}개 데이터셋
        </p>
      </div>

      {datasets.map(ds => {
        const s = getSummary(ds)
        return (
          <div key={ds.id}>
            <DatasetCard
              dataset={ds}
              sessionCount={s.sessionCount}
              totalHours={s.totalDurationHours}
              avgQa={s.avgQaScore}
              onClick={() => navigate(`/admin/datasets/${ds.id}`)}
              onDelete={handleDelete}
            />
            {confirmDelete === ds.id && (
              <div
                className="flex items-center justify-between px-3 py-2 rounded-b-xl -mt-1"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
              >
                <p className="text-xs" style={{ color: '#ef4444' }}>정말 삭제하시겠습니까?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    취소
                  </button>
                  <button
                    onClick={() => handleDelete(ds.id)}
                    className="text-xs px-2 py-1 rounded font-medium"
                    style={{ color: '#ef4444' }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </motion.div>
  )
}
