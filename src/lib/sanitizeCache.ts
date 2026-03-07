// ── 정제 캐시 — 세션별 비식별화 결과 캐시 관리 ──────────────────────────────
// wavEncoder.ts 파이프라인을 래핑하여 캐시/증분 처리
// IDB 저장: 정제 메타 캐시, Capacitor Filesystem: WAV 파일 (향후)

import { type Session } from '../types/session'
import { idbGet, idbSet } from './idb'
import { scanSessionPii, maskPiiText, detectPiiSentences, type PiiDetection } from './piiDetector'
import { loadTranscriptFull, type TranscriptWord } from './transcriptStore'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type TranscriptPiiDetection = {
  sentenceText: string              // 원본 문장
  sentenceIndex: number             // 문장 순서 (0-based)
  charOffsetInTranscript: number    // 전체 텍스트 내 char 위치
  detections: PiiDetection[]        // 해당 문장 내 PII 목록
  estimatedTimeSec: number          // (charOffset / totalChars) * duration
}

export type SanitizeCacheEntry = {
  sessionId: string
  textPreview: string | null                        // 마스킹된 텍스트 요약
  piiDetections: PiiDetection[]                     // 제목/파일명 PII 탐지
  transcriptPiiDetections: TranscriptPiiDetection[]  // 음성 텍스트 PII 탐지
  isLocked: boolean                                  // PII 잠금 여부
  hash: string                                       // 원본 데이터 해시 (변경 감지)
  createdAt: string
}

type CacheStore = Record<string, SanitizeCacheEntry>

const IDB_CACHE_KEY = 'sanitize_cache'

// ── 캐시 조회 ───────────────────────────────────────────────────────────────

async function loadCache(): Promise<CacheStore> {
  const data = await idbGet<CacheStore>(IDB_CACHE_KEY)
  return data ?? {}
}

async function saveCache(store: CacheStore): Promise<void> {
  await idbSet(IDB_CACHE_KEY, store)
}

export async function saveSanitizeCacheEntry(entry: SanitizeCacheEntry): Promise<void> {
  const store = await loadCache()
  store[entry.sessionId] = entry
  await saveCache(store)
}

export async function getSanitizeCache(sessionId: string): Promise<SanitizeCacheEntry | null> {
  const store = await loadCache()
  const entry = store[sessionId] ?? null
  // backward compat: 구버전 캐시에 transcriptPiiDetections 없으면 빈 배열
  if (entry && !entry.transcriptPiiDetections) {
    entry.transcriptPiiDetections = []
  }
  return entry
}

// ── 세션 해시 (변경 감지용) ─────────────────────────────────────────────────

// v2: 제목 PII는 잠금 대상 제외 (트랜스크립트 PII만 잠금)
const CACHE_VERSION = 'v2'

export function sessionHash(session: Session, hasTranscript: boolean): string {
  const raw = `${CACHE_VERSION}|${session.id}|${session.title}|${session.callRecordId ?? ''}|${session.date}|t=${hasTranscript}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString(36)
}

// ── 트랜스크립트 PII 스캔 ────────────────────────────────────────────────────

/**
 * 단어 타임스탬프가 있으면 PII 매칭 텍스트의 실제 시작/종료 시간 계산.
 * words 배열을 순차 탐색해서 PII matched 문자열과 겹치는 단어의 start를 반환.
 */
function findWordTimestamp(
  words: TranscriptWord[],
  transcript: string,
  charOffset: number,
  matchedLength: number,
): { startSec: number; endSec: number } | null {
  if (words.length === 0) return null

  // 각 단어의 transcript 내 대략적 위치를 누적 계산
  let cursor = 0
  for (const w of words) {
    const idx = transcript.indexOf(w.word, cursor)
    if (idx < 0) continue

    const wordEnd = idx + w.word.length
    // PII가 이 단어와 겹치면 해당 단어의 타임스탬프 사용
    if (idx <= charOffset + matchedLength && wordEnd >= charOffset) {
      return { startSec: w.start, endSec: w.end }
    }
    cursor = wordEnd
  }

  return null
}

export function scanTranscriptPii(
  transcript: string,
  durationSec: number,
  words?: TranscriptWord[],
): TranscriptPiiDetection[] {
  const piiSentences = detectPiiSentences(transcript)
  if (piiSentences.length === 0) return []

  const totalChars = transcript.length
  if (totalChars === 0) return []

  const hasWords = words && words.length > 0
  const result: TranscriptPiiDetection[] = []

  // 문장별 charOffset 계산: transcript에서 해당 문장 시작 위치 검색
  let searchStart = 0
  for (let i = 0; i < piiSentences.length; i++) {
    const ps = piiSentences[i]
    const charOffset = transcript.indexOf(ps.text, searchStart)
    const actualOffset = charOffset >= 0 ? charOffset : searchStart

    // 타임스탬프: 단어 타임스탬프 우선, 없으면 charOffset 비례 추정
    let estimatedTimeSec: number
    if (hasWords && ps.detections.length > 0) {
      const firstDet = ps.detections[0]
      const absOffset = actualOffset + firstDet.startIndex
      const wt = findWordTimestamp(words!, transcript, absOffset, firstDet.matched.length)
      estimatedTimeSec = wt ? wt.startSec : (actualOffset / totalChars) * durationSec
    } else {
      estimatedTimeSec = (actualOffset / totalChars) * durationSec
    }

    result.push({
      sentenceText: ps.text,
      sentenceIndex: i,
      charOffsetInTranscript: actualOffset,
      detections: ps.detections,
      estimatedTimeSec,
    })

    if (charOffset >= 0) {
      searchStart = charOffset + ps.text.length
    }
  }

  return result
}

// ── 단일 세션 정제 ──────────────────────────────────────────────────────────

export async function sanitizeSession(session: Session): Promise<SanitizeCacheEntry> {
  // 트랜스크립트 유무 확인 (단어 타임스탬프 포함)
  const transcriptData = await loadTranscriptFull(session.id)
  const hasTranscript = !!transcriptData
  const hash = sessionHash(session, hasTranscript)

  // 캐시 히트 검사
  const existing = await getSanitizeCache(session.id)
  if (existing && existing.hash === hash) {
    return existing
  }

  // 1) 제목/파일명 PII 탐지
  const titleDetections = scanSessionPii(session)

  // 2) 트랜스크립트 PII 탐지 (단어 타임스탬프 있으면 정확한 시간 사용)
  const transcriptDetections = transcriptData
    ? scanTranscriptPii(transcriptData.text, session.duration, transcriptData.words)
    : []

  // 잠금 판정: 트랜스크립트(음성) PII만 잠금 대상
  // 제목/파일명 PII는 자동 마스킹 처리되므로 검토 불필요 → 잠금 안 함
  const transcriptLocked = transcriptDetections.some(
    (td) => td.detections.some((d) => d.confidence >= 0.7),
  )
  const isLocked = transcriptLocked

  // 텍스트 마스킹
  const textPreview = titleDetections.length > 0
    ? maskPiiText(session.title, titleDetections)
    : session.title

  const entry: SanitizeCacheEntry = {
    sessionId: session.id,
    textPreview,
    piiDetections: titleDetections,
    transcriptPiiDetections: transcriptDetections,
    isLocked,
    hash,
    createdAt: new Date().toISOString(),
  }

  // 캐시 저장
  const store = await loadCache()
  store[session.id] = entry
  await saveCache(store)

  return entry
}

// ── 배치 정제 ───────────────────────────────────────────────────────────────

export type BatchSanitizeResult = {
  sanitized: number
  locked: number
  failed: number
}

export async function batchSanitize(
  sessions: Session[],
  onProgress: (done: number, total: number) => void,
  cancelled: { current: boolean },
): Promise<BatchSanitizeResult> {
  const result: BatchSanitizeResult = { sanitized: 0, locked: 0, failed: 0 }
  const total = sessions.length

  for (let i = 0; i < total; i++) {
    if (cancelled.current) break

    try {
      const entry = await sanitizeSession(sessions[i])
      if (entry.isLocked) {
        result.locked++
      } else {
        result.sanitized++
      }
    } catch {
      result.failed++
    }

    onProgress(i + 1, total)
  }

  return result
}

// ── 세션에 정제 결과 적용 ───────────────────────────────────────────────────

export function applySanitizeResult(session: Session, entry: SanitizeCacheEntry): Session {
  // 전체 탐지 결과를 lockReason에 저장 (backward compat: type/pattern 유지)
  const firstTitleDetection = entry.piiDetections[0]
  const firstTranscriptDetection = entry.transcriptPiiDetections[0]?.detections[0]
  const firstDetection = firstTitleDetection ?? firstTranscriptDetection

  return {
    ...session,
    piiStatus: entry.isLocked ? 'LOCKED' : (session.piiStatus ?? 'CLEAR'),
    localSanitizedTextPreview: entry.textPreview,
    lockReason: entry.isLocked && firstDetection
      ? {
          type: firstDetection.type,
          pattern: firstDetection.masked,
          titleDetections: entry.piiDetections,
          transcriptDetections: entry.transcriptPiiDetections,
        }
      : session.lockReason,
    eligibleForShare: !entry.isLocked,
  }
}
