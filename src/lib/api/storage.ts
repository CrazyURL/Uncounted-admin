// ── Storage API Client ─────────────────────────────────────────────────
// 백엔드 Storage API 호출 레이어

import { apiFetch } from './client'

/**
 * POST /api/storage/audio
 * 정제된 오디오 업로드
 */
export async function uploadAudio(sessionId: string, wavBlob: Blob) {
  // Blob → base64 변환
  const reader = new FileReader()
  const base64 = await new Promise<string>((resolve) => {
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1]) // "data:audio/wav;base64," 제거
    }
    reader.readAsDataURL(wavBlob)
  })

  return apiFetch<{ path: string }>('/api/storage/audio', {
    method: 'POST',
    body: JSON.stringify({ sessionId, wavData: base64 }),
  })
}

/**
 * POST /api/storage/meta
 * 메타 JSONL 업로드
 */
export async function uploadMeta(batchId: string, jsonlContent: string) {
  return apiFetch<{ path: string }>('/api/storage/meta', {
    method: 'POST',
    body: JSON.stringify({ batchId, content: jsonlContent }),
  })
}

/**
 * POST /api/storage/audio/signed-url
 * 비공개 버킷 오디오 재생용 signed URL 발급
 */
export async function getAudioSignedUrl(storagePath: string, expiresIn = 3600) {
  return apiFetch<{ signedUrl: string }>('/api/storage/audio/signed-url', {
    method: 'POST',
    body: JSON.stringify({ storagePath, expiresIn }),
  })
}

/**
 * DELETE /api/storage/user
 * 사용자 파일 전체 삭제 (데이터 철회)
 */
export async function deleteUserFiles() {
  return apiFetch<{ success: boolean; deletedFiles: number }>('/api/storage/user', {
    method: 'DELETE',
  })
}
