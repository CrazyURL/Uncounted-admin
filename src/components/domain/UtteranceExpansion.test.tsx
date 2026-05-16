import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UtteranceExpansion } from './UtteranceExpansion'
import type { AdminSession } from '../../types/adminSession'
import type { AdminUtterance } from '../../lib/api/utterances'

vi.mock('../../lib/piiRisk', () => ({
  analyzeSessionRisk: () => ({ level: 'low', reasons: [], dangerUttIds: new Set() }),
}))

vi.mock('../../lib/earnings', () => ({
  formatDuration: (sec: number) => `${sec}s`,
}))

vi.mock('./UtteranceReviewRow', () => ({
  UtteranceReviewRow: () => <div data-testid="utterance-row" />,
}))

vi.mock('./SessionReviewPanel', () => ({
  SessionReviewPanel: () => <div data-testid="session-review-panel" />,
}))

const baseSession: AdminSession = {
  id: 'sess-001',
  user_id: 'user-001',
  date: '2026-01-01',
  duration_seconds: 120,
  consent_status: 'both_agreed',
  created_at: '2026-01-01T00:00:00Z',
  review_status: 'in_review',
}

const baseUtterance: AdminUtterance = {
  id: 'utt-001',
  session_id: 'sess-001',
  session_title: null,
  session_duration_sec: null,
  session_review_status: 'in_review',
  session_consent_status: 'both_agreed',
  speaker_id: null,
  start_ms: 0,
  end_ms: 3000,
  duration_seconds: 3,
  text: '테스트 발화',
  unit_price_krw: 500,
  settled_at: null,
  review_status: 'pending',
  exclude_reason: null,
  reviewed_at: null,
  emotion: null,
  emotion_confidence: null,
  dialog_act: null,
  dialog_act_confidence: null,
  label_source: null,
  auto_label_model_version: null,
}

function renderExpansion(
  sessionOverride: Partial<AdminSession> = {},
  propOverrides: Partial<React.ComponentProps<typeof UtteranceExpansion>> = {},
) {
  const session = { ...baseSession, ...sessionOverride }
  return render(
    <UtteranceExpansion
      session={session}
      utterances={[baseUtterance]}
      selectedSet={new Set()}
      updatingId={null}
      onToggleUtterance={vi.fn()}
      onSelectAll={vi.fn()}
      onToggleReview={vi.fn()}
      onLabelSaved={vi.fn()}
      onApprove={vi.fn()}
      onNeedsRevision={vi.fn()}
      onRejectPanel={vi.fn()}
      {...propOverrides}
    />,
  )
}

// ── Fix #4: 준비 중 버튼 tooltip ─────────────────────────────────────────────

describe('Fix #4: 준비 중 버튼 tooltip', () => {
  it('"전체 듣기" 버튼이 비활성화되고 준비 중 title을 가진다', () => {
    renderExpansion()
    const btn = screen.getByRole('button', { name: /전체 듣기/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', '준비 중인 기능입니다')
  })

  it('"마스킹 전후 비교" 버튼이 비활성화되고 준비 중 title을 가진다', () => {
    renderExpansion()
    const btn = screen.getByRole('button', { name: /마스킹 전후 비교/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', '준비 중인 기능입니다')
  })
})

// ── Fix #1: 거절 버튼 confirm 가드 ───────────────────────────────────────────

describe('Fix #1: 거절 버튼 confirm 가드', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('검수 노트가 비어있을 때 거절 클릭 시 window.confirm 호출됨', () => {
    const onRejectPanel = vi.fn()
    renderExpansion({}, { onRejectPanel })
    fireEvent.click(screen.getByRole('button', { name: '거절' }))
    expect(confirmSpy).toHaveBeenCalledWith('거절 사유 없이 진행하시겠습니까?')
  })

  it('노트 없고 confirm 취소 시 onRejectPanel 미호출', () => {
    const onRejectPanel = vi.fn()
    renderExpansion({}, { onRejectPanel })
    fireEvent.click(screen.getByRole('button', { name: '거절' }))
    expect(onRejectPanel).not.toHaveBeenCalled()
  })

  it('노트 없고 confirm 확인 시 onRejectPanel(undefined) 호출', () => {
    confirmSpy.mockReturnValue(true)
    const onRejectPanel = vi.fn()
    renderExpansion({}, { onRejectPanel })
    fireEvent.click(screen.getByRole('button', { name: '거절' }))
    expect(onRejectPanel).toHaveBeenCalledWith(undefined)
  })

  it('노트 입력 후 거절 클릭 시 confirm 없이 onRejectPanel에 노트 전달', async () => {
    const user = userEvent.setup()
    const onRejectPanel = vi.fn()
    renderExpansion({}, { onRejectPanel })
    const textarea = screen.getByPlaceholderText(/검수 노트/)
    await user.type(textarea, '거절 사유 작성')
    fireEvent.click(screen.getByRole('button', { name: '거절' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onRejectPanel).toHaveBeenCalledWith('거절 사유 작성')
  })

  it('검수 중 아닌 상태(pending)에서는 거절 버튼이 렌더링되지 않음', () => {
    renderExpansion({ review_status: 'pending' })
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument()
  })
})
