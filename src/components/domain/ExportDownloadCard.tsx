import { downloadExportRequest } from '../../lib/adminStore'

interface ExportDownloadCardProps {
  jobId: string
  skuId: string
  utteranceCount: number
  estimatedSizeMb?: number
  onNavigate?: () => void
}

export default function ExportDownloadCard({
  jobId,
  skuId,
  utteranceCount,
  estimatedSizeMb,
  onNavigate,
}: ExportDownloadCardProps) {
  const sizeMb = estimatedSizeMb ?? utteranceCount * 0.8

  const handleDownload = async () => {
    try {
      const { downloadUrl } = await downloadExportRequest(jobId)
      const dateStr = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `export_${skuId}_${dateStr}.zip`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      alert('다운로드에 실패했습니다')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#1b1e2e' }}>
        <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: '#22c55e' }}>package_2</span>
        <p className="text-sm font-medium text-white mb-1">패키징 완료</p>
        <p className="text-[10px] mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>다운로드 준비가 완료되었습니다</p>

        <div className="rounded-lg p-4 text-left space-y-2 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>파일명</span>
            <span className="text-white font-mono">export_{skuId}_{new Date().toISOString().slice(0, 10)}.zip</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>크기</span>
            <span className="text-white">~{sizeMb.toFixed(1)} MB (추정)</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>포맷</span>
            <span className="text-white">WAV + JSONL manifest</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>발화 수</span>
            <span className="text-white">{utteranceCount}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>SKU</span>
            <span className="text-white">{skuId}</span>
          </div>
        </div>

        <button
          onClick={handleDownload}
          className="text-xs px-6 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: '#22c55e' }}
        >
          <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>download</span>
          ZIP 다운로드
        </button>
      </div>

      {onNavigate && (
        <button
          onClick={onNavigate}
          className="w-full text-xs py-2 rounded-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
        >
          작업 목록으로
        </button>
      )}
    </div>
  )
}
