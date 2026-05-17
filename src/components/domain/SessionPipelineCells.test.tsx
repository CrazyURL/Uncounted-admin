import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SessionPipelineCells } from './SessionPipelineCells'
import type { AdminSession } from '../../types/adminSession'

function makeSession(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    id: 'session-001',
    user_id: 'user-abc',
    date: '2026-01-01',
    duration_seconds: 120,
    consent_status: 'both_agreed',
    created_at: '2026-01-01T00:00:00Z',
    upload_status: 'pending',
    stt_status: 'pending',
    diarize_status: 'pending',
    pii_status: 'pending',
    auto_label_status: 'pending',
    quality_status: 'pending',
    ...overrides,
  }
}

describe('SessionPipelineCells', () => {
  // ── 업로드 실패 특수 케이스 ──────────────────────────────────────────────
  describe('upload_status=failed 특수 케이스', () => {
    it('도트 1개 + 업로드 실패 텍스트만 표시', () => {
      const { container } = render(<SessionPipelineCells session={makeSession({ upload_status: 'failed' })} />)
      const dots = container.querySelectorAll('.rounded-full')
      expect(dots).toHaveLength(1)
      expect(screen.getByText('업로드 실패')).toBeTruthy()
    })

    it('도트는 danger 색상', () => {
      const { container } = render(<SessionPipelineCells session={makeSession({ upload_status: 'failed' })} />)
      const dot = container.querySelector('.rounded-full')
      expect(dot?.className).toContain('bg-danger')
    })

    it('⚠ 경고 아이콘 없음 (업로드 실패 케이스에서는 별도 ⚠ 미표시)', () => {
      render(<SessionPipelineCells session={makeSession({ upload_status: 'failed' })} />)
      expect(screen.queryByText('⚠')).toBeNull()
    })
  })

  // ── 정상 케이스: 도트 개수 ────────────────────────────────────────────────
  describe('도트 개수', () => {
    it('전체 pending → 도트 7개 (6단계 + 완료)', () => {
      const { container } = render(<SessionPipelineCells session={makeSession()} />)
      const dots = container.querySelectorAll('.rounded-full')
      expect(dots).toHaveLength(7)
    })

    it('전체 done → 도트 7개', () => {
      const session = makeSession({
        upload_status: 'done',
        stt_status: 'done',
        diarize_status: 'done',
        pii_status: 'done',
        auto_label_status: 'done',
        quality_status: 'done',
      })
      const { container } = render(<SessionPipelineCells session={session} />)
      expect(container.querySelectorAll('.rounded-full')).toHaveLength(7)
    })
  })

  // ── 도트 색상 ────────────────────────────────────────────────────────────
  describe('도트 색상', () => {
    it('pending → bg-muted 클래스', () => {
      const { container } = render(<SessionPipelineCells session={makeSession()} />)
      const firstDot = container.querySelectorAll('.rounded-full')[0]
      expect(firstDot?.className).toContain('bg-muted')
    })

    it('done → bg-success 클래스', () => {
      const session = makeSession({ upload_status: 'done' })
      const { container } = render(<SessionPipelineCells session={session} />)
      const uploadDot = container.querySelector('[aria-label="업로드 done"]')
      expect(uploadDot?.className).toContain('bg-success')
    })

    it('running → bg-accent animate-pulse 클래스', () => {
      const session = makeSession({ stt_status: 'running' })
      const { container } = render(<SessionPipelineCells session={session} />)
      const sttDot = container.querySelector('[aria-label="음성 인식 running"]')
      expect(sttDot?.className).toContain('bg-accent')
      expect(sttDot?.className).toContain('animate-pulse')
    })

    it('failed → bg-danger 클래스', () => {
      const session = makeSession({ stt_status: 'failed' })
      const { container } = render(<SessionPipelineCells session={session} />)
      const sttDot = container.querySelector('[aria-label="음성 인식 failed"]')
      expect(sttDot?.className).toContain('bg-danger')
    })
  })

  // ── 완료 도트 ─────────────────────────────────────────────────────────────
  describe('완료 도트 (7번째)', () => {
    it('전체 pending → aria-label="완료 pending"', () => {
      const { container } = render(<SessionPipelineCells session={makeSession()} />)
      const doneDot = container.querySelector('[aria-label="완료 pending"]')
      expect(doneDot).toBeTruthy()
      expect(doneDot?.className).toContain('bg-muted')
    })

    it('전체 done → aria-label="완료 done"', () => {
      const session = makeSession({
        upload_status: 'done',
        stt_status: 'done',
        diarize_status: 'done',
        pii_status: 'done',
        auto_label_status: 'done',
        quality_status: 'done',
      })
      const { container } = render(<SessionPipelineCells session={session} />)
      const doneDot = container.querySelector('[aria-label="완료 done"]')
      expect(doneDot).toBeTruthy()
      expect(doneDot?.className).toContain('bg-success')
    })

    it('일부만 done → aria-label="완료 pending"', () => {
      const session = makeSession({ upload_status: 'done', stt_status: 'done' })
      const { container } = render(<SessionPipelineCells session={session} />)
      expect(container.querySelector('[aria-label="완료 pending"]')).toBeTruthy()
    })
  })

  // ── aria-label 검증 ───────────────────────────────────────────────────────
  describe('aria-label', () => {
    it('각 단계 aria-label 형식: "단계명 상태"', () => {
      const session = makeSession({
        upload_status: 'done',
        stt_status: 'running',
        diarize_status: 'failed',
        pii_status: 'pending',
        auto_label_status: 'skipped',
        quality_status: 'pending',
      })
      const { container } = render(<SessionPipelineCells session={session} />)
      expect(container.querySelector('[aria-label="업로드 done"]')).toBeTruthy()
      expect(container.querySelector('[aria-label="음성 인식 running"]')).toBeTruthy()
      expect(container.querySelector('[aria-label="화자 분리 failed"]')).toBeTruthy()
      expect(container.querySelector('[aria-label="개인정보 마스킹 pending"]')).toBeTruthy()
      expect(container.querySelector('[aria-label="자동 라벨링 skipped"]')).toBeTruthy()
      expect(container.querySelector('[aria-label="품질 검증 pending"]')).toBeTruthy()
    })
  })

  // ── ⚠ 경고 아이콘 ─────────────────────────────────────────────────────────
  describe('⚠ 경고 아이콘', () => {
    it('실패 단계 있으면 ⚠ 표시', () => {
      const session = makeSession({ stt_status: 'failed' })
      render(<SessionPipelineCells session={session} />)
      expect(screen.getByText('⚠')).toBeTruthy()
    })

    it('실패 단계 없으면 ⚠ 미표시', () => {
      render(<SessionPipelineCells session={makeSession()} />)
      expect(screen.queryByText('⚠')).toBeNull()
    })

    it('모두 done이면 ⚠ 미표시', () => {
      const session = makeSession({
        upload_status: 'done',
        stt_status: 'done',
        diarize_status: 'done',
        pii_status: 'done',
        auto_label_status: 'done',
        quality_status: 'done',
      })
      render(<SessionPipelineCells session={session} />)
      expect(screen.queryByText('⚠')).toBeNull()
    })

    it('quality_status=failed → ⚠ 표시', () => {
      const session = makeSession({ quality_status: 'failed' })
      render(<SessionPipelineCells session={session} />)
      expect(screen.getByText('⚠')).toBeTruthy()
    })
  })
})
