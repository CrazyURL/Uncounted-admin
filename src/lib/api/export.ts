// ── v2 Export API ──────────────────────────────────────────────────────
// 창 E (Admin UI v2 단건 Export UI 연결).
// SPEC_EXPORT_V2.md §6.1 — POST /api/admin/export/sessions/:id.

import { apiFetch } from './client'

const usesMock = import.meta.env.VITE_USE_MOCK === 'true'

export interface ExportSessionV2Data {
  download_url: string
  expires_at: string
  size_bytes_estimate: number
}

export interface ExportSessionV2Options {
  include_restricted?: boolean
}

/**
 * v2 단건 export — POST /api/admin/export/sessions/:id
 *
 * include_audio 는 안전선 #8 (audio_export_mode=reference_only) 에 따라 항상 false.
 * 성공: { data: { download_url, expires_at, size_bytes_estimate } }
 * 실패: { error: <서버 메시지 또는 네트워크 문자열> }
 */
export async function exportSessionV2(
  sessionId: string,
  _options: ExportSessionV2Options = {},
): Promise<{ data?: ExportSessionV2Data; error?: string }> {
  if (usesMock) {
    return {
      data: {
        download_url: `https://example.invalid/mock-export-${sessionId}.zip`,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        size_bytes_estimate: 104_857_600,
      },
    }
  }

  return apiFetch<ExportSessionV2Data>(
    `/api/admin/export/sessions/${sessionId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        include_audio: false,
        include_restricted: true,
      }),
    },
  )
}
