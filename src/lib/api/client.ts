// ── API Client Base ────────────────────────────────────────────────────
// 백엔드 API 호출을 위한 기본 fetch 래퍼

import { decryptResponse, encryptData } from '../crypto'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ── 인메모리 토큰 스토어 ─────────────────────────────────────────────────
// 크로스 오리진(localhost vs IP) 환경에서 SameSite=Lax 쿠키가 차단되는 문제 우회
// 로그인 후 access_token을 메모리에 저장 → Authorization: Bearer 헤더로 전송

const STORED_TOKEN_KEY = 'uncounted_access_token'

let _authToken: string | null = localStorage.getItem(STORED_TOKEN_KEY)

export function setAuthToken(token: string | null) {
  _authToken = token
  if (token) {
    localStorage.setItem(STORED_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(STORED_TOKEN_KEY)
  }
}

export function getAuthToken(): string | null {
  return _authToken
}

let _refreshPromise: Promise<boolean> | null = null

async function refreshTokenOnce(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })

      if (refreshRes.ok) {
        const refreshJson = await refreshRes.json()
        const newToken = (decryptResponse(refreshJson) as any)?.data?.session?.access_token
        if (newToken) {
          setAuthToken(newToken)
          return true
        }
      }
      return false
    } catch {
      return false
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

/**
 * 쿠키 기반 인증 fetch 래퍼 (내부 구현)
 * isRetry=true 이면 401 시 재시도하지 않음 (무한 루프 방지)
 */
async function _apiFetch<T = any>(
  endpoint: string,
  options: RequestInit,
  isRetry: boolean,
): Promise<{ data?: T; error?: string; count?: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (_authToken) {
    headers['Authorization'] = `Bearer ${_authToken}`
  }

  try {
    // body가 JSON 문자열이면 AES-256-GCM으로 암호화 후 { enc_data: ... } 래핑
    let body = options.body
    if (body && typeof body === 'string') {
      const parsed = JSON.parse(body)
      body = JSON.stringify({ enc_data: encryptData(parsed) })
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      body,
      headers,
      credentials: 'include',
    })

    // 401: Access token 만료 → refresh mutex로 직렬화 후 1회 재시도
    if (response.status === 401 && !isRetry) {
      const refreshed = await refreshTokenOnce()
      if (refreshed) {
        return _apiFetch<T>(endpoint, options, true)
      }
      setAuthToken(null)
      window.dispatchEvent(new CustomEvent('uncounted:auth', {
        detail: { event: 'SIGNED_OUT', session: null },
      }))
      return { error: 'Session expired. Please sign in again.' }
    }

    const json = await response.json()

    if (!response.ok) {
      return { error: json.error || 'API request failed' }
    }

    return decryptResponse(json)
  } catch (err: any) {
    return { error: err.message || 'Network error' }
  }
}

/**
 * 쿠키 기반 인증 fetch 래퍼
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; count?: number }> {
  return _apiFetch<T>(endpoint, options, false)
}
