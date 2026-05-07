import { useEffect, useState, useRef } from 'react'
import {
  type MetadataEventEntry,
  type MetadataSummary,
  fetchMetadataSummary,
  fetchMetadataEvents,
} from '../../lib/api/admin'

const SCHEMA_LABELS: Record<string, string> = {
  'U-M05-v1': 'M05 디바이스',
  'U-M06-v1': 'M06 오디오환경',
  'U-M07-v1': 'M07 통화패턴',
  'U-M08-v1': 'M08 화면패턴',
  'U-M09-v1': 'M09 배터리',
  'U-M10-v1': 'M10 네트워크',
  'U-M11-v1': 'M11 활동상태',
  'U-M13-v1': 'M13 조도',
  'U-M14-v1': 'M14 모션',
  'U-M16-v1': 'M16 앱수명',
  'U-M18-v1': 'M18 미디어',
  'U-P01-v1': 'P01 사진패턴',
}

const PAGE_SIZE = 50

export default function AdminMetaStoragePage() {
  const [summary, setSummary] = useState<MetadataSummary | null>(null)
  const [events, setEvents] = useState<MetadataEventEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [schemaFilter, setSchemaFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const hasLoadedRef = useRef(false)

  // 요약 로드 (최초 1회)
  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    fetchMetadataSummary().then(({ data, error: err }) => {
      if (err || !data) {
        setError(err ?? '요약 조회 실패')
      } else {
        setSummary(data)
      }
    })
  }, [])

  // 이벤트 목록 로드 (필터/페이지 변경 시)
  useEffect(() => {
    setLoading(true)
    fetchMetadataEvents({
      schema: schemaFilter || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }).then((res) => {
      if (res.error || !res.data) {
        setError(res.error ?? '이벤트 조회 실패')
      } else {
        setEvents(res.data)
        // 서버는 { data, total }을 반환 — apiFetch가 전체 JSON을 그대로 전달
        setTotal((res as Record<string, unknown>).total as number ?? 0)
      }
      setLoading(false)
    })
  }, [schemaFilter, page])

  function handleSchemaChange(schema: string) {
    setSchemaFilter(schema)
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (error && !summary) {
    return (
      <div className="p-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: '전체 이벤트', value: summary?.totalEvents?.toLocaleString() ?? '-', color: 'var(--color-accent)' },
          { label: '유저 수', value: summary?.uniqueUsers?.toLocaleString() ?? '-', color: '#22c55e' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* 스키마별 뱃지 */}
      {summary && summary.bySchema.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.bySchema.map(s => (
            <button
              key={s.schemaId}
              onClick={() => handleSchemaChange(schemaFilter === s.schemaId ? '' : s.schemaId)}
              className="px-2 py-1 rounded-lg text-[11px] font-mono transition-colors"
              style={{
                backgroundColor: schemaFilter === s.schemaId ? 'rgba(19,55,236,0.3)' : 'var(--color-surface-alt)',
                color: schemaFilter === s.schemaId ? 'var(--color-accent)' : 'var(--color-text-sub)',
                border: schemaFilter === s.schemaId ? '1px solid rgba(19,55,236,0.4)' : '1px solid transparent',
              }}
            >
              {SCHEMA_LABELS[s.schemaId] ?? s.schemaId} ({s.count})
            </button>
          ))}
        </div>
      )}

      {/* 이벤트 테이블 */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--color-text-sub)' }}>Schema</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--color-text-sub)' }}>Pseudo ID</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--color-text-sub)' }}>Date</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--color-text-sub)' }}>주요 필드</th>
              <th className="text-right p-3 font-medium" style={{ color: 'var(--color-text-sub)' }}>수신일시</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: 'var(--color-accent)' }}>progress_activity</span>
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  메타데이터 이벤트가 없습니다
                </td>
              </tr>
            ) : (
              events.map(ev => (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td className="p-3">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                      style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: 'var(--color-accent)' }}
                    >
                      {SCHEMA_LABELS[ev.schema_id] ?? ev.schema_id}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: 'var(--color-text-sub)' }}>
                    {ev.pseudo_id.slice(0, 8)}...
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: 'var(--color-text-sub)' }}>
                    {ev.date_bucket ?? '-'}
                  </td>
                  <td className="p-3 text-xs" style={{ color: 'var(--color-text-sub)' }}>
                    <PayloadPreview payload={ev.payload} schemaId={ev.schema_id} />
                  </td>
                  <td className="p-3 text-right text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatDate(ev.received_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded text-xs disabled:opacity-30"
            style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)' }}
          >
            이전
          </button>
          <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 rounded text-xs disabled:opacity-30"
            style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)' }}
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}

// ── 헬퍼 컴포넌트 ──────────────────────────────────────────────────────

function PayloadPreview({ payload, schemaId }: { payload: Record<string, unknown>; schemaId: string }) {
  if (schemaId === 'U-M07-v1') {
    return <span>{payload.dayOfWeek as string} {payload.timeBucket as string} / freq:{payload.callFrequencyBucket as string} / in:{String(payload.incomingRatio)}</span>
  }
  if (schemaId === 'U-M08-v1') {
    return <span>{payload.timeBucket as string} / freq:{payload.frequencyBucket as string}</span>
  }
  if (schemaId === 'U-M09-v1') {
    return <span>{payload.eventType as string} / bat:{payload.batteryLevelBucket as string}</span>
  }
  if (schemaId === 'U-M14-v1') {
    return <span>{payload.dominantOrientation as string} / int:{payload.avgIntensityBucket as string}</span>
  }

  // 기본: 키 수만 표시
  const keys = Object.keys(payload).filter(k => k !== 'schema' && k !== 'pseudoId')
  return <span className="opacity-50">{keys.length} fields</span>
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hour}:${min}`
  } catch {
    return iso.slice(0, 16)
  }
}
