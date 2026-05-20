import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { fetchPackageDownloadUrl } from '../../lib/api/delivery'
import type { DeliveryPackage } from '../../types/delivery'

interface DownloadModalProps {
  open: boolean
  pkg: DeliveryPackage | null
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function DownloadModal({ open, pkg, onClose }: DownloadModalProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !pkg) {
      setDownloadUrl(null)
      setUrlError(null)
      return
    }
    setUrlLoading(true)
    setUrlError(null)
    fetchPackageDownloadUrl(pkg.id).then((res) => {
      setUrlLoading(false)
      if (res.error) setUrlError(res.error)
      else setDownloadUrl(res.url ?? null)
    })
  }, [open, pkg?.id])

  if (!pkg) return null

  function handleDownload() {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="납품 패키지 다운로드"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!downloadUrl || urlLoading}>
            {urlLoading ? '준비중…' : '다운로드'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-txt-sub">패키지 번호</span>
          <span className="font-medium text-txt">{pkg.package_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-txt-sub">세션 수</span>
          <span className="tabular-nums text-txt">{pkg.session_count.toLocaleString()}건</span>
        </div>
        {pkg.size_bytes && (
          <div className="flex justify-between">
            <span className="text-txt-sub">파일 크기</span>
            <span className="tabular-nums text-txt">{formatBytes(pkg.size_bytes)}</span>
          </div>
        )}
        {urlError && (
          <p className="text-xs text-danger">{urlError}</p>
        )}
      </div>
    </Modal>
  )
}
