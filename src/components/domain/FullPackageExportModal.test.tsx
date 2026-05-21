import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FullPackageExportModal, MAX_POLL_ATTEMPTS, POLL_INTERVAL_MS } from './FullPackageExportModal'

const exportSessionV2 = vi.fn()
const pollExportV2Job = vi.fn()
vi.mock('../../lib/api/export', () => ({
  exportSessionV2: (...a: unknown[]) => exportSessionV2(...a),
  pollExportV2Job: (...a: unknown[]) => pollExportV2Job(...a),
  isExportV2JobCreated: (d: unknown) => !!d && typeof d === 'object' && 'job_id' in (d as object),
}))

async function selectEmbeddedAndStart() {
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[1]) // embedded WAV
  fireEvent.click(screen.getByRole('button', { name: '생성' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) }) // flush exportSessionV2 + first poll
}

describe('FullPackageExportModal embedded polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    exportSessionV2.mockReset().mockResolvedValue({ data: { job_id: 'j1', status: 'queued' } })
    pollExportV2Job.mockReset()
    vi.spyOn(window, 'open').mockReturnValue(null)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stops polling and shows timeout after MAX_POLL_ATTEMPTS non-terminal polls', async () => {
    pollExportV2Job.mockResolvedValue({ data: { id: 'j1', status: 'packaging' } })

    render(<FullPackageExportModal open sessionId="s1" onClose={() => {}} />)
    await selectEmbeddedAndStart()

    for (let i = 0; i < MAX_POLL_ATTEMPTS + 10; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    }

    // guard caps the polls — never infinite
    expect(pollExportV2Job).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS)
    expect(screen.getByText(/시간이 초과/)).toBeInTheDocument()
  })

  it('completes normally when job becomes ready before the cap', async () => {
    pollExportV2Job
      .mockResolvedValueOnce({ data: { id: 'j1', status: 'packaging' } })
      .mockResolvedValue({ data: { id: 'j1', status: 'ready', download_url: 'https://x/y.zip' } })

    render(<FullPackageExportModal open sessionId="s1" onClose={() => {}} />)
    await selectEmbeddedAndStart()

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) }) // packaging -> ready
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })

    expect(screen.getByText(/다운로드가 시작/)).toBeInTheDocument()
    expect(pollExportV2Job.mock.calls.length).toBeLessThan(MAX_POLL_ATTEMPTS)
  })
})
