import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
type Size = 'sm' | 'md'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  size?: Size
  leftIcon?: ReactNode
}

const toneClass: Record<Tone, string> = {
  neutral: 'bg-muted text-txt-sub',
  accent: 'bg-accent-dim text-accent',
  success: 'bg-success-dim text-success',
  warning: 'bg-warning-dim text-warning',
  danger: 'bg-danger-dim text-danger',
}

const sizeClass: Record<Size, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', size = 'sm', leftIcon, className = '', children, ...rest },
  ref,
) {
  const cls = `inline-flex items-center gap-1 rounded-full font-medium ${toneClass[tone]} ${sizeClass[size]} ${className}`
  return (
    <span ref={ref} className={cls} {...rest}>
      {leftIcon && <span aria-hidden="true">{leftIcon}</span>}
      {children}
    </span>
  )
})
