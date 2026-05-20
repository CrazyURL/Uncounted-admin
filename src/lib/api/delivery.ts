import { apiFetch } from './client'
import type { DeliveryPackage, ExportJobV2 } from '../../types/delivery'

const usesMock = import.meta.env.VITE_USE_MOCK === 'true'

interface PaginationMeta {
  total: number
  page: number
  limit: number
}

const MOCK_PACKAGES: DeliveryPackage[] = [
  {
    id: 'pkg-001',
    package_number: 'PKG-2026-001',
    filename: 'delivery_PKG-2026-001.zip',
    storage_path: 's3://uncounted-exports/pkg-001.zip',
    status: 'complete',
    duration_seconds: 7200,
    duration_minutes: 120,
    billable_hours: 2,
    session_count: 3,
    utterance_count: 487,
    size_bytes: 314572800,
    created_at: '2026-05-15T09:00:00Z',
    completed_at: '2026-05-15T09:45:00Z',
  },
  {
    id: 'pkg-002',
    package_number: 'PKG-2026-002',
    filename: 'delivery_PKG-2026-002.zip',
    storage_path: '',
    status: 'pending',
    duration_seconds: 3600,
    duration_minutes: 60,
    billable_hours: 1,
    session_count: 2,
    utterance_count: 231,
    created_at: '2026-05-16T14:00:00Z',
  },
]

const MOCK_JOBS: Record<string, ExportJobV2> = {
  'job-001': {
    id: 'job-001',
    type: 'batch_session',
    status: 'processing',
    progress: 42,
    created_at: '2026-05-16T14:05:00Z',
  },
}

export async function fetchPackages(): Promise<{ data?: DeliveryPackage[]; meta?: PaginationMeta; error?: string }> {
  if (usesMock) return { data: MOCK_PACKAGES }
  const res = await apiFetch<{ data: DeliveryPackage[]; meta: PaginationMeta }>('/api/admin/delivery/packages')
  if (res.error) return { error: res.error }
  return { data: res.data?.data ?? [], meta: res.data?.meta }
}

export async function fetchPackageDownloadUrl(packageId: string): Promise<{ url?: string; error?: string }> {
  if (usesMock) return { url: `https://example.com/mock-download/${packageId}.zip` }
  const res = await apiFetch<{ url: string; expiresIn: number }>(`/api/admin/delivery/packages/${packageId}/download`)
  if (res.error) return { error: res.error }
  return { url: res.data?.url }
}

export async function exportSingleSession(sessionId: string): Promise<{ jobId?: string; error?: string }> {
  if (usesMock) return { jobId: `job-mock-${Date.now()}` }
  const res = await apiFetch<{ jobId: string }>(`/api/admin/sessions/${sessionId}/export`, { method: 'POST' })
  if (res.error) return { error: res.error }
  return { jobId: res.data?.jobId }
}

export async function exportBatch(sessionIds: string[]): Promise<{ jobId?: string; error?: string }> {
  if (usesMock) return { jobId: `job-mock-${Date.now()}` }
  const res = await apiFetch<{ jobId: string }>('/api/admin/sessions/export-batch', {
    method: 'POST',
    body: JSON.stringify({ session_ids: sessionIds }),
  })
  if (res.error) return { error: res.error }
  return { jobId: res.data?.jobId }
}

export async function pollExportJob(jobId: string): Promise<{ data?: ExportJobV2; error?: string }> {
  if (usesMock) {
    const job = MOCK_JOBS[jobId]
    if (!job) return { error: '작업을 찾을 수 없습니다' }
    return { data: job }
  }
  const res = await apiFetch<{ data: ExportJobV2; downloadUrl: string | null }>(`/api/admin/export-jobs-v2/${jobId}`)
  if (res.error) return { error: res.error }
  if (!res.data) return { error: '응답 없음' }
  return {
    data: {
      ...res.data.data,
      download_url: res.data.downloadUrl ?? undefined,
    },
  }
}
