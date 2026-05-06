import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'flat'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantClass: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-surface border border-border rounded-xl shadow-sm',
  glass: 'glass-card',
  flat: 'bg-surface-alt rounded-xl',
}

const paddingClass: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', padding = 'md', className = '', children, ...rest },
  ref,
) {
  const cls = `${variantClass[variant]} ${paddingClass[padding]} ${className}`
  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  )
})

interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function CardHeader({ title, description, action, className = '', ...rest }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`} {...rest}>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold text-txt">{title}</h3>
        {description && <p className="mt-1 text-sm text-txt-sub">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mt-4 ${className}`} {...rest} />
}

export function CardFooter({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mt-4 pt-4 border-t border-border-light flex items-center justify-end gap-2 ${className}`}
      {...rest}
    />
  )
}
