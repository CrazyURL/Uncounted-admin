// ── 트랜스크립트 IDB 캐시 + Supabase 백업 ────────────────────────────
// Whisper STT 결과를 세션별 개별 IDB 키로 저장 + Supabase에 백업.
// 키 형식: "stt:{sessionId}" → 단일 키 손상 시 1건만 영향.
// 구 포맷("stt_transcripts" 단일 키)은 초회 자동 마이그레이션.

import { idbGet, idbSet, idbDelete, idbGetKeysByPrefix } from './idb'

const PREFIX = 'stt:'
const LEGACY_KEY = 'stt_transcripts'

// Faster-Whisper word_timestamps=True 결과
export type TranscriptWord = {
  word: string
  start: number       // seconds
  end: number         // seconds
  probability: number // 0~1
}

type TranscriptEntry = {
  text: string
  summary?: string               // KoBART 요약 (서버 STT 시)
  words?: TranscriptWord[]       // 단어별 타임스탬프 (서버 STT 시)
  createdAt: string
}

// ── 마이그레이션 (구 단일키 → 개별키) ────────────────────────────────

let migrated = false

async function ensureMigrated(): Promise<void> {
  if (migrated) return
  migrated = true

  const legacy = await idbGet<Record<string, TranscriptEntry>>(LEGACY_KEY)
  if (!legacy || Object.keys(legacy).length === 0) return

  const entries = Object.entries(legacy)
  for (const [id, entry] of entries) {
    await idbSet(PREFIX + id, entry)
  }

  await idbDelete(LEGACY_KEY)
  if (import.meta.env.DEV) {
    console.log(`[transcriptStore] migrated ${entries.length} transcripts to per-session keys`)
  }
}

// ── 백엔드 API 백업 (fire-and-forget) ──────────────────────────────────

function backupToBackend(
  sessionId: string,
  text: string,
  opts?: { words?: TranscriptWord[]; summary?: string }
): void {
  if (!import.meta.env.VITE_API_URL) return

  import('./api/transcripts').then(({ saveTranscriptApi }) => {
    saveTranscriptApi(sessionId, text, opts)
      .catch((err) => {
        console.warn('[transcriptStore] Backend API backup failed:', err.message)
      })
  })
}

// ── Public API ────────────────────────────────────────────────────────

export async function saveTranscript(
  sessionId: string,
  text: string,
  opts?: { words?: TranscriptWord[]; summary?: string },
): Promise<void> {
  const entry: TranscriptEntry = {
    text,
    summary: opts?.summary,
    words: opts?.words,
    createdAt: new Date().toISOString(),
  }
  await idbSet(PREFIX + sessionId, entry)
  backupToBackend(sessionId, text, opts)
}

export async function loadTranscript(sessionId: string): Promise<string | null> {
  await ensureMigrated()
  const entry = await idbGet<TranscriptEntry>(PREFIX + sessionId)
  return entry?.text ?? null
}

/** 트랜스크립트 + 단어 타임스탬프 + 요약 전체 로드 */
export async function loadTranscriptFull(sessionId: string): Promise<{
  text: string
  summary?: string
  words?: TranscriptWord[]
} | null> {
  await ensureMigrated()
  const entry = await idbGet<TranscriptEntry>(PREFIX + sessionId)
  if (!entry?.text) return null
  return { text: entry.text, summary: entry.summary, words: entry.words }
}

/** 모든 트랜스크립트의 sessionId → text 맵 반환 */
export async function loadAllTranscripts(): Promise<Record<string, string>> {
  await ensureMigrated()
  const keys = await idbGetKeysByPrefix(PREFIX)
  const result: Record<string, string> = {}
  for (const key of keys) {
    const entry = await idbGet<TranscriptEntry>(key)
    if (entry?.text) {
      result[key.slice(PREFIX.length)] = entry.text
    }
  }
  return result
}

/** 캐시된 트랜스크립트 총 건수 (빠른 카운트용) */
export async function countTranscripts(): Promise<number> {
  await ensureMigrated()
  const keys = await idbGetKeysByPrefix(PREFIX)
  return keys.length
}

export async function deleteTranscript(sessionId: string): Promise<void> {
  await idbDelete(PREFIX + sessionId)
}

/**
 * 백엔드에서 IDB에 없는 트랜스크립트 복원 (앱 시작 시 1회).
 * IDB가 날아갔을 때 서버 백업에서 복구하는 용도.
 */
export async function restoreFromBackend(): Promise<number> {
  if (!import.meta.env.VITE_API_URL) return 0

  await ensureMigrated()
  const localKeys = new Set(
    (await idbGetKeysByPrefix(PREFIX)).map((k) => k.slice(PREFIX.length)),
  )

  try {
    const { loadAllTranscriptsApi } = await import('./api/transcripts')
    const result = await loadAllTranscriptsApi()

    if (result.error || !result.data) return 0

    let restored = 0
    for (const row of result.data) {
      if (!localKeys.has(row.sessionId)) {
        const entry: TranscriptEntry = {
          text: row.text,
          summary: row.summary ?? undefined,
          createdAt: row.createdAt ?? new Date().toISOString(),
        }
        if (row.words && Array.isArray(row.words)) {
          entry.words = row.words
        }
        await idbSet(PREFIX + row.sessionId, entry)
        restored++
      }
    }

    if (restored > 0 && import.meta.env.DEV) {
      console.log(`[transcriptStore] restored ${restored} transcripts from backend API`)
    }
    return restored
  } catch (err: any) {
    console.warn('[transcriptStore] restore failed:', err.message)
    return 0
  }
}

/**
 * @deprecated Use restoreFromBackend() instead
 */
export const restoreFromSupabase = restoreFromBackend
