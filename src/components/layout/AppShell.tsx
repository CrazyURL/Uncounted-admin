import { useRef, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import { useAuth } from '../../lib/AuthContext'

const ROUTE_TITLES: Record<string, string> = {
  '/home': '내 자산 현황',
  '/assets': '자산 목록',
  '/value': '가치 대시보드',
  '/refinery': '품질 정제소',
  '/campaigns': '데이터 캠페인',
  '/missions': '미션 & 티어',
  '/profile': '내 정보',
  '/profile/setup': '프로필 설정',
  '/motion-playground': '모션 플레이그라운드',
  '/privacy-control': '개인정보 제어 센터',
  '/pii-review': '민감정보 보호 현황',
  '/review-queue': '자동 라벨 검토',
  '/voice-enrollment': '목소리 등록',
}

function getTitle(pathname: string): string {
  if (pathname.startsWith('/assets/contact/')) {
    const name = decodeURIComponent(pathname.replace('/assets/contact/', ''))
    return name.length > 12 ? name.slice(0, 12) + '…' : name
  }
  if (pathname.startsWith('/assets/')) return '세션 상세'
  if (pathname.startsWith('/value/label/')) return '라벨링'
  return ROUTE_TITLES[pathname] ?? 'Uncounted'
}

function hasBack(pathname: string): boolean {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/value/label/') ||
    pathname === '/profile/setup' ||
    pathname === '/refinery' ||
    pathname === '/campaigns' ||
    pathname === '/missions' ||
    pathname === '/privacy-control' ||
    pathname === '/pii-review' ||
    pathname === '/review-queue' ||
    pathname === '/voice-enrollment'
  )
}

export default function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const { userId, isReady } = useAuth()

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  // 인증 가드: 세션 확인 완료 후 미로그인이면 /auth로 이동
  useEffect(() => {
    if (isReady && !userId) {
      navigate('/auth', { replace: true })
    }
  }, [isReady, userId, navigate])

  const title = getTitle(location.pathname)
  const showBack = hasBack(location.pathname)

  // 세션 확인 중이거나 리다이렉트 대기 중
  if (!isReady || !userId) {
    return (
      <div
        className="flex h-screen items-center justify-center"
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
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <TopBar
        title={title}
        onBack={showBack ? () => navigate(-1) : undefined}
      />
      <main ref={mainRef} className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
