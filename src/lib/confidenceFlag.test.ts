import { describe, it, expect } from 'vitest'
import {
  contentLength,
  flagSeverity,
  flagWords,
  countFlags,
  DEFAULT_FLAG_CONFIG,
  type ConfidenceFlagConfig,
} from './confidenceFlag'

const w = (word: string, probability: number) => ({ word, start: 0, end: 1, probability })

describe('contentLength', () => {
  it('문장부호/공백 제외 글자수', () => {
    expect(contentLength('제품하고,')).toBe(4)
    expect(contentLength('뭐?')).toBe(1)
    expect(contentLength('DLP')).toBe(3)
    expect(contentLength('...')).toBe(0)
  })
})

describe('flagSeverity', () => {
  it('임계 미만이면 low', () => {
    expect(flagSeverity(w('제품하고', 0.4))).toBe('low')
  })
  it('high임계 미만이면 high', () => {
    expect(flagSeverity(w('인증서', 0.1))).toBe('high')
  })
  it('임계 이상이면 none', () => {
    expect(flagSeverity(w('인증서', 0.95))).toBe('none')
  })
  it('짧은 고빈도어는 확률 낮아도 제외 (노이즈 억제)', () => {
    expect(flagSeverity(w('네', 0.02))).toBe('none')
    expect(flagSeverity(w('그', 0.19))).toBe('none')
  })
  it('probability 없음/NaN → none', () => {
    expect(flagSeverity({ word: '단어', probability: NaN })).toBe('none')
    expect(flagSeverity({ word: '단어', probability: undefined as unknown as number })).toBe('none')
  })
  it('임계는 캘리브레이션 가능 — threshold 올리면 더 많이 플래그', () => {
    const loose: ConfidenceFlagConfig = { ...DEFAULT_FLAG_CONFIG, threshold: 0.8 }
    expect(flagSeverity(w('브라우저라', 0.74))).toBe('none') // 기본 0.5
    expect(flagSeverity(w('브라우저라', 0.74), loose)).toBe('low') // 0.8
  })
})

describe('flagWords + countFlags', () => {
  const words = [
    w('인증서', 0.95),
    w('제품하고', 0.45), // low
    w('DLP', 0.14), // high (정답이지만 저확률 → 오탐, 캘리브레이션에서 확인)
    w('네', 0.02), // 짧음 → none
  ]
  it('단어별 severity 부여', () => {
    const flagged = flagWords(words)
    expect(flagged.map(f => f.severity)).toEqual(['none', 'low', 'high', 'none'])
  })
  it('dismissed index는 none으로 강등', () => {
    const flagged = flagWords(words, DEFAULT_FLAG_CONFIG, new Set([1, 2]))
    expect(flagged[1].severity).toBe('none')
    expect(flagged[2].severity).toBe('none')
  })
  it('countFlags 집계', () => {
    expect(countFlags(flagWords(words))).toEqual({ low: 1, high: 1, flagged: 2, total: 4 })
  })
  it('immutable — 입력 미변형', () => {
    const original = JSON.parse(JSON.stringify(words))
    flagWords(words)
    expect(words).toEqual(original)
  })
})
