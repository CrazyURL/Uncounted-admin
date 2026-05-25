import { useLocation, useNavigate } from 'react-router-dom'

type NavItem = { path: string; labelKo: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { path: '/admin/calls', labelKo: '통화', icon: 'call' },
  { path: '/admin/delivery', labelKo: '납품 패키지', icon: 'inventory_2' },
  { path: '/admin/clients', labelKo: '납품처 관리', icon: 'business' },
  { path: '/admin/transactions', labelKo: '거래내역', icon: 'receipt_long' },
  { path: '/admin/balances', labelKo: '잔액관리', icon: 'account_balance_wallet' },
  { path: '/admin/training', labelKo: '모델 학습', icon: 'model_training' },
  { path: '/admin/emotion-labels', labelKo: '감정 라벨 검수', icon: 'sentiment_satisfied' },
]

export default function AdminNav() {
  const location = useLocation()
  const navigate = useNavigate()

  function isActive(path: string) {
    if (path === '/admin/calls') {
      return location.pathname.startsWith('/admin/calls') || location.pathname.startsWith('/admin/sessions')
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="flex-shrink-0" style={{ backgroundColor: 'var(--color-bg)' }}>
      <nav
        className="flex border-b overflow-x-auto"
        style={{ borderColor: 'var(--color-border-light)' }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                color: active ? 'var(--color-accent)' : 'var(--color-text-sub)',
                borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              {item.labelKo}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
