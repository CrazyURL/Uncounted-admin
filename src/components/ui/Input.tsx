import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightIcon, fullWidth = true, className = '', id, ...rest },
  ref,
) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const widthClass = fullWidth ? 'w-full' : ''
  const stateClass = error
    ? 'border-danger focus:border-danger focus:ring-danger'
    : 'border-border focus:border-accent focus:ring-accent'

  return (
    <div className={widthClass}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-txt mb-1.5">
          {label}
        </label>
      )}
      <div className={`relative ${widthClass}`}>
        {leftIcon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`bg-surface text-txt placeholder:text-txt-tertiary border rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-bg disabled:opacity-60 disabled:cursor-not-allowed ${stateClass} ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${widthClass} ${className}`}
          aria-invalid={!!error || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-tertiary" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-txt-sub">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
})
