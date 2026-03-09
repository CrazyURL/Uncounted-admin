/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Speaker Diarization Engine (Phase 3) ──────────────────────────────────
// sttEngine/embeddingEngine 패턴: 글로벌 싱글턴 + pub/sub + React 훅
// PyAnnote ONNX 모델로 화자 분리 → 본인 매핑 → consentStatus 판정 보조

import {
  type DiarizationResult,
  EMPTY_DIARIZATION,
  DIARIZATION_CACHE_KEY,
} from '../types/diarization'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type DiarizationJobStatus = 'idle' | 'reading' | 'resampling' | 'download' | 'processing' | 'mapping' | 'done' | 'error'

export type DiarizationJob = {
  sessionId: string
  status: DiarizationJobStatus
  progress: number
  message: string
}

// ── 글로벌 상태 ─────────────────────────────────────────────────────────────

let currentJob: DiarizationJob | null = null
let isProcessing = false

// ── pub/sub ─────────────────────────────────────────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const fn of listeners) fn()
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// ── 캐시 ────────────────────────────────────────────────────────────────────

function loadCache(): Record<string, DiarizationResult> {
  try {
    const raw = localStorage.getItem(DIARIZATION_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveToCache(result: DiarizationResult): void {
  const cache = loadCache()
  cache[result.sessionId] = result
  // 최대 500건
  const keys = Object.keys(cache)
  if (keys.length > 500) {
    delete cache[keys[0]]
  }
  localStorage.setItem(DIARIZATION_CACHE_KEY, JSON.stringify(cache))
}

export function getCachedResult(sessionId: string): DiarizationResult | null {
  return loadCache()[sessionId] ?? null
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * 세션 오디오에서 화자 분리를 실행하고 결과를 캐시.
 */
export async function diarizeSession(
  sessionId: string,
  _callRecordId: string,
): Promise<DiarizationResult> {
  // 캐시 확인
  const cached = getCachedResult(sessionId)
  if (cached?.status === 'done') return cached

  if (isProcessing) throw new Error('이미 처리 중입니다')
  isProcessing = true
  notify()

  try {
    // 파일 읽기
    currentJob = { sessionId, status: 'reading', progress: 0, message: '오디오 파일 읽는 중...' }
    notify()

    throw new Error('네이티브 플랫폼에서만 사용 가능')
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    const errorResult: DiarizationResult = {
      ...EMPTY_DIARIZATION,
      sessionId,
      status: 'error',
      error: msg,
    }
    saveToCache(errorResult)
    currentJob = { sessionId, status: 'error', progress: 0, message: msg }
    isProcessing = false
    notify()
    throw err
  }
}

// ── 상태 조회 ───────────────────────────────────────────────────────────────

export function getCurrentJob(): DiarizationJob | null {
  return currentJob
}

export function getIsProcessing(): boolean {
  return isProcessing
}

// ── React 훅 ────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

export function useDiarizationJob(): DiarizationJob | null {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1))
  }, [])

  return currentJob
}

export function useDiarizationResult(sessionId: string | undefined): DiarizationResult | null {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1))
  }, [])

  if (!sessionId) return null
  return getCachedResult(sessionId)
}
