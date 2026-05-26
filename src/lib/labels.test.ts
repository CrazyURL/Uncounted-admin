import { describe, it, expect } from 'vitest'
import { classifyPipelineFailureLabel, classifyUploadFailureLabel, labels } from './labels'
import type { SessionPipeline } from '../types/adminSession'

describe('classifyUploadFailureLabel — 업로드 실패 사유 세분화', () => {
  it('raw_audio_url 부재면 "업로드 실패" (진짜 원음 미도달)', () => {
    expect(classifyUploadFailureLabel('econnrefused', false)).toBe(labels.uploadFailure.actualUpload)
  })

  it('접속 거부 오류는 "처리 서버 접속 실패"', () => {
    expect(classifyUploadFailureLabel('ECONNREFUSED localhost:8001', true)).toBe(
      labels.uploadFailure.connectionRefused,
    )
  })

  it('타임아웃 오류는 "처리 시간 초과"', () => {
    expect(classifyUploadFailureLabel('poll_job timeout', true)).toBe(labels.uploadFailure.pollTimeout)
  })

  it('사유 미상이면 "처리 오류"', () => {
    expect(classifyUploadFailureLabel(null, true)).toBe(labels.uploadFailure.generic)
  })
})

describe('classifyPipelineFailureLabel — 처리 흐름 실패 행 정보', () => {
  it('실패 단계 없으면 null', () => {
    const ok: SessionPipeline = {
      upload_status: 'done',
      stt_status: 'done',
      diarize_status: 'done',
      pii_status: 'done',
      auto_label_status: 'done',
      quality_status: 'done',
    }
    expect(classifyPipelineFailureLabel(ok)).toBeNull()
  })

  it('업로드 실패 + 원음 부재 → 단계=업로드, 사유=업로드 실패, 다음 액션=앱에서 재업로드', () => {
    const s: SessionPipeline = {
      upload_status: 'failed',
      raw_audio_url_present: false,
      upload_error_message: 'upload to s3 failed',
      upload_retry_count: 3,
    }
    const r = classifyPipelineFailureLabel(s)
    expect(r).not.toBeNull()
    expect(r!.step).toBe('upload')
    expect(r!.stageLabel).toBe(labels.pipeline.upload)
    expect(r!.reasonLabel).toBe(labels.uploadFailure.actualUpload)
    expect(r!.nextAction).toBe(labels.pipelineFailure.nextReupload)
    expect(r!.retryText).toBe('재시도 3/3회')
  })

  it('업로드 실패 + 원음 존재(접속 실패) → 다음 액션=재처리 필요', () => {
    const s: SessionPipeline = {
      upload_status: 'failed',
      raw_audio_url_present: true,
      upload_error_message: 'ECONNREFUSED localhost:8001',
      upload_retry_count: 1,
    }
    const r = classifyPipelineFailureLabel(s)!
    expect(r.reasonLabel).toBe(labels.uploadFailure.connectionRefused)
    expect(r.nextAction).toBe(labels.pipelineFailure.nextReprocess)
    expect(r.retryText).toBe('재시도 1/3회')
    expect(r.errorDetail).toBe('ECONNREFUSED localhost:8001')
  })

  it('재시도 0/null 이면 retryText 없음', () => {
    expect(
      classifyPipelineFailureLabel({ upload_status: 'failed', raw_audio_url_present: true, upload_retry_count: 0 })!
        .retryText,
    ).toBeNull()
    expect(
      classifyPipelineFailureLabel({ upload_status: 'failed', raw_audio_url_present: true })!.retryText,
    ).toBeNull()
  })

  it('비-업로드 단계(STT) 실패 → 단계=음성 인식, 사유=처리 오류, 다음 액션=재처리 필요, 재시도/원문 없음', () => {
    const s: SessionPipeline = {
      upload_status: 'done',
      stt_status: 'failed',
      upload_error_message: 'this is an upload-stage error string',
    }
    const r = classifyPipelineFailureLabel(s)!
    expect(r.step).toBe('stt')
    expect(r.stageLabel).toBe(labels.pipeline.stt)
    expect(r.reasonLabel).toBe(labels.pipelineFailure.reasonGeneric)
    expect(r.nextAction).toBe(labels.pipelineFailure.nextReprocess)
    expect(r.retryText).toBeNull()
    // gpu_last_error 는 업로드 전용 → 비-업로드 단계에서는 errorDetail 미사용
    expect(r.errorDetail).toBeNull()
  })

  it('품질 단계 실패도 firstFailedStep 순서대로 quality 로 잡힌다', () => {
    const r = classifyPipelineFailureLabel({
      upload_status: 'done',
      stt_status: 'done',
      diarize_status: 'done',
      pii_status: 'done',
      auto_label_status: 'done',
      quality_status: 'failed',
    })!
    expect(r.step).toBe('quality')
    expect(r.stageLabel).toBe(labels.pipeline.quality)
  })
})
