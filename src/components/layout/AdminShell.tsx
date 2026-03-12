import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import AdminNav from './AdminNav'
import { useAuth } from '../../lib/AuthContext'
import { signInWithGoogle, signOut } from '../../lib/auth'
import { checkAdminMe } from '../../lib/api/admin'

type AdminState = 'loading' | 'unauthenticated' | 'checking' | 'unauthorized' | 'authorized'

function getTitle(pathname: string): string {
  // dashboard
  if (pathname === '/admin') return '대시보드'
  // detail pages
  if (pathname.match(/^\/admin\/datasets\/.+/)) return '데이터셋 상세'
  if (pathname.match(/^\/admin\/users\/.+/)) return '사용자 상세'
  if (pathname.match(/^\/admin\/jobs\/.+/)) return '작업 상세'
  // inventory
  if (pathname.startsWith('/admin/calls') || pathname.startsWith('/admin/sessions')) return '통화 목록'
  if (pathname.startsWith('/admin/units')) return '빌링 유닛'
  if (pathname.startsWith('/admin/labels')) return '라벨 카탈로그'
  if (pathname.startsWith('/admin/consents')) return '동의 관리'
  // catalog
  if (pathname.startsWith('/admin/sku-catalog') || pathname.startsWith('/admin/studio')) return 'SKU 카탈로그'
  if (pathname.startsWith('/admin/sku-components')) return 'SKU 컴포넌트'
  if (pathname.startsWith('/admin/quality-tiers')) return '품질 등급'
  // clients
  if (pathname.startsWith('/admin/clients')) return '납품처 관리'
  if (pathname.startsWith('/admin/delivery-profiles')) return '납품 프로필'
  if (pathname.startsWith('/admin/sku-rules')) return '고객-SKU 매핑'
  // build
  if (pathname.startsWith('/admin/build')) return '빌드 위자드'
  if (pathname.startsWith('/admin/jobs')) return '작업 관리'
  if (pathname.startsWith('/admin/datasets')) return '데이터셋 관리'
  return '관리자'
}

export default function AdminShell() {
  const { userId, isReady } = useAuth()
  const [adminState, setAdminState] = useState<AdminState>('loading')
  const location = useLocation()
  const navigate = useNavigate()
  const adminMainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    adminMainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  // auth 초기화 전
  useEffect(() => {
    if (!isReady) {
      setAdminState('loading')
      return
    }
    if (!userId) {
      setAdminState('unauthenticated')
      return
    }
    // 로그인 됨 → 서버에서 admin 권한 확인
    setAdminState('checking')
    checkAdminMe()
      .then(({ error }) => {
        setAdminState(error ? 'unauthorized' : 'authorized')
      })
      .catch(() => {
        setAdminState('unauthorized')
      })
  }, [isReady, userId])

  const title = getTitle(location.pathname)
  const showBack = location.pathname.match(/^\/admin\/(datasets|users|jobs)\/.+/) !== null

  function handleGoogleLogin() {
    sessionStorage.setItem('auth_next', location.pathname)
    signInWithGoogle(`${window.location.origin}/auth`)
  }

  async function handleSignOut() {
    await signOut()
    // AuthContext userId → null → unauthenticated로 자동 전환
  }

  // ── 로딩 / admin 확인 중 ────────────────────────────────────────────────
  if (adminState === 'loading' || adminState === 'checking') {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: '#101322' }}
      >
        <span
          className="material-symbols-outlined text-3xl animate-spin"
          style={{ color: '#1337ec' }}
        >
          autorenew
        </span>
      </div>
    )
  }

  // ── 미로그인 ────────────────────────────────────────────────────────────
  if (adminState === 'unauthenticated') {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen text-white px-6"
        style={{ backgroundColor: '#101322' }}
      >
        <span className="material-symbols-outlined text-5xl mb-4" style={{ color: '#1337ec' }}>
          admin_panel_settings
        </span>
        <h1 className="text-xl font-bold mb-1">관리자 로그인</h1>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          관리자 페이지에 접근하려면 로그인이 필요합니다
        </p>
        <button
          onClick={handleGoogleLogin}
          className="w-full max-w-xs py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"
          style={{ backgroundColor: '#1337ec' }}
        >
          <span className="material-symbols-outlined text-base">login</span>
          Google로 로그인
        </button>
      </div>
    )
  }

  // ── 권한 없음 ───────────────────────────────────────────────────────────
  if (adminState === 'unauthorized') {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen text-white px-6"
        style={{ backgroundColor: '#101322' }}
      >
        <span className="material-symbols-outlined text-5xl mb-4" style={{ color: '#ef4444' }}>
          block
        </span>
        <h1 className="text-xl font-bold mb-1">접근 권한 없음</h1>
        <p className="text-sm mb-8 text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
          현재 계정에 관리자 권한이 없습니다.<br />
          관리자 계정으로 다시 로그인해 주세요.
        </p>
        <button
          onClick={handleSignOut}
          className="w-full max-w-xs py-3 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
        >
          다른 계정으로 로그인
        </button>
      </div>
    )
  }

  // ── authorized: admin layout ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen text-white" style={{ backgroundColor: '#101322' }}>
      <header
        className="flex items-center px-4 border-b flex-shrink-0"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          paddingTop: 'env(safe-area-inset-top)',
          minHeight: 'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        {showBack ? (
          <button onClick={() => navigate(-1)} className="mr-3 text-gray-400 hover:text-white">
            <span className="material-symbols-outlined text-xl">arrow_back_ios</span>
          </button>
        ) : (
          <button onClick={() => navigate('/admin')} className="mr-3 text-gray-400 hover:text-white">
            <span className="material-symbols-outlined text-xl">home</span>
          </button>
        )}
        <h1 className="text-white font-semibold text-base flex-1">{title}</h1>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: 'rgba(19,55,236,0.2)', color: '#1337ec' }}
        >
          관리자
        </span>
      </header>

      <AdminNav />

      <main ref={adminMainRef} className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
