import { useEffect, useState, useRef } from 'react'
import { type StorageMetaEntry, listStorageMetasApi } from '../../lib/api/admin'
import { downloadMetaJsonlFromStorage } from '../../lib/adminHelpers'

export default function AdminMetaStoragePage() {
  const [entries, setEntries] = useState<StorageMetaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    listStorageMetasApi().then(({ data, error: err }) => {
      if (err || !data) {
        setError(err ?? '목록 조회 실패')
      } else {
        setEntries(data)
      }
      setLoading(false)
    })
  }, [])

  async function handleDownload(entry: StorageMetaEntry) {
    if (downloadingPath) return
    setDownloadingPath(entry.path)
    const { error: dlErr } = await downloadMetaJsonlFromStorage(entry.path, `${entry.batchId}.jsonl`)
    if (dlErr) alert(`다운로드 실패: ${dlErr}`)
    setDownloadingPath(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: '#1337ec' }}>progress_activity</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    )
  }

  // userId별 그룹핑
  const byUser = new Map<string, StorageMetaEntry[]>()
  for (const e of entries) {
    const list = byUser.get(e.userId) ?? []
    list.push(e)
    byUser.set(e.userId, list)
  }

  return (
    <div className="p-4 space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: '전체 파일', value: entries.length.toLocaleString(), color: '#1337ec' },
          { label: '유저 수', value: byUser.size.toLocaleString(), color: '#22c55e' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* 파일 목록 */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th className="text-left p-3 font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>User ID</th>
              <th className="text-left p-3 font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Batch ID</th>
              <th className="text-right p-3 font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.path} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="p-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {entry.userId.slice(0, 8)}...
                </td>
                <td className="p-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {entry.batchId}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleDownload(entry)}
                    disabled={downloadingPath === entry.path}
                    className="px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#1337ec' }}
                  >
                    {downloadingPath === entry.path ? '...' : '다운로드'}
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Meta JSONL 파일이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
