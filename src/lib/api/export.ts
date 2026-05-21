// ── v2 Export API ──────────────────────────────────────────────────────
// SPEC_EXPORT_V2.md §6.1 / §6.3.
//   - POST /api/admin/export/sessions/:id
//       reference_only → 동기, { download_url, expires_at, size_bytes_estimate }
//       embedded       → 비동기 job, { job_id, status }
//   - GET  /api/admin/export/jobs/:id  (embedded job 폴링)

import { apiFetch } from './client'

const usesMock = import.meta.env.VITE_USE_MOCK === 'true'

export type AudioExportMode = 'reference_only' | 'embedded'

export interface ExportSessionV2Data {
  download_url: string
  expires_at: string
  size_bytes_estimate: number
}

export interface ExportV2JobCreated {
  job_id: string
  status: 'queued'
}

export type ExportV2JobStatus = 'queued' | 'packaging' | 'ready' | 'failed'

export interface ExportV2Job {
  id: string
  status: ExportV2JobStatus
  audio_export_mode: AudioExportMode
  packaging_stage?: string | null
  size_bytes?: number | null
  error_message?: string | null
  download_url?: string | null
  expires_at?: string | null
}

export interface ExportSessionV2Options {
  /** 'reference_only'(기본, 동기) | 'embedded'(WAV 동봉, 비동기 job) */
  audio_export_mode?: AudioExportMode
  include_restricted?: boolean
}

/**
 * v2 단건 export — POST /api/admin/export/sessions/:id
 *
 * 외부 계약은 audio_export_mode 만 (include_audio 미사용).
 * reference_only → { data: { download_url, expires_at, size_bytes_estimate } }
 * embedded       → { data: { job_id, status } } (이후 pollExportV2Job 으로 폴링)
 */
export async function exportSessionV2(
  sessionId: string,
  options: ExportSessionV2Options = {},
): Promise<{ data?: ExportSessionV2Data | ExportV2JobCreated; error?: string }> {
  const mode: AudioExportMode = options.audio_export_mode === 'embedded' ? 'embedded' : 'reference_only'

  if (usesMock) {
    if (mode === 'embedded') {
      return { data: { job_id: `mock-job-${sessionId}`, status: 'queued' } }
    }
    return {
      data: {
        download_url: `https://example.invalid/mock-export-${sessionId}.zip`,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        size_bytes_estimate: 104_857_600,
      },
    }
  }

  return apiFetch<ExportSessionV2Data | ExportV2JobCreated>(
    `/api/admin/export/sessions/${sessionId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        audio_export_mode: mode,
        // embedded 는 서버가 include_restricted 를 강제 false 처리 (보정 #1).
        include_restricted: mode === 'embedded' ? false : options.include_restricted ?? false,
      }),
    },
  )
}

/**
 * embedded export job 상태 폴링 — GET /api/admin/export/jobs/:id
 * 기존 pollExportJob / waitForExportJobReady 와는 엔드포인트·status enum 이 달라 별도 함수.
 */
export async function pollExportV2Job(
  jobId: string,
): Promise<{ data?: ExportV2Job; error?: string }> {
  if (usesMock) {
    return {
      data: {
        id: jobId,
        status: 'ready',
        audio_export_mode: 'embedded',
        size_bytes: 104_857_600,
        download_url: `https://example.invalid/mock-export-${jobId}.zip`,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      },
    }
  }

  return apiFetch<ExportV2Job>(`/api/admin/export/jobs/${jobId}`, { method: 'GET' })
}

export function isExportV2JobCreated(
  data: ExportSessionV2Data | ExportV2JobCreated | undefined,
): data is ExportV2JobCreated {
  return !!data && 'job_id' in data
}
