import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-txt-on-accent hover:bg-accent-hover focus:ring-accent disabled:bg-accent-dim',
  secondary: 'bg-surface-alt text-txt hover:bg-surface-dim focus:ring-accent border border-border',
  danger: 'bg-danger text-white hover:opacity-90 focus:ring-danger disabled:bg-danger-dim',
  ghost: 'bg-transparent text-txt hover:bg-surface-alt focus:ring-accent',
}

const sizeClass: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-base rounded-lg',
  lg: 'px-6 py-3 text-lg rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading
  const base = 'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 ' +
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg ' +
    'disabled:cursor-not-allowed disabled:opacity-60'
  const widthClass = fullWidth ? 'w-full' : ''
  const cls = `${base} ${variantClass[variant]} ${sizeClass[size]} ${widthClass} ${className}`

  return (
    <button
      ref={ref}
      className={cls}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} />
      ) : (
        leftIcon && <span aria-hidden="true">{leftIcon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </button>
  )
})

function Spinner({ size }: { size: Size }) {
  const dim = size === 'sm' ? 14 : size === 'md' ? 16 : 20
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
