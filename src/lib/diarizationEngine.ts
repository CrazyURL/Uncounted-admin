/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Speaker Diarization Engine (Phase 3) ──────────────────────────────────
// sttEngine/embeddingEngine 패턴: 글로벌 싱글턴 + pub/sub + React 훅
// PyAnnote ONNX 모델로 화자 분리 → 본인 매핑 → consentStatus 판정 보조

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { resampleTo16kMono } from './wavEncoder'
import {
  type DiarizationResult,
  type SpeakerSegment,
  type SpeakerSummary,
  type DiarizationWorkerResponse,
  EMPTY_DIARIZATION,
  DIARIZATION_CACHE_KEY,
} from '../types/diarization'
import { getProfile } from './embeddingEngine'

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
let worker: Worker | null = null

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

// ── Worker 관리 ─────────────────────────────────────────────────────────────

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('./diarizationWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('error', (e) => {
      console.error('[diarizationEngine] Worker error:', e)
      if (currentJob) {
        currentJob = { ...currentJob, status: 'error', message: `Worker 오류: ${e.message ?? '알 수 없는 오류'}` }
      }
      isProcessing = false
      notify()
    })
  }
  return worker
}

// ── 본인 화자 매핑 ─────────────────────────────────────────────────────────

/**
 * 화자 분리 결과에서 등록된 voice profile과 가장 유사한 화자를 본인으로 매핑.
 * 현재는 발화량이 가장 많은 화자를 본인으로 추정 (단순 휴리스틱).
 * Phase 2 임베딩과 결합하면 코사인 유사도 기반으로 정확도 향상 가능.
 */
function mapUserSpeaker(speakers: SpeakerSummary[]): string | null {
  if (speakers.length === 0) return null

  const profile = getProfile()

  // 등록된 프로필이 없으면 발화량 기준 추정
  if (!profile.referenceEmbedding) {
    // 가장 발화량이 많은 화자를 본인으로 추정
    const sorted = [...speakers].sort((a, b) => b.totalDurationSec - a.totalDurationSec)
    return sorted[0].speakerId
  }

  // TODO: Phase 2 임베딩과 각 화자의 세그먼트 임베딩을 비교하여 정확한 매핑
  // 현재는 발화량 기준 추정
  const sorted = [...speakers].sort((a, b) => b.totalDurationSec - a.totalDurationSec)
  return sorted[0].speakerId
}

// ── 다이어라이제이션 실행 (Promise wrapper) ────────────────────────────────

function runDiarization(
  audio: Float32Array,
  sessionId: string,
): Promise<{ segments: SpeakerSegment[]; speakers: SpeakerSummary[] }> {
  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handler = (e: MessageEvent) => {
      const msg = e.data as DiarizationWorkerResponse
      if (msg.sessionId !== sessionId) return

      if (msg.type === 'progress') {
        currentJob = {
          sessionId,
          status: msg.stage === 'download' ? 'download' : 'processing',
          progress: msg.progress,
          message: msg.stage === 'download'
            ? `모델 다운로드 ${Math.round(msg.progress * 100)}%`
            : `화자 분리 중 ${Math.round(msg.progress * 100)}%`,
        }
        notify()
      } else if (msg.type === 'result') {
        w.removeEventListener('message', handler)
        resolve({ segments: msg.segments, speakers: msg.speakers })
      } else if (msg.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }

    w.addEventListener('message', handler)
    w.postMessage(
      { type: 'diarize', audio, sampleRate: 16000, sessionId },
      [audio.buffer],
    )
  })
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * 세션 오디오에서 화자 분리를 실행하고 결과를 캐시.
 */
export async function diarizeSession(
  sessionId: string,
  callRecordId: string,
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

    if (!Capacitor.isNativePlatform()) {
      throw new Error('네이티브 플랫폼에서만 사용 가능')
    }

    const { data } = await Filesystem.readFile({
      path: callRecordId,
      directory: Directory.ExternalStorage,
    })
    const binary = atob(data as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    // 리샘플링
    currentJob = { sessionId, status: 'resampling', progress: 0.1, message: '오디오 변환 중...' }
    notify()
    await new Promise((r) => setTimeout(r, 30))
    const audio = await resampleTo16kMono(bytes.buffer)

    // 화자 분리
    const { segments, speakers } = await runDiarization(audio, sessionId)

    // 본인 매핑
    currentJob = { sessionId, status: 'mapping', progress: 0.9, message: '본인 화자 매핑 중...' }
    notify()

    const userSpeakerId = mapUserSpeaker(speakers)
    const updatedSpeakers = speakers.map((s) => ({
      ...s,
      isUser: s.speakerId === userSpeakerId,
    }))

    const userDuration = updatedSpeakers
      .filter((s) => s.isUser)
      .reduce((sum, s) => sum + s.totalDurationSec, 0)
    const peerDuration = updatedSpeakers
      .filter((s) => !s.isUser)
      .reduce((sum, s) => sum + s.totalDurationSec, 0)

    const result: DiarizationResult = {
      sessionId,
      status: 'done',
      segments,
      speakers: updatedSpeakers,
      totalSpeakers: speakers.length,
      totalDurationSec: segments.reduce((sum, s) => sum + s.durationSec, 0),
      processedAt: new Date().toISOString(),
      error: null,
      userSpeakerId,
      userDurationSec: Math.round(userDuration * 10) / 10,
      peerDurationSec: Math.round(peerDuration * 10) / 10,
    }

    saveToCache(result)
    currentJob = { sessionId, status: 'done', progress: 1, message: '화자 분리 완료' }
    isProcessing = false
    notify()
    return result
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
