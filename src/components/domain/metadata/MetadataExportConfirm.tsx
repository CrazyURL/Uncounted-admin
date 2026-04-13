import { useState, useEffect } from 'react'
import {
  type CreateMetadataExportRequest,
  type MetadataExportJob,
  createMetadataExport,
  fetchMetadataExportDownload,
  fetchMetadataPreview,
} from '../../../lib/api/admin'
import type { MetadataFilterState } from './MetadataQualityFilter'
import LoadingOverlay from '../../common/LoadingOverlay'

interface MetadataExportConfirmProps {
  selectedSchemaIds: string[]
  filter: MetadataFilterState
  totalEvents: number
  deviceCount: number
  period: string
  clientName?: string
}

export default function MetadataExportConfirm({
  selectedSchemaIds,
  filter,
  totalEvents,
  deviceCount,
  period,
  clientName: clientNameProp,
}: MetadataExportConfirmProps) {
  const [job, setJob] = useState<MetadataExportJob | null>(null)
  const [clientName, setClientName] = useState(clientNameProp ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [actualTotal, setActualTotal] = useState<number | null>(null)

  // 날짜/디바이스 필터가 있으면 preview API로 실제 건수 조회
  useEffect(() => {
    const hasDateFilter = filter.dateFrom || filter.dateTo
    if (!hasDateFilter || selectedSchemaIds.length === 0) {
      setActualTotal(null)
      return
    }
    fetchMetadataPreview(selectedSchemaIds[0], {
      limit: 1,
      offset: 0,
      dateFrom: filter.dateFrom || undefined,
      dateTo: filter.dateTo || undefined,
      pseudoId: filter.selectedPseudoIds[0] || undefined,
    }).then(({ data }) => {
      if (data) setActualTotal(data.total)
    })
  }, [selectedSchemaIds, filter.dateFrom, filter.dateTo, filter.selectedPseudoIds])

  const displayEvents = actualTotal !== null ? actualTotal : totalEvents

  const handleExport = async () => {
    if (!clientName.trim()) {
      setError('클라이언트명을 입력해주세요')
      return
    }

    setSubmitting(true)
    setError(null)

    const filters: CreateMetadataExportRequest['filters'] = {}
    if (filter.selectedPseudoIds.length > 0) filters.pseudoIds = filter.selectedPseudoIds
    if (filter.dateFrom) filters.dateFrom = filter.dateFrom
    if (filter.dateTo) filters.dateTo = filter.dateTo
    if (filter.excludeSparse) filters.excludeQuality = 'sparse'
    if (filter.excludeStaleDevices) filters.excludeStaleDevices = true

    const request: CreateMetadataExportRequest = {
      schemaIds: selectedSchemaIds,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      clientName: clientName.trim(),
    }

    const { data, error: err } = await createMetadataExport(request)
    setSubmitting(false)

    if (err || !data) {
      setError(err ?? '추출 요청 실패')
      return
    }

    setJob(data)
    if (data.status === 'failed') {
      setError(data.error ?? '추출 실패')
    }
  }

  const handleDownload = async () => {
    if (!job) return
    setDownloading(true)

    const { data, error: err } = await fetchMetadataExportDownload(job.jobId)
    setDownloading(false)

    if (err || !data) {
      setError(err ?? '다운로드 URL 조회 실패')
      return
    }

    window.open(data.downloadUrl, '_blank')
  }

  const handleReset = () => {
    setJob(null)
    setError(null)
    setClientName(clientNameProp ?? '')
  }

  // Pre-export summary
  if (!job) {
    return (
      <>
        <LoadingOverlay isVisible={submitting} message="패키지 생성 중입니다..." />
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#1b1e2e' }}>
        <h3 className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
          패키지 확정
        </h3>

        {/* Summary */}
        <div
          className="rounded-lg p-3 grid grid-cols-3 gap-2 text-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          <div>
            <p className="text-sm font-bold font-mono" style={{ color: '#8b5cf6' }}>
              {displayEvents.toLocaleString()}
            </p>
            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>포함 이벤트</p>
          </div>
          <div>
            <p className="text-sm font-bold font-mono" style={{ color: '#22c55e' }}>
              {deviceCount}
            </p>
            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>디바이스</p>
          </div>
          <div>
            <p className="text-sm font-bold font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {period || '-'}
            </p>
            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>수집 기간</p>
          </div>
        </div>

        {/* Filter summary chips */}
        <div className="flex flex-wrap gap-1">
          {selectedSchemaIds.map(id => (
            <span
              key={id}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}
            >
              {id.replace(/-v\d+$/, '')}
            </span>
          ))}
          {filter.excludeSparse && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }}
            >
              sparse 제외
            </span>
          )}
          {filter.excludeStaleDevices && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }}
            >
              stale 제외
            </span>
          )}
          {filter.dateFrom && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            >
              {filter.dateFrom}~
            </span>
          )}
          {filter.dateTo && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            >
              ~{filter.dateTo}
            </span>
          )}
        </div>

        {/* Client name input — hidden when passed via prop (wizard Step 0) */}
        {!clientNameProp && (
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              클라이언트명
            </label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="납품 대상 클라이언트명 입력"
              className="w-full rounded-lg px-3 py-1.5 text-xs"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
          </div>
        )}

        {displayEvents === 0 && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(234,179,8,0.1)' }}>
            <p className="text-xs" style={{ color: '#eab308' }}>
              현재 필터 조건에 해당하는 이벤트가 없습니다. 필터를 조정해주세요.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
        )}

        <button
          onClick={handleExport}
          disabled={submitting || selectedSchemaIds.length === 0 || displayEvents === 0}
          className="w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-40"
          style={{
            backgroundColor: '#8b5cf6',
            color: '#fff',
          }}
        >
          패키지 확정
        </button>
      </div>
      </>
    )
  }

  // Job result view (synchronous — already ready or failed)
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#1b1e2e' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
          추출 결과
        </h3>
        <StatusBadge status={job.status} />
      </div>

      {/* Result info */}
      <div
        className="rounded-lg p-3 grid grid-cols-2 gap-2 text-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      >
        <div>
          <p className="text-sm font-bold font-mono" style={{ color: '#8b5cf6' }}>
            {(job.totalEvents ?? 0).toLocaleString()}
          </p>
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>총 이벤트</p>
        </div>
        <div>
          <p className="text-sm font-bold font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {job.storagePath ? job.storagePath.split('/').pop() : '-'}
          </p>
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>저장 경로</p>
        </div>
      </div>

      {/* Error */}
      {job.status === 'failed' && (
        <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
          <p className="text-xs" style={{ color: '#ef4444' }}>
            {job.error ?? '추출 실패'}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {/* Download / Reset buttons */}
      <div className="flex gap-2">
        {job.status === 'ready' && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#22c55e', color: '#fff' }}
          >
            {downloading ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                준비 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">download</span>
                다운로드
              </>
            )}
          </button>
        )}
        <button
          onClick={handleReset}
          className="rounded-lg py-2 px-4 text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          초기화
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: MetadataExportJob['status'] }) {
  const config: Record<string, { bg: string; fg: string; label: string }> = {
    ready: { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e', label: '완료' },
    failed: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', label: '실패' },
  }
  const c = config[status] ?? config.ready
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  )
}
