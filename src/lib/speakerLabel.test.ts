import { describe, it, expect } from 'vitest'
import { speakerDisplayLabel } from './speakerLabel'

describe('speakerDisplayLabel', () => {
  it('역할이 self면 본인', () => {
    expect(speakerDisplayLabel('SPEAKER_00', 'self')).toBe('본인')
  })

  it('역할이 other면 상대방', () => {
    expect(speakerDisplayLabel('SPEAKER_01', 'other')).toBe('상대방')
  })

  it('역할 대소문자/공백을 normalize', () => {
    expect(speakerDisplayLabel('SPEAKER_01', ' SELF ')).toBe('본인')
    expect(speakerDisplayLabel('SPEAKER_00', 'OTHER')).toBe('상대방')
  })

  it('역할이 없으면 라벨 숫자 +1로 화자 N (0-기반)', () => {
    expect(speakerDisplayLabel('SPEAKER_00', null)).toBe('화자 1')
    expect(speakerDisplayLabel('SPEAKER_01', null)).toBe('화자 2')
    expect(speakerDisplayLabel('SPEAKER_05', null)).toBe('화자 6')
  })

  it('SPEAKER_ 외 변형(S00, speaker_01, SPEAKER_5)도 처리', () => {
    expect(speakerDisplayLabel('S00', null)).toBe('화자 1')
    expect(speakerDisplayLabel('S01', null)).toBe('화자 2')
    expect(speakerDisplayLabel('speaker_01', null)).toBe('화자 2')
    expect(speakerDisplayLabel('SPEAKER_5', null)).toBe('화자 6')
  })

  it('미지의 역할은 화자 N fallback', () => {
    expect(speakerDisplayLabel('SPEAKER_00', 'unknown')).toBe('화자 1')
  })

  it('숫자 없는 라벨은 원본 유지', () => {
    expect(speakerDisplayLabel('weird-label', null)).toBe('weird-label')
  })

  it('빈 문자열은 대시', () => {
    expect(speakerDisplayLabel('', null)).toBe('-')
  })
})
