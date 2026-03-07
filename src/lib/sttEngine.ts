/* eslint-disable @typescript-eslint/no-explicit-any */
// ── STT 엔진 (배경 큐 + Web Worker) ──────────────────────────────────────
// Whisper-tiny WASM 추론을 Vite Worker에서 실행.
// 메인 스레드: 파일 I/O(Capacitor) + 리샘플링(AudioContext) → Worker: 추론
// 글로벌 싱글턴 — 페이지 이동해도 큐/진행 상태 유지

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { resampleTo16kMono } from './wavEncoder'
import { saveTranscript, loadTranscript, loadAllTranscripts } from './transcriptStore'
import { startSttService, stopSttService, updateSttProgress } from './sttServiceBridge'

// ── 타입 ──────────────────────────────────────────────────────────────────

export type SttJobStatus =
  | 'queued'
  | 'reading'
  | 'resampling'
  | 'download'
  | 'transcribing'
  | 'done'
  | 'error'

export type SttJob = {
  sessionId: string
  status: SttJobStatus
  progress?: number   // 0~1 (다운로드 진행률)
  message: string
}

export type SttGlobalState = {
  totalEnqueued: number
  completedCount: number
  isProcessing: boolean
  currentSessionId: string | null
  mode: SttMode
  queueLength: number
}

// 기존 호환 (SessionDetailPage에서 사용)
export type SttProgress = {
  status: 'download' | 'loading' | 'transcribing' | 'done' | 'error'
  progress?: number
  message?: string
}

type QueueItem = {
  sessionId: string
  callRecordId: string
  force?: boolean  // 캐시 무시하고 재추출
}

// ── STT 모드 (on/off) ────────────────────────────────────────────────

const STT_MODE_KEY = 'uncounted_stt_mode'

export type SttMode = 'on' | 'off'

/** STT 백그라운드 모드 확인. 한 번도 동의하지 않았으면 'off' */
export function getSttMode(): SttMode {
  return localStorage.getItem(STT_MODE_KEY) === 'on' ? 'on' : 'off'
}

/** STT 백그라운드 모드 변경 */
export function setSttMode(mode: SttMode): void {
  localStorage.setItem(STT_MODE_KEY, mode)
  if (mode === 'off') {
    // 큐 비우고 서비스 중지 (현재 처리 중인 건은 완료까지 진행)
    queue.length = 0
    for (const [sid, job] of jobs) {
      if (job.status === 'queued') jobs.delete(sid)
    }
    stopSttService()
  }
  notify()
}

// ── 글로벌 상태 ──────────────────────────────────────────────────────────

const jobs = new Map<string, SttJob>()
const queue: QueueItem[] = []
let totalEnqueued = 0
let completedCount = 0
let isProcessing = false
let currentSessionId: string | null = null
let worker: Worker | null = null
let singleSessionMode = false  // "이 세션만" 추출 시 true → 1건 처리 후 멈춤

// ── pub/sub ──────────────────────────────────────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const fn of listeners) fn()
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// ── Worker 관리 ──────────────────────────────────────────────────────────

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('./sttWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('message', handleWorkerMessage)
    worker.addEventListener('error', (e) => {
      console.error('[sttEngine] Worker error:', e)
      if (currentSessionId) {
        updateJob(currentSessionId, 'error', `Worker 오류: ${e.message ?? '알 수 없는 오류'}`)
      }
      isProcessing = false
      currentSessionId = null
      notify()
      processNext()
    })
  }
  return worker
}

function handleWorkerMessage(e: MessageEvent) {
  const { type, sessionId, text, message, progress, status } = e.data

  if (type === 'progress') {
    updateJob(sessionId, status, message, progress)
  } else if (type === 'result') {
    // 텍스트 저장 + 완료 처리
    const trimmed = (text ?? '').trim()
    if (!trimmed) {
      updateJob(sessionId, 'error', '텍스트를 추출하지 못했습니다 (무음 또는 인식 불가)')
    } else {
      saveTranscript(sessionId, trimmed).then(() => {
        updateJob(sessionId, 'done', '완료')
        completedCount++
        notify()
        syncForegroundService()
      })
    }
    isProcessing = false
    currentSessionId = null
    if (singleSessionMode) singleSessionMode = false
    processNext()
  } else if (type === 'error') {
    updateJob(sessionId, 'error', `실패: ${message}`)
    completedCount++
    isProcessing = false
    currentSessionId = null
    if (singleSessionMode) singleSessionMode = false
    notify()
    syncForegroundService()
    processNext()
  }
}

// ── job 업데이트 ─────────────────────────────────────────────────────────

function updateJob(
  sessionId: string,
  status: SttJobStatus,
  message: string,
  progress?: number,
) {
  const job: SttJob = { sessionId, status, message, progress }
  jobs.set(sessionId, job)
  notify()
}

// ── Foreground Service 동기화 ─────────────────────────────────────────

/** 현재 큐 상태에 맞게 Foreground Service 시작/중지/업데이트 */
function syncForegroundService() {
  const pendingCount = totalEnqueued - completedCount
  if (pendingCount > 0 && (isProcessing || queue.length > 0)) {
    // 처리할 작업이 남아있으면 서비스 시작/업데이트
    startSttService(totalEnqueued, completedCount).then(() => {
      updateSttProgress(completedCount, totalEnqueued)
    })
  } else {
    // 모든 작업 완료 → 서비스 중지
    stopSttService()
  }
}

// ── 큐 처리 ──────────────────────────────────────────────────────────────

async function processNext() {
  if (isProcessing) return
  // 모드가 off면 큐 처리 중단 (현재 처리 중인 건만 완료)
  if (getSttMode() === 'off' && !singleSessionMode) {
    syncForegroundService()
    notify()
    return
  }
  if (queue.length === 0) {
    singleSessionMode = false
    syncForegroundService()   // 큐 비었으면 서비스 중지
    notify()
    return
  }

  const item = queue.shift()!
  isProcessing = true
  currentSessionId = item.sessionId
  syncForegroundService()   // 처리 시작 → 서비스 시작/업데이트

  // 이미 캐시가 있으면 스킵 (force 제외)
  if (!item.force) {
    const cached = await loadTranscript(item.sessionId)
    if (cached) {
      updateJob(item.sessionId, 'done', '완료')
      completedCount++
      isProcessing = false
      currentSessionId = null
      notify()
      processNext()
      return
    }
  }

  try {
    // 1) 파일 읽기
    updateJob(item.sessionId, 'reading', '오디오 파일 읽는 중...')

    if (!Capacitor.isNativePlatform()) {
      updateJob(item.sessionId, 'error', '네이티브 플랫폼에서만 사용 가능')
      completedCount++
      isProcessing = false
      currentSessionId = null
      notify()
      syncForegroundService()
      processNext()
      return
    }

    const { data } = await Filesystem.readFile({
      path: item.callRecordId,
      directory: Directory.ExternalStorage,
    })
    const binary = atob(data as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    // 2) 리샘플링 (AudioContext — 메인 스레드 필수)
    updateJob(item.sessionId, 'resampling', '오디오 변환 중 (16kHz)...')
    await new Promise((r) => setTimeout(r, 30))  // UI 양보
    const float32 = await resampleTo16kMono(bytes.buffer)

    // 3) Worker에 전송 (Transferable — zero-copy)
    updateJob(item.sessionId, 'download', '모델 준비 중...')
    const w = getWorker()
    w.postMessage(
      { type: 'transcribe', audio: float32, sessionId: item.sessionId },
      [float32.buffer],
    )
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    updateJob(item.sessionId, 'error', `실패: ${msg}`)
    isProcessing = false
    currentSessionId = null
    notify()
    processNext()
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * 세션 목록을 STT 큐에 추가.
 * 이미 캐시/큐/처리 중인 세션은 자동 스킵.
 */
export async function enqueueTranscriptions(
  items: { sessionId: string; callRecordId: string }[],
): Promise<void> {
  // 이미 캐시된 세션 필터링
  const cached = await loadAllTranscripts()

  for (const item of items) {
    // 캐시 있으면 스킵 (카운터에는 포함 → 누적 진행률 표시)
    if (cached[item.sessionId]) {
      if (!jobs.has(item.sessionId)) {
        updateJob(item.sessionId, 'done', '완료')
        totalEnqueued++
        completedCount++
      }
      continue
    }
    // 이미 큐 또는 처리 중이면 스킵
    const existing = jobs.get(item.sessionId)
    if (existing && existing.status !== 'error') continue

    queue.push(item)
    updateJob(item.sessionId, 'queued', '대기 중...')
    totalEnqueued++
  }

  notify()
  syncForegroundService()   // 큐에 추가되면 서비스 시작
  processNext()
}

/**
 * 특정 세션 1건만 추출 (STT 모드 off여도 실행).
 * 큐에 없으면 새로 추가. force=true면 캐시 무시하고 재추출.
 */
export function prioritizeTranscription(
  sessionId: string,
  callRecordId: string,
  force?: boolean,
): void {
  // force가 아니면 이미 완료/처리 중 무시
  if (!force) {
    const existing = jobs.get(sessionId)
    if (existing?.status === 'done') return
  }
  if (currentSessionId === sessionId) return

  // 기존 큐에서 제거
  const idx = queue.findIndex((q) => q.sessionId === sessionId)
  if (idx !== -1) queue.splice(idx, 1)

  // 맨 앞에 추가
  queue.unshift({ sessionId, callRecordId, force })
  updateJob(sessionId, 'queued', force ? '재추출 대기...' : '추출 준비 중...')

  const existing = jobs.get(sessionId)
  if (!existing || existing.status === 'error' || existing.status === 'done') {
    totalEnqueued++
  }

  // STT 모드 off여도 이 1건은 처리
  if (getSttMode() === 'off') singleSessionMode = true

  notify()
  processNext()
}

// ── 상태 조회 (non-React) ────────────────────────────────────────────────

export function getJob(sessionId: string): SttJob | null {
  return jobs.get(sessionId) ?? null
}

export function getGlobalState(): SttGlobalState {
  return {
    totalEnqueued,
    completedCount,
    isProcessing,
    currentSessionId,
    mode: getSttMode(),
    queueLength: queue.length,
  }
}

// ── React 훅 ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'

/** 특정 세션의 STT 진행 상태를 실시간 추적 */
export function useSttJob(sessionId: string | undefined): SttJob | null {
  const [, setTick] = useState(0)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1))
  }, [])

  if (!sessionId) return null
  return jobs.get(sessionId) ?? null
}

/** 전체 STT 큐 진행 상태를 실시간 추적 */
export function useSttGlobal(): SttGlobalState {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1))
  }, [])

  return {
    totalEnqueued,
    completedCount,
    isProcessing,
    currentSessionId,
    mode: getSttMode(),
    queueLength: queue.length,
  }
}
