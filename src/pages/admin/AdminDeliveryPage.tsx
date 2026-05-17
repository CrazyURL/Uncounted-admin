import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { BigStat, Button, EmptyState, ErrorBanner } from '../../components/ui'
import { FilterChips, type FilterChip } from '../../components/domain/FilterChips'
import { DownloadModal } from '../../components/domain/DownloadModal'
import { fetchPackages, fetchPackageDownloadUrl } from '../../lib/api/delivery'
import type { DeliveryPackage, PackageStatus } from '../../types/delivery'

const STATUS_LABEL: Record<PackageStatus, string> = {
  building: '빌드중',
  pending: '대기',
  complete: '준비됨',
  archived: '납품완료',
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_TONE: Record<PackageStatus, BadgeTone> = {
  building: 'accent',
  pending: 'warning',
  complete: 'success',
  archived: 'neutral',
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

type FilterId = 'all' | PackageStatus

const FILTER_CHIPS: FilterChip[] = [
  { id: 'all', label: '전체' },
  { id: 'building', label: '빌드중' },
  { id: 'pending', label: '대기' },
  { id: 'complete', label: '준비됨' },
  { id: 'archived', label: '납품완료' },
]

export default function AdminDeliveryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterParam = (searchParams.get('status') ?? 'all') as FilterId

  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloadTarget, setDownloadTarget] = useState<DeliveryPackage | null>(null)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchPackages()
    if (res.error) setError(res.error)
    else setPackages(res.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (filterParam === 'all') return packages
    return packages.filter((p) => p.status === filterParam)
  }, [packages, filterParam])

  const chipsWithCount: FilterChip[] = useMemo(() => {
    const counts: Partial<Record<FilterId, number>> = { all: packages.length }
    for (const p of packages) counts[p.status] = (counts[p.status] ?? 0) + 1
    return FILTER_CHIPS.map((c) => ({ ...c, count: counts[c.id as FilterId] }))
  }, [packages])

  const kpi = useMemo(() => ({
    total: packages.length,
    ready: packages.filter((p) => p.status === 'complete').length,
    archived: packages.filter((p) => p.status === 'archived').length,
    totalDuration: packages.reduce((s, p) => s + p.duration_seconds, 0),
  }), [packages])

  const isAllSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))

  function toggleAll() {
    if (isAllSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((p) => p.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleFilterChange(id: string) {
    const next = new URLSearchParams(searchParams)
    if (id === 'all') next.delete('status')
    else next.set('status', id)
    setSearchParams(next, { replace: true })
    setSelected(new Set())
  }

  async function handleDownloadSelected() {
    const completePkgs = filtered.filter((p) => selected.has(p.id) && p.status === 'complete')
    if (completePkgs.length === 0) return
    setDownloading(true)
    const results = await Promise.all(completePkgs.map((p) => fetchPackageDownloadUrl(p.id)))
    setDownloading(false)
    const firstError = results.find((r) => r.error)
    if (firstError) {
      setError(`다운로드 링크 생성 실패: ${firstError.error}`)
      return
    }
    for (const r of results) {
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer')
    }
    setSelected(new Set())
  }

  const selectedCount = selected.size
  const selectedItems = filtered.filter((p) => selected.has(p.id))
  const selectedComplete = selectedItems.filter((p) => p.status === 'complete')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <h1 className="text-lg font-semibold text-txt mb-4">납품 패키지</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
          <BigStat title="전체 패키지" value={String(kpi.total)} />
          <BigStat
            title="준비됨"
            value={String(kpi.ready)}
            tone={kpi.ready > 0 ? 'warning' : undefined}
          />
          <BigStat title="납품완료" value={String(kpi.archived)} />
          <BigStat title="누적 시간" value={formatDuration(kpi.totalDuration)} />
        </div>

        <FilterChips
          chips={chipsWithCount}
          active={filterParam}
          onChange={handleFilterChange}
        />
      </div>

      {error && (
        <div className="px-6 pb-2">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-txt-sub text-sm">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="inventory_2" title="패키지 없음" description="해당 상태의 납품 패키지가 없습니다." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-txt-sub">
                <th className="pb-2 pr-3 w-8">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleAll}
                    className="accent-accent"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="pb-2 pr-4 font-medium">패키지 번호</th>
                <th className="pb-2 pr-4 font-medium">세션</th>
                <th className="pb-2 pr-4 font-medium">시간</th>
                <th className="pb-2 pr-4 font-medium">크기</th>
                <th className="pb-2 pr-4 font-medium">상태</th>
                <th className="pb-2 font-medium">생성일</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((pkg) => (
                <tr
                  key={pkg.id}
                  className="border-b border-border-light hover:bg-surface-alt transition-colors"
                >
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      checked={selected.has(pkg.id)}
                      onChange={() => toggleOne(pkg.id)}
                      className="accent-accent"
                      aria-label={`${pkg.package_number} 선택`}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-medium text-txt">{pkg.package_number}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-txt">
                    {pkg.session_count.toLocaleString()}건
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-txt">
                    {formatDuration(pkg.duration_seconds)}
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-txt-sub">
                    {pkg.size_bytes ? formatBytes(pkg.size_bytes) : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={STATUS_TONE[pkg.status]}>{STATUS_LABEL[pkg.status]}</Badge>
                  </td>
                  <td className="py-3 text-txt-sub">
                    {new Date(pkg.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="py-3 text-right">
                    {pkg.status === 'complete' && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setDownloadTarget(pkg)}
                      >
                        다운로드
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedCount > 0 && (
        <div
          className="flex-shrink-0 border-t border-border px-6 py-3 flex items-center justify-between"
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
          <span className="text-sm text-txt-sub">
            {selectedCount}개 선택됨
            {selectedItems.length > 0 && (
              <span className="ml-2 text-txt-tertiary">
                ({selectedItems.reduce((s, p) => s + p.session_count, 0).toLocaleString()}건)
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              선택 해제
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadSelected}
              disabled={downloading || selectedComplete.length === 0}
            >
              {downloading ? '준비중…' : `선택 다운로드 (${selectedComplete.length}건)`}
            </Button>
          </div>
        </div>
      )}

      <DownloadModal
        open={downloadTarget !== null}
        pkg={downloadTarget}
        onClose={() => setDownloadTarget(null)}
      />
    </div>
  )
}
