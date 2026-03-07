// ── Auth API Client ────────────────────────────────────────────────────
// httpOnly Cookie 기반 인증 클라이언트 (Supabase SDK 미사용)

import { apiFetch, setAuthToken, getAuthToken } from './client'

// ── 타입 정의 ────────────────────────────────────────────────────────────

export type Session = {
  access_token: string
  refresh_token?: string
  user: {
    id: string
    email?: string
    [key: string]: any
  }
}

type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED'

// ── 커스텀 이벤트 헬퍼 ───────────────────────────────────────────────────

function dispatchAuthEvent(event: AuthChangeEvent, session: Session | null) {
  window.dispatchEvent(new CustomEvent('uncounted:auth', { detail: { event, session } }))
}

// ── API 함수들 ──────────────────────────────────────────────────────────

/**
 * Get current session
 * 쿠키를 검증하여 현재 user 정보 반환
 */
export async function getSession(): Promise<{ data: { session: Session | null }, error: Error | null }> {
  const result = await apiFetch<{ user: Session['user'] }>('/api/auth/me')

  if (result.error || !result.data?.user) {
    return { data: { session: null }, error: null }
  }

  const session: Session = {
    access_token: '',
    user: { ...result.data.user },
  }
  return { data: { session }, error: null }
}

/**
 * Sign in with email and password
 */
export async function signInWithPassword(email: string, password: string) {
  const result = await apiFetch<{ session: Session; user: any }>('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (result.error) {
    return { data: { session: null, user: null }, error: { message: result.error } }
  }

  const session = result.data?.session ?? null
  if (session?.access_token) {
    setAuthToken(session.access_token)
  }

  dispatchAuthEvent('SIGNED_IN', session)

  return {
    data: {
      session,
      user: result.data?.user ?? null,
    },
    error: null,
  }
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string) {
  const result = await apiFetch<{ user: any }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (result.error) {
    return { data: { user: null }, error: { message: result.error } }
  }

  return {
    data: {
      user: result.data?.user ?? null,
    },
    error: null,
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<{ error: Error | null }> {
  await apiFetch('/api/auth/signout', { method: 'POST' })
  setAuthToken(null)
  dispatchAuthEvent('SIGNED_OUT', null)
  return { error: null }
}

/**
 * Refresh session
 */
export async function refreshSession(): Promise<{ data: { session: Session | null }, error: Error | null }> {
  const result = await apiFetch<{ session: Session }>('/api/auth/refresh', {
    method: 'POST',
  })

  if (result.error) {
    return { data: { session: null }, error: { message: result.error } as Error }
  }

  if (result.data?.session) {
    if (result.data.session.access_token) {
      setAuthToken(result.data.session.access_token)
    }
    dispatchAuthEvent('TOKEN_REFRESHED', result.data.session)
  }

  return {
    data: { session: result.data?.session ?? null },
    error: null,
  }
}

/**
 * Link pseudo ID to user ID
 */
export async function linkPidToUser(pid: string, _userId: string): Promise<{ error: Error | null }> {
  const result = await apiFetch('/api/auth/link-pid', {
    method: 'POST',
    body: JSON.stringify({ pid }),
  })

  if (result.error) {
    return { error: { message: result.error } as Error }
  }

  return { error: null }
}

/**
 * Get access token
 * 인메모리 토큰 반환 (로그인 시 setAuthToken으로 저장됨)
 */
export async function getAccessToken(): Promise<string | null> {
  return getAuthToken()
}

// ── 클라이언트 측 기능 ────────────────────────────────────────────────────

/**
 * Subscribe to auth state changes
 * 커스텀 DOM 이벤트 기반 구독
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): { data: { subscription: { unsubscribe: () => void } } } {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<{ event: AuthChangeEvent; session: Session | null }>
    callback(customEvent.detail.event, customEvent.detail.session)
  }
  window.addEventListener('uncounted:auth', handler)
  return {
    data: {
      subscription: {
        unsubscribe: () => window.removeEventListener('uncounted:auth', handler),
      },
    },
  }
}

/**
 * Sign in with OAuth provider
 * 백엔드 OAuth 엔드포인트로 리다이렉트
 */
export async function signInWithOAuth(
  provider: 'google',
  options: {
    redirectTo: string
    skipBrowserRedirect?: boolean
  }
) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  const oauthUrl = `${apiUrl}/api/auth/oauth/${provider}?redirect=${encodeURIComponent(options.redirectTo)}`

  if (options.skipBrowserRedirect) {
    // 네이티브: URL만 반환 (Browser.open()에서 사용)
    return { data: { provider, url: oauthUrl }, error: null as Error | null }
  }

  // 웹: 직접 리다이렉트
  window.location.href = oauthUrl
  return { data: { provider, url: oauthUrl }, error: null as Error | null }
}

/**
 * 프론트엔드에 도착한 ?code 파라미터를 백엔드 콜백 API로 전달
 * flow ID는 백엔드가 pkce_flow_id 쿠키에서 직접 읽음
 * 백엔드가 PKCE 코드 교환 후 httpOnly 쿠키를 설정하고 { success: true } 반환
 */
export async function handleOAuthCallback(
  code: string,
): Promise<{ error: string | null }> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  try {
    const res = await fetch(
      `${apiUrl}/api/auth/oauth/callback?code=${encodeURIComponent(code)}`,
      { credentials: 'include' },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as any).error ?? 'callback_failed' }
    }
    dispatchAuthEvent('SIGNED_IN', null)
    return { error: null }
  } catch {
    return { error: 'network_error' }
  }
}

/**
 * Set session from OAuth tokens
 * OAuth 콜백 후 백엔드에서 쿠키 설정
 */
export async function setSession(accessToken: string, refreshToken: string) {
  const result = await apiFetch<{ session: Session }>('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  })

  if (result.error) {
    return { data: { session: null }, error: result.error }
  }

  if (result.data?.session) {
    if (result.data.session.access_token) {
      setAuthToken(result.data.session.access_token)
    }
    dispatchAuthEvent('SIGNED_IN', result.data.session)
    return { data: { session: result.data.session }, error: null }
  }

  return { data: { session: null }, error: null }
}
