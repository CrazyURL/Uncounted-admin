// 저신뢰(웅얼거림) 단어 소프트플래그 — 순수 로직.
// 설계: uncounted-voice-api/docs/design_review_panel_redesign_20260603.md §4
//
// 목적: '오역 적출기'가 아니라 '저신뢰 구간 통과 가속기'.
//   word.probability 가 낮은(=Whisper가 확신 못한) 단어에 하이라이트를 쳐
//   검수자가 웅얼거림 구간을 빠르게 집중/스킵하게 한다.
//   확신에 찬 오역(수석님→선생님)은 못 잡는다(설계 §4 한계 명시). 자동수정 없음.

import type { TranscriptWord } from './api/transcripts'

export type FlagSeverity = 'none' | 'low' | 'high'

export interface ConfidenceFlagConfig {
  /** 이 확률 미만이면 플래그(low). 시각 캘리브레이션 대상. */
  threshold: number
  /** 이 확률 미만이면 high(더 진한 강조). */
  highThreshold: number
  /** 이 글자수 미만 단어는 플래그 제외 (네·거 등 짧은 고빈도어 노이즈 억제). */
  minWordLength: number
}

export const DEFAULT_FLAG_CONFIG: ConfidenceFlagConfig = {
  threshold: 0.5,
  highThreshold: 0.2,
  minWordLength: 2,
}

const CONTENT_CHAR = /[0-9A-Za-z가-힣]/g

/** 문장부호/공백 제외 실제 글자수. */
export function contentLength(word: string): number {
  const matched = (word ?? '').match(CONTENT_CHAR)
  return matched ? matched.length : 0
}

/** 단어 1개의 플래그 심각도. probability 없음/NaN/짧은단어 → 'none'. */
export function flagSeverity(
  word: Pick<TranscriptWord, 'word' | 'probability'>,
  config: ConfidenceFlagConfig = DEFAULT_FLAG_CONFIG,
): FlagSeverity {
  const p = word?.probability
  if (p == null || Number.isNaN(p)) return 'none'
  if (contentLength(word?.word ?? '') < config.minWordLength) return 'none'
  if (p < config.highThreshold) return 'high'
  if (p < config.threshold) return 'low'
  return 'none'
}

export interface FlaggedWord extends TranscriptWord {
  index: number
  severity: FlagSeverity
}

/**
 * 단어 배열에 플래그 상태 부여. dismissed 에 든 index 는 'none'으로 강등(검수자가 확인 완료).
 * immutable — 입력 미변형, 신규 배열 반환.
 */
export function flagWords(
  words: readonly TranscriptWord[],
  config: ConfidenceFlagConfig = DEFAULT_FLAG_CONFIG,
  dismissed: ReadonlySet<number> = new Set<number>(),
): FlaggedWord[] {
  return words.map((w, index) => ({
    ...w,
    index,
    severity: dismissed.has(index) ? 'none' : flagSeverity(w, config),
  }))
}

export interface FlagCounts {
  low: number
  high: number
  flagged: number
  total: number
}

export function countFlags(flagged: readonly FlaggedWord[]): FlagCounts {
  const low = flagged.filter(w => w.severity === 'low').length
  const high = flagged.filter(w => w.severity === 'high').length
  return { low, high, flagged: low + high, total: flagged.length }
}
