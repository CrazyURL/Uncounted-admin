// Admin Balances API 클라이언트

import { apiFetch } from './client'

export interface BalanceUser {
  userId: string
  email: string | null
  durationSec: number
  hours: number
  grossKrw: number
  userPayoutKrw: number
  capRatio: number
  capReached: boolean
  capApproaching: boolean
  durationSource: 'utterance' | 'session' | 'mixed'
}

export interface BalancesResponse {
  users: BalanceUser[]
  totalUsers: number
  constants: {
    hourlyRateKrw: number
    userShareRatio: number
    yearlyCapKrw: number
  }
  settlementStats?: {
    settledUtteranceCount: number
    unsettledUtteranceCount: number
    deliveredSessionCount: number
    undeliveredSessionCount: number
    deliveredUserCount: number
    undeliveredUserCount: number
  }
}

export async function fetchBalances(search?: string, limit?: number) {
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  if (limit) params.set('limit', String(limit))
  return apiFetch<BalancesResponse>(`/api/admin/balances?${params.toString()}`)
}
