import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithGoogle, authInitPromise } from '../lib/auth'
import { onAuthStateChange, handleOAuthCallback } from '../lib/api/auth'
import { useAuth } from '../lib/AuthContext'
import { loadProfile, isProfileGateCompleted } from '../types/userProfile'
import { loadTutorial } from '../lib/tutorialStore'
import UncountedLogo from '../components/domain/UncountedLogo'

export default function AuthPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // OAuth 콜백 후 AuthContext userId 업데이트를 기다리는 플래그 (useState: 리렌더 트리거)
  const [oauthPending, setOauthPending] = useState(false)

  function navigateAfterAuth() {
    const profile = loadProfile()
    const tutorial = loadTutorial()

    if (!profile || !isProfileGateCompleted(profile)) {
      navigate('/profile/setup?mode=gate', { replace: true })
    } else if (tutorial.stage !== 'done') {
      navigate('/guided', { replace: true })
    } else {
      navigate('/home', { replace: true })
    }
  }

  // OAuth 콜백 완료 + AuthContext userId 업데이트 후 네비게이션 실행
  useEffect(() => {
    if (oauthPending && userId) {
      navigateAfterAuth()
    }
  }, [oauthPending, userId])

  // 세션 확인 + OAuth 콜백 완료 감지
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const oauthError = searchParams.get('error')
    const code = searchParams.get('code')

    // ① 에러 파라미터 처리
    if (oauthError) {
      history.replaceState(null, '', window.location.pathname)
      setError('로그인 처리 중 오류가 발생했습니다.')
      setChecking(false)
      return
    }

    // ② Supabase OAuth 콜백: ?code 파라미터가 있으면 백엔드 콜백 API 호출
    // flow ID는 백엔드가 pkce_flow_id 쿠키에서 직접 읽음
    if (code) {
      history.replaceState(null, '', window.location.pathname)
      handleOAuthCallback(code).then(({ error }) => {
        if (error) {
          setError('로그인 처리 중 오류가 발생했습니다.')
          setChecking(false)
        } else {
          // AuthContext userId 업데이트 대기 (useEffect([oauthPending, userId])에서 navigate)
          // setOauthPending → 리렌더 트리거 → userId도 반영된 시점에 navigate
          setOauthPending(true)
        }
      })
      return
    }

    // ③ 이미 로그인 상태면 바로 이동 (initAuthListener 결과 재활용 → API 중복 호출 방지)
    authInitPromise.then((userId) => {
      if (userId) {
        navigateAfterAuth()
      } else {
        setChecking(false)
      }
    })

    // OAuth 완료 후 auth 상태 변경 감지 → 자동 네비게이션
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        navigateAfterAuth()
      }
    })

    return () => { subscription.unsubscribe() }
  }, [])

  async function handleGoogleLogin() {
    setError(null)
    setLoading(true)
    try {
      const { error: oauthError } = await signInWithGoogle()
      setLoading(false)
      if (oauthError) {
        setError(oauthError)
      }
      // 네이티브: Browser가 열림 → appUrlOpen에서 처리 → AuthInitializer가 상태 변경 감지
      // 웹: 페이지 리다이렉트 → 돌아오면 위 useEffect에서 처리
    } catch (e) {
      setLoading(false)
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.')
    }
  }

  if (checking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <span
          className="material-symbols-outlined text-3xl animate-spin"
          style={{ color: 'var(--color-accent)' }}
        >
          autorenew
        </span>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* 로고 */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <UncountedLogo size={64} variant="mark" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            Uncounted
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
            내 데이터, 내 가치
          </p>
        </div>

        {/* 설명 카드 */}
        <div
          className="w-full rounded-2xl p-5 flex flex-col gap-3"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p
            className="text-sm font-bold text-center"
            style={{ color: 'var(--color-text)' }}
          >
            안전하게 시작하기
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <span
                className="material-symbols-outlined text-base mt-0.5"
                style={{ color: 'var(--color-accent)' }}
              >
                check_circle
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                Google 계정으로 안전하게 로그인합니다
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span
                className="material-symbols-outlined text-base mt-0.5"
                style={{ color: 'var(--color-accent)' }}
              >
                check_circle
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                데이터는 이 기기에 안전하게 보관됩니다
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span
                className="material-symbols-outlined text-base mt-0.5"
                style={{ color: 'var(--color-accent)' }}
              >
                check_circle
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                계정이 있어야 스캔 데이터를 안전하게 동기화할 수 있습니다
              </p>
            </div>
          </div>
        </div>

        {/* Google 로그인 버튼 (메인 CTA) */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={
            !loading
              ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
              : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
          }
        >
          {loading && (
            <span className="material-symbols-outlined text-lg animate-spin">autorenew</span>
          )}
          {loading ? '로그인 중...' : 'Google로 시작하기'}
        </button>

        {/* 에러 메시지 */}
        {error && (
          <div
            className="w-full rounded-xl px-4 py-3"
            style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              {error}
            </p>
          </div>
        )}

        <p
          className="text-[10px] text-center leading-relaxed px-2"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          시작하면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주합니다.
        </p>
      </div>
    </div>
  )
}
