import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type SubItem = { path: string; labelKo: string; icon: string }
type MenuGroup = { id: string; labelKo: string; icon: string; items: SubItem[] }

const ADMIN_MENU: MenuGroup[] = [
  {
    id: 'inventory', labelKo: '재고', icon: 'warehouse', items: [
      { path: '/admin/calls', labelKo: '통화', icon: 'call' },
      { path: '/admin/units', labelKo: '유닛', icon: 'grid_view' },
      { path: '/admin/labels', labelKo: '라벨', icon: 'label' },
      { path: '/admin/consents', labelKo: '동의', icon: 'verified_user' },
      { path: '/admin/meta-storage', labelKo: '메타', icon: 'description' },
    ],
  },
  {
    id: 'catalog', labelKo: '카탈로그', icon: 'category', items: [
      { path: '/admin/sku-catalog', labelKo: 'SKU', icon: 'precision_manufacturing' },
      { path: '/admin/studio', labelKo: '스튜디오', icon: 'movie_edit' },
      { path: '/admin/sku-components', labelKo: '컴포넌트', icon: 'extension' },
      { path: '/admin/quality-tiers', labelKo: '등급', icon: 'grade' },
    ],
  },
  {
    id: 'clients', labelKo: '납품처', icon: 'business', items: [
      { path: '/admin/clients', labelKo: '관리', icon: 'business' },
      { path: '/admin/delivery-profiles', labelKo: '프로필', icon: 'local_shipping' },
      { path: '/admin/sku-rules', labelKo: 'SKU 규칙', icon: 'account_tree' },
    ],
  },
  {
    id: 'build', labelKo: '빌드', icon: 'build', items: [
      { path: '/admin/build', labelKo: '위자드', icon: 'play_circle' },
      { path: '/admin/jobs', labelKo: '작업', icon: 'work' },
      { path: '/admin/settlement', labelKo: '정산', icon: 'payments' },
      { path: '/admin/datasets', labelKo: '레거시', icon: 'inventory_2' },
    ],
  },
]

function findActiveGroup(pathname: string): string | null {
  // 대시보드
  if (pathname === '/admin') return null
  // legacy
  if (pathname.startsWith('/admin/sessions')) return 'inventory'

  for (const g of ADMIN_MENU) {
    for (const item of g.items) {
      if (pathname.startsWith(item.path)) return g.id
    }
  }
  // settlement → build group
  if (pathname.startsWith('/admin/settlement')) return 'build'
  // job detail → build group
  if (pathname.match(/^\/admin\/jobs\/.+/)) return 'build'
  // dataset detail → build group
  if (pathname.match(/^\/admin\/datasets\/.+/)) return 'build'
  // user detail → inventory group
  if (pathname.match(/^\/admin\/users\/.+/)) return 'inventory'
  return null
}

export default function AdminNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => findActiveGroup(location.pathname))

  // sync group when navigating externally
  useEffect(() => {
    setActiveGroupId(findActiveGroup(location.pathname))
  }, [location.pathname])

  const activeGroup = activeGroupId ? ADMIN_MENU.find(g => g.id === activeGroupId) ?? null : null

  function isSubActive(subPath: string) {
    // exact prefix match
    if (location.pathname.startsWith(subPath)) return true
    // legacy aliases
    if (subPath === '/admin/calls' && location.pathname.startsWith('/admin/sessions')) return true
    // /admin/studio는 이제 직접 메뉴 항목이 있으므로 별도 alias 불필요
    return false
  }

  return (
    <div className="flex-shrink-0" style={{ backgroundColor: '#101322' }}>
      {/* Group tabs */}
      <nav
        className="flex border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {ADMIN_MENU.map(g => {
          const active = g.id === activeGroupId
          return (
            <button
              key={g.id}
              onClick={() => {
                setActiveGroupId(g.id)
                navigate(g.items[0].path)
              }}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: active ? '#1337ec' : 'rgba(255,255,255,0.45)',
                borderBottom: active ? '2px solid #1337ec' : '2px solid transparent',
              }}
            >
              <span className="material-symbols-outlined text-base">{g.icon}</span>
              {g.labelKo}
            </button>
          )
        })}
      </nav>

      {/* Sub-item tabs */}
      {activeGroup && (
      <nav
        className="flex border-b overflow-x-auto"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {activeGroup.items.map(item => {
          const active = isSubActive(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-1 px-3 py-2 text-xs whitespace-nowrap transition-colors"
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                backgroundColor: active ? 'rgba(19,55,236,0.15)' : 'transparent',
                borderRadius: '6px',
                margin: '4px 2px',
              }}
            >
              <span className="material-symbols-outlined text-sm">{item.icon}</span>
              {item.labelKo}
            </button>
          )
        })}
      </nav>
      )}
    </div>
  )
}
