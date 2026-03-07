// ── Backend Storage 업로드 — 경로 하드코딩, 사용자 입력 금지 ──────────
// 버킷: sanitized-audio, meta-jsonl
// 경로: {user_id}/{session_id}.wav, {user_id}/{batch_id}.jsonl

import { getEffectiveUserId } from './auth'
import { isOnline } from './network'
import { uploadAudio as apiUploadAudio, uploadMeta as apiUploadMeta, getAudioSignedUrl as apiGetAudioSignedUrl, deleteUserFiles as apiDeleteUserFiles } from './api/storage'

// ── 정제 오디오 업로드 ────────────────────────────────────────────────────

export async function uploadSanitizedAudio(
  sessionId: string,
  wavBlob: Blob,
): Promise<{ path: string; error: string | null }> {
  if (!isOnline()) {
    return { path: '', error: '네트워크에 연결되어 있지 않습니다. 연결 후 다시 시도해 주세요.' }
  }
  const userId = getEffectiveUserId()
  if (!userId) {
    return { path: '', error: '인증이 필요합니다. 로그인 후 다시 시도해 주세요.' }
  }

  if (!import.meta.env.VITE_API_URL) {
    return { path: '', error: 'Backend API URL이 설정되지 않았습니다.' }
  }

  try {
    const { data, error } = await apiUploadAudio(sessionId, wavBlob)
    if (error) {
      return { path: '', error }
    }
    if (!data?.path) {
      return { path: '', error: '업로드 경로를 받지 못했습니다.' }
    }
    return { path: data.path, error: null }
  } catch (err: any) {
    return { path: '', error: err.message || '업로드 중 오류가 발생했습니다.' }
  }
}

// ── 메타 JSONL 업로드 ─────────────────────────────────────────────────────

export async function uploadMetaJsonl(
  batchId: string,
  jsonlContent: string,
): Promise<{ path: string; error: string | null }> {
  if (!isOnline()) {
    return { path: '', error: '네트워크에 연결되어 있지 않습니다. 연결 후 다시 시도해 주세요.' }
  }
  const userId = getEffectiveUserId()
  if (!userId) {
    return { path: '', error: '인증이 필요합니다. 로그인 후 다시 시도해 주세요.' }
  }

  if (!import.meta.env.VITE_API_URL) {
    return { path: '', error: 'Backend API URL이 설정되지 않았습니다.' }
  }

  try {
    const { data, error } = await apiUploadMeta(batchId, jsonlContent)
    if (error) {
      return { path: '', error }
    }
    if (!data?.path) {
      return { path: '', error: '업로드 경로를 받지 못했습니다.' }
    }
    return { path: data.path, error: null }
  } catch (err: any) {
    return { path: '', error: err.message || '업로드 중 오류가 발생했습니다.' }
  }
}

// ── Signed URL (비공개 버킷 재생용) ───────────────────────────────────────

export async function getAudioSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!import.meta.env.VITE_API_URL) {
    console.warn('[getAudioSignedUrl] Backend API URL이 설정되지 않았습니다.')
    return null
  }

  try {
    const { data, error } = await apiGetAudioSignedUrl(storagePath, expiresIn)
    if (error) {
      console.warn('[getAudioSignedUrl] Backend API error:', error)
      return null
    }
    return data?.signedUrl ?? null
  } catch (err: any) {
    console.warn('[getAudioSignedUrl] Backend API 오류:', err.message)
    return null
  }
}

// ── 사용자 파일 삭제 (데이터 철회) ────────────────────────────────────────

export async function deleteUserFiles(): Promise<void> {
  if (!import.meta.env.VITE_API_URL) {
    console.warn('[deleteUserFiles] Backend API URL이 설정되지 않았습니다.')
    return
  }

  try {
    const { data, error } = await apiDeleteUserFiles()
    if (error) {
      console.warn('[deleteUserFiles] Backend API error:', error)
      return
    }
    if (data?.success) {
      console.log(`[deleteUserFiles] Backend API: ${data.deletedFiles}개 파일 삭제`)
    }
  } catch (err: any) {
    console.warn('[deleteUserFiles] Backend API 오류:', err.message)
  }
}
