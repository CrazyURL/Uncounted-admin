import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import { type Session } from '../../types/session'
import { type DatasetFilterCriteria } from '../../types/dataset'
import { calcDatasetSummary, suggestDatasetName } from '../../lib/adminHelpers'

type Props = {
  isOpen: boolean
  onClose: () => void
  sessions: Session[]
  filters: DatasetFilterCriteria
  onCreate: (name: string, description: string) => void
}

export default function DatasetCreateModal({ isOpen, onClose, sessions, filters, onCreate }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(suggestDatasetName(filters, sessions.length))
      setDescription('')
    }
  }, [isOpen, filters, sessions.length])

  const summary = calcDatasetSummary(sessions)

  function handleCreate() {
    if (!name.trim()) return
    onCreate(name.trim(), description.trim())
    setName('')
    setDescription('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="데이터셋 생성">
      <div className="space-y-4">
        {/* 이름 */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            데이터셋 이름
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white border outline-none"
            style={{ backgroundColor: '#101322', borderColor: 'rgba(255,255,255,0.1)' }}
            placeholder="데이터셋 이름 입력"
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            설명 (선택)
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white border outline-none resize-none"
            style={{ backgroundColor: '#101322', borderColor: 'rgba(255,255,255,0.1)' }}
            placeholder="데이터셋에 대한 설명"
          />
        </div>

        {/* 요약 */}
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#101322' }}>
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>선택 요약</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-lg font-bold text-white">{summary.sessionCount}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>세션</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{summary.totalDurationHours.toFixed(1)}h</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>총 시간</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{summary.avgQaScore}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>평균 품질</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>라벨 완료: {summary.labeledCount}/{summary.sessionCount}</span>
            <span>({Math.round(summary.labeledRatio * 100)}%)</span>
          </div>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#1337ec' }}
        >
          데이터셋 생성
        </button>
      </div>
    </Modal>
  )
}
