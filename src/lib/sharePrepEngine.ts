// ── 공개 준비 엔진 — PII 스캔 → 정제 → 큐 등록 오케스트레이션 ───────────────
// 전체/그룹 공개 준비 시 호출되는 메인 엔진

import { type Session, type ShareScope } from '../types/session'
import { type ShareBatch } from '../types/consent'
import { getEffectiveUserId } from './auth'
import { batchSanitize, applySanitizeResult, getSanitizeCache } from './sanitizeCache'
import { canShare, calcEligibleForShare } from './stateMachine'
import { idbGet, idbSet } from './idb'
import { generateUUID } from './uuid'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type SharePrepPhase = 'scanning' | 'sanitizing' | 'applying' | 'queueing' | 'done' | 'failed'

export type SharePrepProgress = {
  phase: SharePrepPhase
  scanDone: number
  scanTotal: number
  sanitizeDone: number
  sanitizeTotal: number
  applyDone: number
  applyTotal: number
  queueDone: number
  queueTotal: number
}

export type SharePrepResult = {
  batchId: string
  totalSessions: number
  eligibleSessions: number
  lockedSessions: number
  queuedSessions: number
  skippedSessions: number
}

// ── 배치 저장 ───────────────────────────────────────────────────────────────

const IDB_BATCHES_KEY = 'share_batches'

async function loadBatches(): Promise<ShareBatch[]> {
  return (await idbGet<ShareBatch[]>(IDB_BATCHES_KEY)) ?? []
}

async function saveBatch(batch: ShareBatch): Promise<void> {
  const batches = await loadBatches()
  const idx = batches.findIndex((b) => b.id === batch.id)
  if (idx >= 0) batches[idx] = batch
  else batches.push(batch)
  await idbSet(IDB_BATCHES_KEY, batches)
}

export async function getLatestBatch(): Promise<ShareBatch | null> {
  const batches = await loadBatches()
  if (batches.length === 0) return null
  return batches[batches.length - 1]
}

// ── 사전 스캔 (모달 표시용 요약) ────────────────────────────────────────────

export type PreScanSummary = {
  total: number
  eligible: number
  locked: number
  ineligible: number          // 품질 미달 (qaScore < 50 등)
  alreadyUploaded: number
  unlabeled: number
  notConsented: number        // 공개 동의 미완료
  scannedAt: number           // Date.now() — 캐시 유효성
}

export async function preScan(
  sessions: Session[],
  onProgress?: (done: number, total: number) => void,
): Promise<PreScanSummary> {
  const total = sessions.length
  let eligible = 0
  let locked = 0
  let ineligible = 0
  let alreadyUploaded = 0
  let unlabeled = 0
  let notConsented = 0

  for (let i = 0; i < total; i++) {
    const s = sessions[i]
    const status = s.uploadStatus ?? 'LOCAL'
    if (status === 'UPLOADED') {
      alreadyUploaded++
      onProgress?.(i + 1, total)
      continue
    }

    // 동의 확인: isPublic=true + visibilityStatus='PUBLIC_CONSENTED'
    if (!s.isPublic || s.visibilityStatus !== 'PUBLIC_CONSENTED') {
      notConsented++
      onProgress?.(i + 1, total)
      continue
    }

    // 캐시 확인 (이전 정제 결과)
    const cache = await getSanitizeCache(s.id)
    const isLocked = cache?.isLocked ?? (s.piiStatus === 'LOCKED')

    if (isLocked) {
      locked++
    } else if (calcEligibleForShare(s)) {
      eligible++
    } else {
      ineligible++
    }

    if (!s.labels) unlabeled++
    onProgress?.(i + 1, total)
  }

  return {
    total,
    eligible,
    locked,
    ineligible,
    alreadyUploaded,
    unlabeled,
    notConsented,
    scannedAt: Date.now(),
  }
}

// ── 메인 공개 준비 함수 ─────────────────────────────────────────────────────

export async function prepareForShare(
  sessions: Session[],
  targetScope: ShareScope,
  onProgress: (p: SharePrepProgress) => void,
  cancelled: { current: boolean },
): Promise<{ result: SharePrepResult; updatedSessions: Session[] }> {
  const batchId = generateUUID()
  const total = sessions.length

  // 배치 생성
  const userId = getEffectiveUserId()
  const batch: ShareBatch = {
    id: batchId,
    targetScope,
    status: 'RUNNING',
    totalSessions: total,
    eligibleSessions: 0,
    lockedSessions: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...(userId ? { userId } : {}),
  }
  await saveBatch(batch)

  const progress: SharePrepProgress = {
    phase: 'scanning',
    scanDone: 0, scanTotal: total,
    sanitizeDone: 0, sanitizeTotal: 0,
    applyDone: 0, applyTotal: 0,
    queueDone: 0, queueTotal: 0,
  }

  try {
    // ── Phase 1: PII 스캔 ─────────────────────────────────────────────────
    progress.phase = 'scanning'
    onProgress({ ...progress })

    const sessionsToSanitize: Session[] = []
    const lockedSessions: Session[] = []
    const skippedSessions: Session[] = []
    const updatedSessions = [...sessions]

    for (let i = 0; i < total; i++) {
      if (cancelled.current) break

      const s = sessions[i]
      const uploadStatus = s.uploadStatus ?? 'LOCAL'

      // 이미 업로드 완료 → 스킵
      if (uploadStatus === 'UPLOADED') {
        skippedSessions.push(s)
        progress.scanDone = i + 1
        onProgress({ ...progress })
        continue
      }

      // 동의 확인: 공개 동의 없는 세션은 큐에 넣지 않음
      if (!s.isPublic || s.visibilityStatus !== 'PUBLIC_CONSENTED') {
        skippedSessions.push(s)
        progress.scanDone = i + 1
        onProgress({ ...progress })
        continue
      }

      // canShare 체크 (이미 LOCKED이면 잠금으로 분류)
      if (!canShare(s)) {
        lockedSessions.push(s)
        progress.scanDone = i + 1
        onProgress({ ...progress })
        continue
      }

      // 적합성 체크
      if (calcEligibleForShare(s)) {
        sessionsToSanitize.push(s)
      } else {
        skippedSessions.push(s)
      }

      progress.scanDone = i + 1
      onProgress({ ...progress })
    }

    if (cancelled.current) {
      batch.status = 'FAILED'
      batch.completedAt = new Date().toISOString()
      await saveBatch(batch)
      return { result: buildResult(batchId, total, 0, lockedSessions.length, 0, skippedSessions.length), updatedSessions }
    }

    // ── Phase 2: 정제 (PII 탐지 + 캐시) ───────────────────────────────────
    progress.phase = 'sanitizing'
    progress.sanitizeTotal = sessionsToSanitize.length
    onProgress({ ...progress })

    const sanitizeResult = await batchSanitize(
      sessionsToSanitize,
      (done, _total) => {
        progress.sanitizeDone = done
        onProgress({ ...progress })
      },
      cancelled,
    )

    // ── Phase 2.5: 정제 결과 적용 ──────────────────────────────────────────
    progress.phase = 'applying'
    progress.applyTotal = sessionsToSanitize.length
    progress.applyDone = 0
    onProgress({ ...progress })

    const newlyLocked: Session[] = []
    const eligible: Session[] = []

    for (let ai = 0; ai < sessionsToSanitize.length; ai++) {
      if (cancelled.current) break
      const s = sessionsToSanitize[ai]
      const cache = await getSanitizeCache(s.id)
      if (!cache) {
        progress.applyDone = ai + 1
        onProgress({ ...progress })
        continue
      }

      const updated = applySanitizeResult(s, cache)
      const idx = updatedSessions.findIndex((us) => us.id === s.id)
      if (idx >= 0) updatedSessions[idx] = updated

      if (cache.isLocked) {
        newlyLocked.push(updated)
      } else {
        eligible.push(updated)
      }

      progress.applyDone = ai + 1
      onProgress({ ...progress })
    }

    const totalLocked = lockedSessions.length + newlyLocked.length + sanitizeResult.locked

    if (cancelled.current) {
      batch.status = 'FAILED'
      batch.completedAt = new Date().toISOString()
      await saveBatch(batch)
      return { result: buildResult(batchId, total, eligible.length, totalLocked, 0, skippedSessions.length), updatedSessions }
    }

    // ── Phase 3: 큐 등록 ───────────────────────────────────────────────────
    progress.phase = 'queueing'
    progress.queueTotal = eligible.length
    onProgress({ ...progress })

    let queuedCount = 0
    for (let i = 0; i < eligible.length; i++) {
      if (cancelled.current) break

      const s = eligible[i]
      const idx = updatedSessions.findIndex((us) => us.id === s.id)
      if (idx >= 0) {
        updatedSessions[idx] = {
          ...updatedSessions[idx],
          uploadStatus: 'QUEUED',
          shareScope: targetScope,
          eligibleForShare: true,
        }
      }
      queuedCount++
      progress.queueDone = i + 1
      onProgress({ ...progress })
    }

    // 배치 완료
    batch.status = 'DONE'
    batch.eligibleSessions = eligible.length
    batch.lockedSessions = totalLocked
    batch.completedAt = new Date().toISOString()
    await saveBatch(batch)

    progress.phase = 'done'
    onProgress({ ...progress })

    return {
      result: buildResult(batchId, total, eligible.length, totalLocked, queuedCount, skippedSessions.length),
      updatedSessions,
    }
  } catch {
    batch.status = 'FAILED'
    batch.completedAt = new Date().toISOString()
    await saveBatch(batch)

    progress.phase = 'failed'
    onProgress({ ...progress })

    return {
      result: buildResult(batchId, total, 0, 0, 0, 0),
      updatedSessions: sessions,
    }
  }
}

function buildResult(
  batchId: string,
  total: number,
  eligible: number,
  locked: number,
  queued: number,
  skipped: number,
): SharePrepResult {
  return {
    batchId,
    totalSessions: total,
    eligibleSessions: eligible,
    lockedSessions: locked,
    queuedSessions: queued,
    skippedSessions: skipped,
  }
}
