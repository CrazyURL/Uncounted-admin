// 저품질(C) 검수 큐 리포트 카드 — 세션 범위 C등급 처리 현황 + 최종 납품 포함/제외.
// 백엔드: GET /api/admin/quality-review/report (PR2).

import { useCallback, useEffect, useState } from 'react'
import { fetchQualityReviewReport, type QualityReviewReport } from '../../lib/api/utterances'

interface Props {
  sessionId: string
  /** 외부에서 판정이 바뀌면 증가시켜 재조회 트리거 */
  refreshKey?: number
}

export function QualityReviewReportCard({ sessionId, refreshKey = 0 }: Props) {
  const [report, setReport] = useState<QualityReviewReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchQualityReviewReport({ sessionId })
    setLoading(false)
    if (res.error || !res.data) {
      setError(res.error ?? '집계 실패')
      return
    }
    setReport(res.data)
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  // C등급 발화가 없으면 카드 숨김 (검수 대상 아님)
  if (!loading && !error && report && report.totalCUtterances === 0) return null

  return (
    <div className="px-4 py-3 bg-surface border-b border-border-light">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-txt">저품질(C) 처리 현황</span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs px-1.5 py-0.5 rounded border border-border-soft hover:bg-bg-hover text-txt-sub disabled:opacity-40"
        >
          {loading ? '집계 중…' : '새로고침'}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {report && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
          <Stat label="C등급 발화" value={report.totalCUtterances} />
          <Stat label="제외" value={report.excludedCount} tone="red" />
          <Stat label="예외 포함" value={report.approvedExceptionCount} tone="emerald" />
          <Stat label="자막 수정" value={report.transcriptEditCount} tone="orange" />
          <Stat label="PII 처리" value={report.piiMaskingCount} tone="purple" />
          <Stat label="재처리" value={report.retranscriptionCount} tone="blue" />
          <Stat label="미검수" value={report.pendingCount} />
          <Stat label="최종 납품 포함" value={report.finalIncludedUtterances} tone="emerald" />
          <Stat label="최종 제외" value={report.finalExcludedUtterances} tone="red" />
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'red' | 'emerald' | 'orange' | 'purple' | 'blue'
}) {
  const toneCls =
    tone === 'red'
      ? 'text-red-700'
      : tone === 'emerald'
        ? 'text-emerald-700'
        : tone === 'orange'
          ? 'text-orange-700'
          : tone === 'purple'
            ? 'text-purple-700'
            : tone === 'blue'
              ? 'text-blue-700'
              : 'text-txt'
  return (
    <div className="rounded border border-border-light bg-surface-alt px-2 py-1.5">
      <div className="text-txt-sub">{label}</div>
      <div className={['font-semibold tabular-nums', toneCls].join(' ')}>{value}</div>
    </div>
  )
}
