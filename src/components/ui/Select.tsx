import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  hint?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
  fullWidth?: boolean
  leftIcon?: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, fullWidth = true, leftIcon, className = '', id, ...rest },
  ref,
) {
  const selectId = id ?? `select-${Math.random().toString(36).slice(2, 9)}`
  const hintId = hint ? `${selectId}-hint` : undefined
  const errorId = error ? `${selectId}-error` : undefined
  const widthClass = fullWidth ? 'w-full' : ''
  const stateClass = error
    ? 'border-danger focus:border-danger focus:ring-danger'
    : 'border-border focus:border-accent focus:ring-accent'

  return (
    <div className={widthClass}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-txt mb-1.5">
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
        <select
          ref={ref}
          id={selectId}
          className={`appearance-none bg-surface text-txt border rounded-lg pr-10 py-2 text-base focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-bg disabled:opacity-60 ${stateClass} ${leftIcon ? 'pl-10' : 'pl-3'} ${widthClass} ${className}`}
          aria-invalid={!!error || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
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
