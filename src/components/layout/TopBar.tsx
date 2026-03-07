import UncountedLogo from '../domain/UncountedLogo'

type TopBarProps = {
  title: string
  onBack?: () => void
}

export default function TopBar({ title, onBack }: TopBarProps) {
  return (
    <header
      className="flex items-center px-4 flex-shrink-0"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-top))',
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="mr-3 transition-colors"
          style={{ color: 'var(--color-text-sub)' }}
          aria-label="뒤로가기"
        >
          <span className="material-symbols-outlined text-xl">arrow_back_ios</span>
        </button>
      )}
      {title === 'Uncounted' ? (
        <UncountedLogo size={28} variant="mark" />
      ) : (
        <h1 className="font-semibold text-base tracking-tight" style={{ color: 'var(--color-text)' }}>{title}</h1>
      )}
    </header>
  )
}
