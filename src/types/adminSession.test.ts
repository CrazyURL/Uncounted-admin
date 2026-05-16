import { describe, it, expect } from 'vitest'
import {
  getPipelineState,
  getActiveStageLabel,
  isPipelineComplete,
  pipelineProgress,
  firstFailedStep,
  type SessionPipeline,
} from './adminSession'

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-05-16T12:00:00Z')
const ago = (minutes: number) =>
  new Date(FIXED_NOW.getTime() - minutes * 60 * 1000).toISOString()

function allPending(): SessionPipeline {
  return {
    upload_status: 'pending',
    stt_status: 'pending',
    diarize_status: 'pending',
    pii_status: 'pending',
    auto_label_status: 'pending',
    quality_status: 'pending',
  }
}

function allDone(): SessionPipeline {
  return {
    upload_status: 'done',
    uploaded_at: ago(120),
    stt_status: 'done',
    stt_at: ago(90),
    diarize_status: 'done',
    diarize_at: ago(60),
    pii_status: 'done',
    pii_at: ago(45),
    auto_label_status: 'done',
    label_at: ago(30),
    quality_status: 'done',
    quality_at: ago(15),
  }
}

// ── getPipelineState ──────────────────────────────────────────────────────────

describe('getPipelineState', () => {
  describe('idle', () => {
    it('모든 단계 pending → idle', () => {
      expect(getPipelineState(allPending(), FIXED_NOW)).toBe('idle')
    })

    it('모든 단계 undefined → idle', () => {
      expect(getPipelineState({}, FIXED_NOW)).toBe('idle')
    })

    it('일부 undefined, 나머지 pending → idle', () => {
      expect(getPipelineState({ upload_status: 'pending' }, FIXED_NOW)).toBe('idle')
    })
  })

  describe('ready', () => {
    it('모든 단계 done → ready', () => {
      expect(getPipelineState(allDone(), FIXED_NOW)).toBe('ready')
    })

    it('모든 단계 done/skipped 혼합 → ready', () => {
      const s: SessionPipeline = {
        ...allDone(),
        auto_label_status: 'skipped',
        label_at: ago(35),
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('ready')
    })

    it('auto_label_status=skipped 포함 전부 완료 → ready', () => {
      const s: SessionPipeline = {
        upload_status: 'done',    uploaded_at: ago(120),
        stt_status: 'done',       stt_at: ago(90),
        diarize_status: 'done',   diarize_at: ago(60),
        pii_status: 'done',       pii_at: ago(45),
        auto_label_status: 'skipped', label_at: ago(40),
        quality_status: 'done',   quality_at: ago(15),
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('ready')
    })
  })

  describe('failed', () => {
    it('upload_status=failed → failed', () => {
      expect(getPipelineState({ ...allPending(), upload_status: 'failed' }, FIXED_NOW)).toBe('failed')
    })

    it('stt_status=failed → failed', () => {
      expect(getPipelineState({ ...allDone(), stt_status: 'failed' }, FIXED_NOW)).toBe('failed')
    })

    it('auto_label_status=failed → failed', () => {
      expect(getPipelineState({ ...allDone(), auto_label_status: 'failed' }, FIXED_NOW)).toBe('failed')
    })

    it('quality_status=failed → failed', () => {
      expect(getPipelineState({ ...allPending(), quality_status: 'failed' }, FIXED_NOW)).toBe('failed')
    })
  })

  describe('running', () => {
    it('stt_status=running, 시작 10분 전 → running', () => {
      const s: SessionPipeline = {
        upload_status: 'done', uploaded_at: ago(10),
        stt_status: 'running',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('running')
    })

    it('첫 번째 단계(upload) running → running (prevAt 없음 → stuck 아님)', () => {
      const s: SessionPipeline = { upload_status: 'running' }
      expect(getPipelineState(s, FIXED_NOW)).toBe('running')
    })

    it('diarize_status=running, 진입 시각 5분 전 → running', () => {
      const s: SessionPipeline = {
        upload_status: 'done', uploaded_at: ago(100),
        stt_status: 'done',    stt_at: ago(5),
        diarize_status: 'running',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('running')
    })
  })

  describe('stuck', () => {
    it('stt_status=running, uploaded_at 31분 전 → stuck', () => {
      const s: SessionPipeline = {
        upload_status: 'done', uploaded_at: ago(31),
        stt_status: 'running',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('stuck')
    })

    it('정확히 30분 전은 stuck 아님 (>30분 조건)', () => {
      const s: SessionPipeline = {
        upload_status: 'done', uploaded_at: ago(30),
        stt_status: 'running',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('running')
    })

    it('pii_status=running, diarize_at 60분 전 → stuck', () => {
      const s: SessionPipeline = {
        upload_status: 'done',  uploaded_at: ago(180),
        stt_status: 'done',     stt_at: ago(120),
        diarize_status: 'done', diarize_at: ago(60),
        pii_status: 'running',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('stuck')
    })

    it('auto_label_status=running, pii_at 45분 전 → stuck', () => {
      const s: SessionPipeline = {
        ...allDone(),
        auto_label_status: 'running',
        quality_status: 'pending',
      }
      // pii_at = ago(45) from allDone fixture → >30분
      expect(getPipelineState(s, FIXED_NOW)).toBe('stuck')
    })
  })

  describe('waiting (일부 done, 일부 pending, running 없음)', () => {
    it('upload done, 나머지 pending → waiting', () => {
      const s: SessionPipeline = {
        upload_status: 'done', uploaded_at: ago(60),
        stt_status: 'pending',
        diarize_status: 'pending',
        pii_status: 'pending',
        auto_label_status: 'pending',
        quality_status: 'pending',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('waiting')
    })

    it('upload+stt done, 나머지 pending → waiting', () => {
      const s: SessionPipeline = {
        upload_status: 'done', uploaded_at: ago(60),
        stt_status: 'done',    stt_at: ago(30),
        diarize_status: 'pending',
        pii_status: 'pending',
        auto_label_status: 'pending',
        quality_status: 'pending',
      }
      expect(getPipelineState(s, FIXED_NOW)).toBe('waiting')
    })
  })
})

// ── getActiveStageLabel ────────────────────────────────────────────────────────

describe('getActiveStageLabel', () => {
  it('upload_status=running → "업로드"', () => {
    expect(getActiveStageLabel({ upload_status: 'running' })).toBe('업로드')
  })

  it('stt_status=running → "STT"', () => {
    expect(getActiveStageLabel({ upload_status: 'done', stt_status: 'running' })).toBe('STT')
  })

  it('diarize_status=running → "화자분리"', () => {
    expect(getActiveStageLabel({ diarize_status: 'running' })).toBe('화자분리')
  })

  it('pii_status=running → "개인정보"', () => {
    expect(getActiveStageLabel({ pii_status: 'running' })).toBe('개인정보')
  })

  it('auto_label_status=running → "자동 라벨링"', () => {
    expect(getActiveStageLabel({ auto_label_status: 'running' })).toBe('자동 라벨링')
  })

  it('quality_status=running → "품질 처리"', () => {
    expect(getActiveStageLabel({ quality_status: 'running' })).toBe('품질 처리')
  })

  it('아무것도 running 아님 → null', () => {
    expect(getActiveStageLabel(allDone())).toBeNull()
  })

  it('빈 세션 → null', () => {
    expect(getActiveStageLabel({})).toBeNull()
  })
})

// ── isPipelineComplete ─────────────────────────────────────────────────────────

describe('isPipelineComplete', () => {
  it('모두 done → true', () => {
    expect(isPipelineComplete(allDone())).toBe(true)
  })

  it('auto_label_status=skipped 포함 전부 완료 → true', () => {
    const s: SessionPipeline = { ...allDone(), auto_label_status: 'skipped', label_at: ago(35) }
    expect(isPipelineComplete(s)).toBe(true)
  })

  it('일부 pending → false', () => {
    expect(isPipelineComplete(allPending())).toBe(false)
  })

  it('failed 포함 → false', () => {
    expect(isPipelineComplete({ ...allDone(), stt_status: 'failed' })).toBe(false)
  })

  it('빈 세션 → false', () => {
    expect(isPipelineComplete({})).toBe(false)
  })
})

// ── pipelineProgress ──────────────────────────────────────────────────────────

describe('pipelineProgress', () => {
  it('모두 pending → 0', () => {
    expect(pipelineProgress(allPending())).toBe(0)
  })

  it('모두 done → 1', () => {
    expect(pipelineProgress(allDone())).toBe(1)
  })

  it('3단계 완료 → 0.5 (3/6)', () => {
    const s: SessionPipeline = {
      upload_status: 'done',
      stt_status: 'done',
      diarize_status: 'done',
      pii_status: 'pending',
      auto_label_status: 'pending',
      quality_status: 'pending',
    }
    expect(pipelineProgress(s)).toBeCloseTo(0.5)
  })

  it('skipped도 완료로 간주 → 올바른 비율', () => {
    const s: SessionPipeline = {
      upload_status: 'done',
      stt_status: 'done',
      diarize_status: 'done',
      pii_status: 'done',
      auto_label_status: 'skipped',
      quality_status: 'pending',
    }
    expect(pipelineProgress(s)).toBeCloseTo(5 / 6)
  })

  it('빈 세션 → 0', () => {
    expect(pipelineProgress({})).toBe(0)
  })
})

// ── firstFailedStep ───────────────────────────────────────────────────────────

describe('firstFailedStep', () => {
  it('실패 없음 → null', () => {
    expect(firstFailedStep(allDone())).toBeNull()
  })

  it('upload failed → "upload"', () => {
    expect(firstFailedStep({ upload_status: 'failed' })).toBe('upload')
  })

  it('stt failed → "stt"', () => {
    expect(firstFailedStep({ stt_status: 'failed' })).toBe('stt')
  })

  it('diarize failed → "diarize"', () => {
    expect(firstFailedStep({ diarize_status: 'failed' })).toBe('diarize')
  })

  it('pii failed → "pii"', () => {
    expect(firstFailedStep({ pii_status: 'failed' })).toBe('pii')
  })

  it('auto_label failed → "auto_label"', () => {
    expect(firstFailedStep({ auto_label_status: 'failed' })).toBe('auto_label')
  })

  it('quality failed → "quality"', () => {
    expect(firstFailedStep({ quality_status: 'failed' })).toBe('quality')
  })

  it('빈 세션 → null', () => {
    expect(firstFailedStep({})).toBeNull()
  })
})
