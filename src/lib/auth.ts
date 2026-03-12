// ── Auth 모듈 — Google OAuth 기반 인증 ───────────────────────────────────
// 인증은 API 서버를 통해서만 처리 (Supabase SDK 미사용)
// 세션: httpOnly 쿠키 (uncounted_session, uncounted_refresh) + 인메모리 access_token

import * as authApi from './api/auth'
import { checkAdminMe } from './api/admin'
import { getAuthToken } from './api/client'
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
  // 초기 세션 확인 — 저장된 토큰이 있을 때만 API 호출
  // 토큰 없이 checkAdminMe()를 호출하면 401 → auto-refresh 실패 → SIGNED_OUT 발행
  // → OAuth 콜백 흐름과 레이스 컨디션 발생 가능
  if (getAuthToken()) {
    checkAdminMe()
      .then(({ data }) => {
        cachedUserId = data?.user?.id ?? null
        _authInitResolve?.(cachedUserId)
        _authInitResolve = null
        onAuthChange(cachedUserId)
      })
      .catch(() => {
        _authInitResolve?.(null)
        _authInitResolve = null
        onAuthChange(null)
      })
  } else {
    // 토큰 없음 → 즉시 미인증 처리 (OAuth 진행 중이면 SIGNED_IN 이벤트가 상태 갱신)
    _authInitResolve?.(null)
    _authInitResolve = null
    onAuthChange(null)
  }

  const { data: { subscription } } = authApi.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      // 로그아웃 — AppShell 가드가 /auth로 리다이렉트
      cachedUserId = null
    } else if (session?.user?.id) {
      cachedUserId = session.user.id
    } else {
      // SIGNED_IN with null session: handleOAuthCallback은 session=null로 이벤트를 발행함
      // 쿠키가 세팅되었으므로 checkAdminMe로 admin 권한 포함 재조회 (401 시 auto-refresh)
      try {
        const { data } = await checkAdminMe()
        cachedUserId = data?.user?.id ?? null
      } catch {
        cachedUserId = null
      }
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
