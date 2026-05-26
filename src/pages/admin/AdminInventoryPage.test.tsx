import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AdminInventoryPage from './AdminInventoryPage'
import type { AdminSession } from '../../types/adminSession'

// ── API mocks ────────────────────────────────────────────────────────────────

vi.mock('../../lib/api/reviews', () => ({
  fetchReviewQueue: vi.fn(),
  updateReviewStatus: vi.fn(),
}))

vi.mock('../../lib/api/dashboard', () => ({
  fetchDashboardStats: vi.fn(),
}))

vi.mock('../../lib/api/utterances', () => ({
  fetchUtterances: vi.fn(),
  fetchUtteranceStats: vi.fn(),
  updateUtteranceReviewStatus: vi.fn(),
}))

// ── UI component mocks ───────────────────────────────────────────────────────

vi.mock('../../components/ui', () => ({
  BigStat: () => null,
  Button: ({ children, onClick, disabled, loading }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  ConfirmDialog: () => null,
  EmptyState: () => null,
  ErrorBanner: () => null,
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

// ── Domain component mocks ───────────────────────────────────────────────────

vi.mock('../../components/domain/ReviewQueueFilterBar', () => ({
  ReviewQueueFilterBar: () => null,
}))

vi.mock('../../components/domain/SessionPipelineCells', () => ({
  SessionPipelineCells: () => null,
}))

vi.mock('../../components/domain/SessionDeliveryModal', () => ({
  SessionDeliveryModal: () => null,
}))

vi.mock('../../components/domain/UtteranceExpansion', () => ({
  UtteranceExpansion: () => <div data-testid="utterance-expansion" />,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

import { fetchReviewQueue, updateReviewStatus } from '../../lib/api/reviews'
import { fetchDashboardStats } from '../../lib/api/dashboard'
import { fetchUtterances, fetchUtteranceStats } from '../../lib/api/utterances'

const mockFetchReviewQueue = vi.mocked(fetchReviewQueue)
const mockUpdateReviewStatus = vi.mocked(updateReviewStatus)
const mockFetchDashboardStats = vi.mocked(fetchDashboardStats)
const mockFetchUtterances = vi.mocked(fetchUtterances)
const mockFetchUtteranceStats = vi.mocked(fetchUtteranceStats)

const pendingSession: AdminSession = {
  id: 'sess-001',
  user_id: 'user-001',
  date: '2026-01-01',
  duration_seconds: 120,
  consent_status: 'both_agreed',
  created_at: '2026-01-01T00:00:00Z',
  review_status: 'pending',
  upload_status: 'done',
  stt_status: 'done',
  diarize_status: 'done',
  pii_status: 'done',
  auto_label_status: 'done',
  quality_status: 'done',
}

const EMPTY_QUEUE = { data: { sessions: [], total: 0, filteredDurationSec: 0, pendingCount: 0, inReviewCount: 0, approvedCount: 0, rejectedCount: 0, needsRevisionCount: 0 }, error: null }
const NULL_STATS = { data: null, error: null }
const EMPTY_UTTERANCES = { data: { utterances: [], total: 0, page: 1, limit: 200, constants: { hourlyRateKrw: 30000 } }, error: null }

function makeQueue(sessions: AdminSession[]) {
  return {
    data: {
      sessions,
      total: sessions.length,
      filteredDurationSec: 0,
      pendingCount: 0,
      inReviewCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      needsRevisionCount: 0,
    },
    error: null,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminInventoryPage />
    </MemoryRouter>,
  )
}

// ── Fix #2: 검수 시작 후 자동 펼침 ──────────────────────────────────────────

describe('Fix #2: handleStartReview — 검수 시작 후 자동 펼침', () => {
  beforeEach(() => {
    mockFetchDashboardStats.mockResolvedValue(NULL_STATS as any)
    mockFetchUtteranceStats.mockResolvedValue(NULL_STATS as any)
    mockFetchUtterances.mockResolvedValue(EMPTY_UTTERANCES as any)
    mockUpdateReviewStatus.mockResolvedValue({
      data: { ...pendingSession, review_status: 'in_review' },
      error: null,
    } as any)
  })

  it('"검수 시작" 클릭 후 UtteranceExpansion이 렌더링된다', async () => {
    // initial load: pending session (pipeline ready → shows 검수 시작)
    // second load (after handleStartReview): same session now in_review
    mockFetchReviewQueue
      .mockResolvedValueOnce(makeQueue([pendingSession]) as any)
      .mockResolvedValueOnce(makeQueue([{ ...pendingSession, review_status: 'in_review' }]) as any)
      .mockResolvedValue(EMPTY_QUEUE as any)

    renderPage()

    // wait for initial session to appear
    const startBtn = await screen.findByRole('button', { name: '검수 시작' })
    fireEvent.click(startBtn)

    await waitFor(() => {
      expect(screen.getByTestId('utterance-expansion')).toBeInTheDocument()
    })
  })

  it('"검수 시작" 클릭 시 updateReviewStatus가 올바른 인수로 호출된다', async () => {
    mockFetchReviewQueue
      .mockResolvedValueOnce(makeQueue([pendingSession]) as any)
      .mockResolvedValue(EMPTY_QUEUE as any)

    renderPage()

    const startBtn = await screen.findByRole('button', { name: '검수 시작' })
    fireEvent.click(startBtn)

    await waitFor(() => {
      expect(mockUpdateReviewStatus).toHaveBeenCalledWith('sess-001', 'in_review')
    })
  })
})
