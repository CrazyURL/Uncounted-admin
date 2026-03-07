// ── 데이터 준비 파이프라인 전역 상태 ─────────────────────────────────────────
// sharePrepStore.ts 패턴 동일: 모듈 레벨 싱글턴 + useSyncExternalStore
// localStorage 영속화: 앱 재시작 후에도 진척도 유지

import { useSyncExternalStore } from 'react'

export type PipelineStage = 'scan' | 'stt' | 'pii' | 'label'
export type StageStatus = 'idle' | 'running' | 'done' | 'error'

export type PipelineStageState = {
  status: StageStatus
  progress: number // 0~100
  total: number
  done: number
}

export type PipelineState = {
  scan: PipelineStageState
  stt: PipelineStageState
  pii: PipelineStageState
  label: PipelineStageState
  overallComplete: boolean
  startedAt: number | null
}

function makeIdle(): PipelineStageState {
  return { status: 'idle', progress: 0, total: 0, done: 0 }
}

// ── localStorage 영속화 ──────────────────────────────────────────────────────

const PIPELINE_STATE_KEY = 'uncounted_pipeline_state'

function persist(s: PipelineState): void {
  try {
    localStorage.setItem(PIPELINE_STATE_KEY, JSON.stringify(s))
  } catch { /* ignore */ }
}

function restore(): PipelineState {
  try {
    const raw = localStorage.getItem(PIPELINE_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PipelineState
      // 복원 시 running 상태는 interrupted로 간주 — idle로 다운그레이드하지 않음
      // (HomePage에서 "일시정지됨" UI로 처리)
      if (parsed.startedAt && typeof parsed.startedAt === 'number') {
        return parsed
      }
    }
  } catch { /* ignore */ }
  return {
    scan: makeIdle(),
    stt: makeIdle(),
    pii: makeIdle(),
    label: makeIdle(),
    overallComplete: false,
    startedAt: null,
  }
}

// ── 모듈 상태 ──────────────────────────────────────────────────────────────────

let state: PipelineState = restore()

let listeners: Array<() => void> = []

function notify() {
  persist(state)
  for (const l of listeners) l()
}

// ── 외부 API ───────────────────────────────────────────────────────────────────

export function getPipelineSnapshot(): PipelineState {
  return state
}

export function subscribePipeline(listener: () => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function pipelineStart(): void {
  state = {
    scan: makeIdle(),
    stt: makeIdle(),
    pii: makeIdle(),
    label: makeIdle(),
    overallComplete: false,
    startedAt: Date.now(),
  }
  notify()
}

export function pipelineUpdateStage(
  stage: PipelineStage,
  update: Partial<PipelineStageState>,
): void {
  state = { ...state, [stage]: { ...state[stage], ...update } }
  notify()
}

export function pipelineMarkComplete(): void {
  state = { ...state, overallComplete: true }
  notify()
}

export function pipelineReset(): void {
  state = {
    scan: makeIdle(),
    stt: makeIdle(),
    pii: makeIdle(),
    label: makeIdle(),
    overallComplete: false,
    startedAt: null,
  }
  try { localStorage.removeItem(PIPELINE_STATE_KEY) } catch { /* ignore */ }
  notify()
}

/** 파이프라인이 중단된 상태인지 확인 (크래시 후 재개 판단용) */
export function isPipelineInterrupted(): boolean {
  if (state.overallComplete) return false
  if (!state.startedAt) return false
  const stages: PipelineStage[] = ['scan', 'stt', 'pii', 'label']
  return stages.some(s => state[s].status === 'running')
}

// 가중 평균: scan 20%, stt 30%, pii 30%, label 20%
const WEIGHT: Record<PipelineStage, number> = {
  scan: 0.2,
  stt: 0.3,
  pii: 0.3,
  label: 0.2,
}

export function calcOverallProgress(s: PipelineState): number {
  let total = 0
  for (const key of ['scan', 'stt', 'pii', 'label'] as PipelineStage[]) {
    const st = s[key]
    const pct = st.status === 'done' ? 100 : st.progress
    total += pct * WEIGHT[key]
  }
  return Math.round(total)
}

// ── React hook ─────────────────────────────────────────────────────────────────

export function usePipelineState(): PipelineState {
  return useSyncExternalStore(subscribePipeline, getPipelineSnapshot)
}
