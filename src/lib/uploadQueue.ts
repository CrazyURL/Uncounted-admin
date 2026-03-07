// ── 업로드 큐 — 오프라인 지원 + JSONL 배치 + 재시도 ──────────────────────────
// 정책: 서버 미연결 시 큐에 보관, 연결 시 자동 재시도 (지수 백오프)
// 암호화: AES-256-GCM (Web Crypto API), 키는 기기 내 Secure Storage
// 철회/삭제: 로컬 즉시 삭제 + 서버 삭제 요청 큐 별도 관리

import { isOnline, onNetworkChange } from './network'
import { generateUUID } from './uuid'

// ── 큐 아이템 타입 ────────────────────────────────────────────────────────────

export type UploadSchema =
  | 'U-A01-v1' | 'U-A02-v1' | 'U-A03-v1'
  | 'U-M01-v1' | 'U-M02-v1' | 'U-M05-v1'
  | 'self-report-v1'

export type QueueItemStatus = 'pending' | 'uploading' | 'failed' | 'cancelled'

export type QueueItem = {
  id: string                   // UUID v4
  schema: UploadSchema
  payload: string              // JSONL 행 (JSON string)
  retryCount: number
  maxRetries: number           // 기본 5
  nextRetryAt: string          // ISO 8601 (다음 시도 시각)
  createdAt: string            // ISO 8601
  status: QueueItemStatus
  sizeBytes: number
  sessionId?: string           // 세션 연동 (공개 준비 시 사용)
  userId?: string | null       // auth.uid() (RLS 연동)
}

export type DeleteRequest = {
  id: string
  pseudoId: string
  skuSchemas: UploadSchema[]   // 삭제 대상 SKU
  requestedAt: string          // ISO 8601
  status: 'pending' | 'sent' | 'confirmed'
}

// ── localStorage 키 ───────────────────────────────────────────────────────────

const QUEUE_KEY = 'uncounted_upload_queue'
const DELETE_QUEUE_KEY = 'uncounted_delete_queue'
const PSEUDO_ID_KEY = 'uncounted_pseudo_id'

// ── pseudo_id 관리 ────────────────────────────────────────────────────────────
// 앱 최초 실행 시 UUID v4 생성. 이메일/전화와 미연결.
// 사용자 철회 시 재생성 (이전 데이터와 연결 끊기).

export function getOrCreatePseudoId(): string {
  try {
    const stored = localStorage.getItem(PSEUDO_ID_KEY)
    if (stored) return stored
  } catch {
    // ignore
  }
  const id = generateUUID()
  try {
    localStorage.setItem(PSEUDO_ID_KEY, id)
  } catch {
    // ignore
  }
  return id
}

export function rotatePseudoId(): string {
  const newId = generateUUID()
  try {
    localStorage.setItem(PSEUDO_ID_KEY, newId)
  } catch {
    // ignore
  }
  return newId
}

// ── 큐 로드/저장 ─────────────────────────────────────────────────────────────

function loadQueue(): QueueItem[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY)
    if (stored) return JSON.parse(stored) as QueueItem[]
  } catch {
    // ignore
  }
  return []
}

function saveQueue(items: QueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    // localStorage 용량 초과 시 오래된 항목 제거
    const trimmed = items.slice(-500)  // 최대 500개 보관
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed)) } catch { /* ignore */ }
  }
}

// ── 큐에 추가 ─────────────────────────────────────────────────────────────────

export function enqueue(schema: UploadSchema, payload: string): QueueItem {
  const item: QueueItem = {
    id: generateUUID(),
    schema,
    payload,
    retryCount: 0,
    maxRetries: 5,
    nextRetryAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    sizeBytes: new TextEncoder().encode(payload).length,
  }
  const queue = loadQueue()
  queue.push(item)
  saveQueue(queue)
  return item
}

export function enqueueMany(schema: UploadSchema, payloads: string[]): void {
  const queue = loadQueue()
  for (const payload of payloads) {
    queue.push({
      id: generateUUID(),
      schema,
      payload,
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      sizeBytes: new TextEncoder().encode(payload).length,
    })
  }
  saveQueue(queue)
}

// ── 큐 상태 조회 ─────────────────────────────────────────────────────────────

export function getQueueStats(): {
  pending: number
  failed: number
  totalSizeBytes: number
} {
  const queue = loadQueue()
  return {
    pending: queue.filter((i) => i.status === 'pending').length,
    failed: queue.filter((i) => i.status === 'failed').length,
    totalSizeBytes: queue.reduce((s, i) => s + i.sizeBytes, 0),
  }
}

// ── 지수 백오프 계산 ─────────────────────────────────────────────────────────
// 1분 → 2분 → 4분 → 8분 → 16분 (최대)

function calcNextRetryAt(retryCount: number): string {
  const delayMs = Math.min(16 * 60 * 1000, Math.pow(2, retryCount) * 60 * 1000)
  return new Date(Date.now() + delayMs).toISOString()
}

// ── 업로드 실행 (JSONL 배치) ─────────────────────────────────────────────────
// 실제 서버 엔드포인트: POST /api/v1/upload (JSONL body)
// Content-Type: application/x-ndjson

export type UploadResult = {
  sent: number
  failed: number
  skipped: number
}

export async function flushQueue(
  uploadEndpoint: string,
  opts: {
    batchSize?: number       // 기본 50
    cancelled?: { current: boolean }
  } = {},
): Promise<UploadResult> {
  // 오프라인 시 즉시 반환 (재시도 카운트 소모 방지)
  if (!isOnline()) {
    const q = loadQueue()
    return { sent: 0, failed: 0, skipped: q.length }
  }
  const { batchSize = 50, cancelled } = opts
  const queue = loadQueue()
  const now = new Date()

  const ready = queue.filter(
    (i) =>
      i.status === 'pending' &&
      i.retryCount < i.maxRetries &&
      new Date(i.nextRetryAt) <= now
  )

  if (ready.length === 0) return { sent: 0, failed: 0, skipped: queue.length - ready.length }

  let sent = 0
  let failed = 0

  // 배치 처리
  for (let offset = 0; offset < ready.length; offset += batchSize) {
    if (cancelled?.current) break
    const batch = ready.slice(offset, offset + batchSize)
    const body = batch.map((i) => i.payload).join('\n')

    try {
      const res = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body,
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // 성공 → 큐에서 제거
      const batchIds = new Set(batch.map((i) => i.id))
      const updated = loadQueue().filter((i) => !batchIds.has(i.id))
      saveQueue(updated)
      sent += batch.length
    } catch {
      // 실패 → 재시도 카운트 증가
      const batchIds = new Set(batch.map((i) => i.id))
      const updated = loadQueue().map((i) => {
        if (!batchIds.has(i.id)) return i
        const newRetryCount = i.retryCount + 1
        return {
          ...i,
          retryCount: newRetryCount,
          status: newRetryCount >= i.maxRetries ? ('failed' as QueueItemStatus) : i.status,
          nextRetryAt: calcNextRetryAt(newRetryCount),
        }
      })
      saveQueue(updated)
      failed += batch.length
    }
  }

  return { sent, failed, skipped: queue.length - ready.length }
}

// ── 암호화 유틸 (AES-256-GCM, Web Crypto) ────────────────────────────────────
// 키: 기기별 1회 생성 → IndexedDB(Secure) 또는 Capacitor SecureStorage 권장
// 여기서는 브라우저 인메모리 키로 구현 (실 배포 시 Secure Storage 연동 필요)

const AES_KEY_KEY = 'uncounted_aes_key_b64'

async function getOrCreateAesKey(): Promise<CryptoKey> {
  try {
    const storedB64 = localStorage.getItem(AES_KEY_KEY)
    if (storedB64) {
      const raw = Uint8Array.from(atob(storedB64), (c) => c.charCodeAt(0))
      return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    }
  } catch { /* fall through */ }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  try {
    const raw = await crypto.subtle.exportKey('raw', key)
    localStorage.setItem(AES_KEY_KEY, btoa(String.fromCharCode(...new Uint8Array(raw))))
  } catch { /* ignore */ }
  return key
}

export async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getOrCreateAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptPayload(b64: string): Promise<string> {
  const key = await getOrCreateAesKey()
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// ── 철회/삭제 큐 ─────────────────────────────────────────────────────────────
// 1. 로컬 즉시 삭제 (큐 비우기)
// 2. 서버 삭제 요청 큐에 추가 (연결 시 전송)

export function requestLocalDeletion(): void {
  localStorage.removeItem(QUEUE_KEY)
  // 기타 수집 데이터 키 일괄 삭제
  const keysToDelete = [
    'uncounted_audio_hashes',
    'uncounted_label_stats',
    'uncounted_user_settings',
    'uncounted_joined_skus',
    'uncounted_sku_consents',
    'uncounted_metadata_consent',
  ]
  for (const key of keysToDelete) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }
  // pseudo_id 재발급 (이전 서버 데이터와 연결 끊기)
  rotatePseudoId()
}

export function enqueueDeleteRequest(
  pseudoId: string,
  skuSchemas: UploadSchema[],
): void {
  const req: DeleteRequest = {
    id: generateUUID(),
    pseudoId,
    skuSchemas,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  }
  try {
    const existing = JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY) ?? '[]') as DeleteRequest[]
    existing.push(req)
    localStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(existing))
  } catch { /* ignore */ }
}

export function getDeleteQueue(): DeleteRequest[] {
  try {
    return JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY) ?? '[]') as DeleteRequest[]
  } catch {
    return []
  }
}

// ── 세션 연동 enqueue ───────────────────────────────────────────────────────
// 공개 준비 시 세션 ID와 함께 큐에 추가

export function enqueueSession(sessionId: string, schema: UploadSchema, payload: string): QueueItem {
  const item: QueueItem = {
    id: generateUUID(),
    schema,
    payload,
    retryCount: 0,
    maxRetries: 5,
    nextRetryAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    sizeBytes: new TextEncoder().encode(payload).length,
    sessionId,
  }
  const queue = loadQueue()
  queue.push(item)
  saveQueue(queue)
  return item
}

// ── 세션별 큐 상태 조회 ─────────────────────────────────────────────────────

export function getSessionQueueStatus(sessionId: string): QueueItemStatus | null {
  const queue = loadQueue()
  const item = queue.find((i) => i.sessionId === sessionId)
  return item?.status ?? null
}

// ── 네트워크 복구 시 자동 플러시 ────────────────────────────────────────────
// App.tsx에서 1회 호출. 네트워크 복구 시 pending 항목 자동 전송 시도.

let autoFlushUnsub: (() => void) | null = null

export function startAutoFlushOnReconnect(uploadEndpoint: string): () => void {
  // 이미 등록된 리스너 정리
  autoFlushUnsub?.()

  autoFlushUnsub = onNetworkChange((online) => {
    if (online) {
      const stats = getQueueStats()
      if (stats.pending > 0) {
        flushQueue(uploadEndpoint).catch(() => {})
      }
    }
  })

  return () => {
    autoFlushUnsub?.()
    autoFlushUnsub = null
  }
}
