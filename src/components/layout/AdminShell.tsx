import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import AdminNav from './AdminNav'

const AUTH_KEY = 'uncounted_admin_auth'
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string) || 'uncounted2026'

function isAuthed(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return false
    return (JSON.parse(raw) as { verified: boolean }).verified === true
  } catch {
    return false
  }
}

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
  const [authed, setAuthed] = useState(isAuthed)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const adminMainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    adminMainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  const title = getTitle(location.pathname)
  const showBack = location.pathname.match(/^\/admin\/(datasets|users|jobs)\/.+/) !== null

  function handleLogin() {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ verified: true }))
      setAuthed(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  if (!authed) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen text-white px-6"
        style={{ backgroundColor: '#101322' }}
      >
        <span className="material-symbols-outlined text-5xl mb-4" style={{ color: '#1337ec' }}>
          admin_panel_settings
        </span>
        <h1 className="text-xl font-bold mb-1">관리자 인증</h1>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          관리자 비밀번호를 입력하세요
        </p>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false) }}
          onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
          placeholder="비밀번호"
          className="w-full max-w-xs px-4 py-3 rounded-xl text-white text-sm border outline-none"
          style={{
            backgroundColor: '#1b1e2e',
            borderColor: error ? '#ef4444' : 'rgba(255,255,255,0.1)',
          }}
        />
        {error && (
          <p className="text-xs mt-2" style={{ color: '#ef4444' }}>
            비밀번호가 일치하지 않습니다
          </p>
        )}
        <button
          onClick={handleLogin}
          className="w-full max-w-xs mt-4 py-3 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: '#1337ec' }}
        >
          로그인
        </button>
        <button
          onClick={() => navigate('/home')}
          className="mt-4 text-xs"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          사용자 앱으로 돌아가기
        </button>
      </div>
    )
  }

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
