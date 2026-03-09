// ── Auth 모듈 — Google OAuth 기반 인증 ───────────────────────────────────
// 인증은 API 서버를 통해서만 처리 (Supabase SDK 미사용)
// 세션: httpOnly 쿠키 (uncounted_session, uncounted_refresh) + 인메모리 access_token

import * as authApi from './api/auth'
import { generateUUID } from './uuid'

// ── pid 관리 ──────────────────────────────────────────────────────────────

const PID_KEY = 'uncounted_pseudo_id'

function getOrCreatePid(): string {
  let pid = localStorage.getItem(PID_KEY)
  if (!pid) {
    pid = generateUUID()
    localStorage.setItem(PID_KEY, pid)
  }
  return pid
}

export function getPid(): string {
  return getOrCreatePid()
}

// ── Auth 상태 ─────────────────────────────────────────────────────────────

let cachedUserId: string | null = null

let _authInitResolve: ((userId: string | null) => void) | null = null
export const authInitPromise: Promise<string | null> = new Promise(r => { _authInitResolve = r })

export function getAuthUserId(): string | null {
  return cachedUserId
}

/** auth.uid() — DB insert 시 user_id로 사용 */
export function getEffectiveUserId(): string | null {
  return cachedUserId
}

/** pid 반환 (항상 존재) */
export function getEffectivePid(): string {
  return getOrCreatePid()
}

export function isAuthenticated(): boolean {
  return cachedUserId !== null
}

// ── Auth 리스너 (AuthProvider에서 호출) ────────────────────────────────────

export function initAuthListener(
  onAuthChange: (userId: string | null) => void,
): { unsubscribe: () => void } {
  // 초기 세션 확인 (쿠키 기반)
  authApi.getSession().then(async ({ data }) => {
    cachedUserId = data.session?.user?.id ?? null

    if (cachedUserId) {
      // 쿠키 세션 유효 → access_token 갱신 (Bearer 누락 방지)
      await authApi.refreshSession()
    }

    _authInitResolve?.(cachedUserId)
    _authInitResolve = null
    onAuthChange(cachedUserId)
  })

  const { data: { subscription } } = authApi.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      // 로그아웃 — AppShell 가드가 /auth로 리다이렉트
      cachedUserId = null
    } else if (session?.user?.id) {
      cachedUserId = session.user.id
    } else {
      // SIGNED_IN with null session: handleOAuthCallback은 session=null로 이벤트를 발행함
      // 쿠키가 이미 세팅되었으므로 /api/auth/me로 실제 userId를 재조회
      const { data } = await authApi.getSession()
      cachedUserId = data.session?.user?.id ?? null
    }
    onAuthChange(cachedUserId)
  })

  return {
    unsubscribe: () => subscription.unsubscribe(),
  }
}

// ── 로그아웃 ──────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await authApi.signOut()
  cachedUserId = null
}

// ── Google OAuth 로그인 ──────────────────────────────────────────────────

export async function signInWithGoogle(redirectTo?: string): Promise<{ error: string | null }> {
  const redirect = redirectTo ?? `${window.location.origin}/auth`

  const { error } = await authApi.signInWithOAuth('google', {
    redirectTo: redirect,
    skipBrowserRedirect: false,
  })

  if (error) return { error: error.message }

  return { error: null }
}

/** 네이티브 OAuth 콜백 URL에서 토큰 추출 → API 서버에 세션 설정 */
export async function handleOAuthCallback(url: string): Promise<boolean> {
  const hashParams = new URLSearchParams(url.split('#')[1] ?? '')
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')

  if (!accessToken || !refreshToken) return false

  await authApi.setSession(accessToken, refreshToken)

  const { data } = await authApi.getSession()
  const userId = data.session?.user?.id ?? null
  if (userId) {
    cachedUserId = userId
    const pid = getPid()
    await linkPidToUser(pid, userId)
  }

  return true
}

// ── pid → user_id 연결 ────────────────────────────────────────────────────

export async function linkPidToUser(pid: string, userId: string): Promise<boolean> {
  const { error } = await authApi.linkPidToUser(pid, userId)

  if (error) {
    console.error('[auth] linkPidToUser failed:', error.message)
    return false
  }

  return true
}

// ── 액세스 토큰 (Storage 업로드용) ──────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return await authApi.getAccessToken()
}
