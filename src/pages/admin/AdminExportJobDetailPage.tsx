import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getExportJob, saveExportJob, confirmJobLedgerEntries, loadLedgerEntries, appendJobLog } from '../../lib/adminStore'
import { type ExportJob } from '../../types/admin'
import JobLogTimeline from '../../components/domain/JobLogTimeline'

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  draft: { text: '초안', color: '#6b7280' },
  queued: { text: '대기', color: '#3b82f6' },
  running: { text: '실행 중', color: '#f59e0b' },
  completed: { text: '완료', color: '#22c55e' },
  failed: { text: '실패', color: '#ef4444' },
  cancelled: { text: '취소', color: '#6b7280' },
  delivered: { text: '납품 확정', color: '#8b5cf6' },
}

export default function AdminExportJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<ExportJob | null>(null)
  const [loading, setLoading] = useState(true)

  // 납품 확정
  const [paymentAmount, setPaymentAmount] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<string | null>(null)
  const [ledgerCount, setLedgerCount] = useState<number | null>(null)

  useEffect(() => {
    if (!jobId) return
    getExportJob(jobId).then(j => { setJob(j); setLoading(false) }).catch(() => setLoading(false))
  }, [jobId])

  // 해당 job의 ledger entry 수 로드
  useEffect(() => {
    if (!jobId) return
    loadLedgerEntries({ exportJobId: jobId }).then(entries => setLedgerCount(entries.length))
  }, [jobId, confirmResult])

  async function handleConfirmDelivery() {
    if (!job || !jobId) return
    const amount = parseInt(paymentAmount.replace(/,/g, ''))
    if (isNaN(amount) || amount <= 0) return

    setConfirming(true)
    try {
      // 1. Ledger entries: estimated → confirmed (비례 배분)
      const updatedCount = await confirmJobLedgerEntries(jobId, amount)

      // 2. Export Job 상태 → delivered
      const updatedJob: ExportJob = { ...job, status: 'delivered', completedAt: new Date().toISOString() }
      await saveExportJob(updatedJob)

      // 3. 로그 추가
      await appendJobLog(jobId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `납품 확정: ₩${amount.toLocaleString()} (${updatedCount}건 ledger confirmed)`,
      })

      setJob({ ...updatedJob, logs: [...updatedJob.logs, { timestamp: new Date().toISOString(), level: 'info', message: `납품 확정: ₩${amount.toLocaleString()}` }] })
      setConfirmResult(`${updatedCount}건 원장 확정 완료 (₩${amount.toLocaleString()})`)
    } catch (err) {
      console.error('Confirm delivery error:', err)
      setConfirmResult('확정 처리 실패')
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-4xl">error_outline</span>
        <p className="text-sm mt-2">작업을 찾을 수 없습니다</p>
        <button onClick={() => navigate('/admin/jobs')} className="text-xs mt-3 underline" style={{ color: '#1337ec' }}>
          목록으로
        </button>
      </div>
    )
  }

  const statusInfo = STATUS_LABELS[job.status] ?? STATUS_LABELS.draft

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {job.id}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color }}
          >
            {statusInfo.text}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>SKU</p>
            <p className="text-white font-medium">{job.skuId}</p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>컴포넌트</p>
            <p className="text-white font-medium">{job.componentIds.join(', ')}</p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>요청 유닛</p>
            <p className="text-white font-medium">{job.requestedUnits.toLocaleString()}</p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>실제 유닛</p>
            <p className="text-white font-medium">{job.actualUnits.toLocaleString()}</p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>샘플링</p>
            <p className="text-white font-medium">{job.samplingStrategy}</p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>포맷</p>
            <p className="text-white font-medium">{job.outputFormat}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t text-xs space-y-1" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)' }}>생성: {job.createdAt}</p>
          {job.startedAt && <p style={{ color: 'rgba(255,255,255,0.4)' }}>시작: {job.startedAt}</p>}
          {job.completedAt && <p style={{ color: 'rgba(255,255,255,0.4)' }}>완료: {job.completedAt}</p>}
        </div>

        {job.errorMessage && (
          <div className="mt-3 p-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {job.errorMessage}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
        <h3 className="text-xs font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>필터 조건</h3>
        <div className="flex flex-wrap gap-1.5">
          {job.filters.minQualityGrade && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
              최소 {job.filters.minQualityGrade}등급
            </span>
          )}
          {job.filters.requireConsent && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
              동의 필수
            </span>
          )}
          {job.filters.requirePiiCleaned && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
              PII 정제 필수
            </span>
          )}
          {job.filters.qualityTier && job.filters.qualityTier.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
              티어: {job.filters.qualityTier.join(', ')}
            </span>
          )}
          {job.filters.dateRange && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
              {job.filters.dateRange.from} ~ {job.filters.dateRange.to}
            </span>
          )}
        </div>
      </div>

      {/* Selection manifest */}
      {job.selectionManifest && (
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>선택 매니페스트</h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {job.selectionManifest.length.toLocaleString()}개 유닛 선택됨
          </p>
        </div>
      )}

      {/* 납품 확정 섹션 */}
      {(job.status === 'completed' || job.status === 'draft') && (
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>납품 확정</h3>
          {ledgerCount !== null && (
            <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              연결된 원장: {ledgerCount}건 {ledgerCount === 0 && '(원장 미생성 — 빌드 재실행 필요)'}
            </p>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>수령 금액 (₩)</p>
              <input
                type="text"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                placeholder="5,000,000"
                className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                style={{ backgroundColor: '#0d0f1a', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <button
              onClick={handleConfirmDelivery}
              disabled={confirming || !paymentAmount || (ledgerCount !== null && ledgerCount === 0)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-30"
              style={{ backgroundColor: '#8b5cf6' }}
            >
              {confirming ? '처리 중...' : '확정'}
            </button>
          </div>
          {confirmResult && (
            <p className="text-xs mt-2" style={{ color: confirmResult.includes('실패') ? '#ef4444' : '#22c55e' }}>
              {confirmResult}
            </p>
          )}
        </div>
      )}

      {job.status === 'delivered' && (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
          <p className="text-xs" style={{ color: '#8b5cf6' }}>
            납품 확정 완료 — 정산 페이지에서 withdrawable 전환 가능
          </p>
        </div>
      )}

      {/* Logs */}
      {job.logs.length > 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>로그</h3>
          <JobLogTimeline logs={job.logs} />
        </div>
      )}
    </div>
  )
}
