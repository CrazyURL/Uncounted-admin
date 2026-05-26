// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  describePipelineFailure,
  MAX_PIPELINE_RETRY,
  type SessionPipeline,
} from './adminSession'

describe('describePipelineFailure', () => {
  it('실패 단계가 없으면 null', () => {
    expect(describePipelineFailure({ upload_status: 'done', stt_status: 'running' })).toBeNull()
    expect(describePipelineFailure({})).toBeNull()
  })

  it('원음 부재 업로드 실패 → 진짜 "업로드 실패" + 재업로드 안내', () => {
    const info = describePipelineFailure({ upload_status: 'failed', raw_audio_url_present: false })!
    expect(info.step).toBe('upload')
    expect(info.stageLabel).toBe('업로드')
    expect(info.reasonLabel).toBe('업로드 실패')
    expect(info.nextAction).toContain('재업로드')
  })

  it('원음 존재 + poll 타임아웃 + 재시도 소진 → "GPU 처리"로 표기, 수동 재처리 안내', () => {
    const s: SessionPipeline = {
      upload_status: 'failed',
      raw_audio_url_present: true,
      upload_error_message: 'poll_job timeout 600s: abc123',
      upload_retry_count: 3,
    }
    const info = describePipelineFailure(s)!
    expect(info.stageLabel).toBe('GPU 처리') // 앱 업로드 실패 아님
    expect(info.reasonLabel).toBe('처리 시간 초과')
    expect(info.retryCount).toBe(MAX_PIPELINE_RETRY)
    expect(info.retryExhausted).toBe(true)
    expect(info.nextAction).toContain('수동 재처리')
    expect(info.detail).toBe('poll_job timeout 600s: abc123')
  })

  it('원음 존재 + 재시도 미소진 → 재시도 대기/점검 안내', () => {
    const info = describePipelineFailure({
      upload_status: 'failed',
      raw_audio_url_present: true,
      upload_error_message: 'poll_job timeout 600s: x',
      upload_retry_count: 1,
    })!
    expect(info.retryExhausted).toBe(false)
    expect(info.nextAction).not.toContain('소진')
  })

  it('retry_count 미상(null) → retryExhausted=false, retryCount=null', () => {
    const info = describePipelineFailure({ upload_status: 'failed', raw_audio_url_present: true })!
    expect(info.retryCount).toBeNull()
    expect(info.retryExhausted).toBe(false)
  })

  it('비-업로드 단계(STT) 실패 → 단계명 STT + 처리 로그 확인 안내', () => {
    const info = describePipelineFailure({ upload_status: 'done', stt_status: 'failed' })!
    expect(info.step).toBe('stt')
    expect(info.stageLabel).toBe('STT')
    expect(info.reasonLabel).toBe('처리 실패')
    expect(info.nextAction).toContain('처리 로그')
  })
})
