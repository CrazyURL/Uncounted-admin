import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportMinSaleableDataset } from './adminHelpers'
import type { AdminSession } from '../types/adminSession'
import type { AdminUtterance } from './api/utterances'

// ── 픽스처 ───────────────────────────────────────────────────────────────────

function donePipeline() {
  return {
    upload_status: 'done' as const,
    uploaded_at: '2026-05-19T01:00:00Z',
    stt_status: 'done' as const,
    stt_at: '2026-05-19T01:05:00Z',
    diarize_status: 'done' as const,
    diarize_at: '2026-05-19T01:10:00Z',
    pii_status: 'done' as const,
    pii_at: '2026-05-19T01:15:00Z',
    auto_label_status: 'done' as const,
    label_at: '2026-05-19T01:20:00Z',
    quality_status: 'done' as const,
    quality_at: '2026-05-19T01:25:00Z',
  }
}

function makeSellableSession(id: string): AdminSession {
  return {
    id,
    user_id: `user_${id}`,
    title: null,
    date: '2026-05-19',
    duration_seconds: 600,
    consent_status: 'both_agreed',
    created_at: '2026-05-19T00:00:00Z',
    pii_flag: false,
    pii_count: 0,
    quality_grade_min: 'A',
    quality_score_avg: 90,
    snr_db_avg: 25,
    speech_ratio_avg: 0.8,
    speakers: [],
    review_status: 'approved',
    ...donePipeline(),
  }
}

function makeRestrictedSession(id: string): AdminSession {
  return {
    ...makeSellableSession(id),
    review_status: 'pending',
  }
}

function makeUtterance(id: string, sessionId: string, reviewStatus: 'pending' | 'excluded' = 'pending'): AdminUtterance {
  return {
    id,
    session_id: sessionId,
    session_title: null,
    session_duration_sec: 600,
    session_review_status: 'approved',
    session_consent_status: 'both_agreed',
    speaker_id: 'SPEAKER_00',
    session_speaker_id: null,
    speaker_role: 'candidate',
    speaker_gender: null,
    speaker_voice_age_range: null,
    segment_id: null,
    segment_topic: null,
    start_ms: 0,
    end_ms: 1000,
    duration_seconds: 1,
    text: 'hello',
    unit_price_krw: 50,
    settled_at: null,
    review_status: reviewStatus,
    exclude_reason: null,
    reviewed_at: null,
    emotion: null,
    emotion_confidence: null,
    dialog_act: null,
    dialog_act_confidence: null,
    label_source: null,
    auto_label_model_version: null,
  }
}

// ── DOM 다운로드 트리거 spy ──────────────────────────────────────────────────

let createObjectURLSpy: ReturnType<typeof vi.spyOn>
let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── 테스트 케이스 ─────────────────────────────────────────────────────────────

describe('exportMinSaleableDataset', () => {
  it('case 1: eligibleSessions 0건이면 count: 0 + URL.createObjectURL 호출 0회 (버그 회귀 가드)', async () => {
    const result = await exportMinSaleableDataset({
      sessions: [],
      utterancesBySessionId: {},
      exportType: 'all_filtered',
      includeRestricted: false,
    })

    expect(result.count).toBe(0)
    expect(result.error).toBeUndefined()
    expect(createObjectURLSpy).toHaveBeenCalledTimes(0)
  })

  it('case 2: sellable 세션 1건이면 count: 1 + URL.createObjectURL 호출 1회', async () => {
    const session = makeSellableSession('s1')
    const utt = makeUtterance('u1', 's1')

    const result = await exportMinSaleableDataset({
      sessions: [session],
      utterancesBySessionId: { s1: [utt] },
      exportType: 'all_filtered',
      includeRestricted: false,
    })

    expect(result.count).toBe(1)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
  })

  it('case 3: includeRestricted=false + restricted 세션만이면 eligible 0 → 다운로드 0회', async () => {
    const session = makeRestrictedSession('s1')
    const utt = makeUtterance('u1', 's1')

    const result = await exportMinSaleableDataset({
      sessions: [session],
      utterancesBySessionId: { s1: [utt] },
      exportType: 'all_filtered',
      includeRestricted: false,
    })

    expect(result.count).toBe(0)
    expect(result.skipped).toBe(1)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(0)
  })

  it('case 4: includeRestricted=true + restricted 세션 1건이면 count: 1 + 다운로드 1회', async () => {
    const session = makeRestrictedSession('s1')
    const utt = makeUtterance('u1', 's1')

    const result = await exportMinSaleableDataset({
      sessions: [session],
      utterancesBySessionId: { s1: [utt] },
      exportType: 'all_filtered',
      includeRestricted: true,
    })

    expect(result.count).toBe(1)
    expect(result.skipped).toBe(0)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
  })

  it('case 5: 단건 회귀 (exportType=single, includeRestricted=true, restricted 세션) — 기존처럼 정상 다운로드', async () => {
    const session = makeRestrictedSession('s1')
    const utt = makeUtterance('u1', 's1')

    const result = await exportMinSaleableDataset({
      sessions: [session],
      utterancesBySessionId: { s1: [utt] },
      exportType: 'single',
      includeRestricted: true,
    })

    expect(result.count).toBe(1)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
  })
})
