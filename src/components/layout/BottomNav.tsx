import { useLocation, useNavigate } from 'react-router-dom'

type NavItem = {
  label: string
  icon: string
  iconFilled: string
  path: string
  match: string[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: '홈',
    icon: 'home',
    iconFilled: 'home',
    path: '/home',
    match: ['/home'],
  },
  {
    label: '자산',
    icon: 'folder_open',
    iconFilled: 'folder',
    path: '/assets',
    match: ['/assets'],
  },
  {
    label: '가치',
    icon: 'trending_up',
    iconFilled: 'trending_up',
    path: '/value',
    match: ['/value'],
  },
  {
    label: '내정보',
    icon: 'person',
    iconFilled: 'person',
    path: '/profile',
    match: ['/profile'],
  },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  function isActive(item: NavItem): boolean {
    return item.match.some((m) => location.pathname.startsWith(m))
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 glass-nav"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: '4rem',
      }}
    >
      <div className="flex items-center h-full">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item)
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full relative py-2"
            >
              {/* 활성 인디케이터 */}
              {active && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                />
              )}
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all"
                style={active ? {
                  backgroundColor: 'var(--color-accent-dim)',
                  boxShadow: '0 2px 8px rgba(107, 78, 232, 0.12)',
                } : undefined}
              >
                <span
                  className="material-symbols-outlined text-2xl transition-colors"
                  style={{
                    color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  }}
                >
                  {active ? item.iconFilled : item.icon}
                </span>
              </div>
              <span
                className="text-[10px] font-semibold transition-colors"
                style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
