// 디자인 토큰 — admin UI 단일 출처 (Single Source of Truth)
//
// 색상은 CSS 커스텀 프로퍼티 (`var(--color-*)`) 를 참조하여 light/dark 자동 전환.
// 정의 위치: `src/index.css` :root / [data-theme="dark"]
// Tailwind 매핑: `tailwind.config.js` theme.extend.colors
//
// 사용 원칙:
//   - 컴포넌트 스타일은 Tailwind 유틸리티 (`bg-surface`, `text-txt`, ...) 우선
//   - JS 동적 스타일은 본 객체 참조
//   - 직접 hex / rgba 하드코딩 금지

export const tokens = {
  // ── Color ──────────────────────────────────────────────────────────────
  // CSS var 참조 — light/dark 자동
  color: {
    bg: 'var(--color-bg)',
    surface: {
      DEFAULT: 'var(--color-surface)',
      alt: 'var(--color-surface-alt)',
      dim: 'var(--color-surface-dim)',
    },
    text: {
      DEFAULT: 'var(--color-text)',
      sub: 'var(--color-text-sub)',
      tertiary: 'var(--color-text-tertiary)',
      onAccent: 'var(--color-text-on-accent)',
    },
    border: {
      DEFAULT: 'var(--color-border)',
      light: 'var(--color-border-light)',
    },
    muted: 'var(--color-muted)',
    accent: {
      DEFAULT: 'var(--color-accent)',
      dim: 'var(--color-accent-dim)',
      hover: 'var(--color-accent-hover)',
    },
    semantic: {
      success: 'var(--color-success)',
      successDim: 'var(--color-success-dim)',
      warning: 'var(--color-warning)',
      warningDim: 'var(--color-warning-dim)',
      danger: 'var(--color-danger)',
      dangerDim: 'var(--color-danger-dim)',
    },
  },

  // ── Spacing (rem 단위) ─────────────────────────────────────────────────
  // Tailwind 기본 스케일과 정합 (4px = 0.25rem 베이스)
  spacing: {
    xs: '0.25rem', // 4px
    sm: '0.5rem',  // 8px
    md: '1rem',    // 16px
    lg: '1.5rem',  // 24px
    xl: '2rem',    // 32px
    xxl: '3rem',   // 48px
  },

  // ── Border Radius ──────────────────────────────────────────────────────
  radius: {
    sm: '0.25rem', // 4px
    md: '0.5rem',  // 8px
    lg: '0.75rem', // 12px
    xl: '1rem',    // 16px
    card: 'var(--radius-card)',  // 24px (Glassmorphism)
    pill: 'var(--radius-pill)',  // 100px
    full: '9999px',
  },

  // ── Shadow ─────────────────────────────────────────────────────────────
  shadow: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    glass: 'var(--glass-shadow)',
    glassLg: 'var(--glass-shadow-lg)',
  },

  // ── Font ───────────────────────────────────────────────────────────────
  font: {
    family: {
      sans: 'Inter, sans-serif',
      display: 'Manrope, "Noto Sans KR", sans-serif',
      mono: '"JetBrains Mono", "SF Mono", Consolas, monospace',
    },
    size: {
      xs: '0.75rem',   // 12px
      sm: '0.875rem',  // 14px
      md: '1rem',      // 16px
      lg: '1.125rem',  // 18px
      xl: '1.5rem',    // 24px
      xxl: '2rem',     // 32px
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // ── Motion (Framer Motion / CSS) ────────────────────────────────────────
  motion: {
    duration: {
      fast: 0.15,    // 150ms — micro interactions
      normal: 0.25,  // 250ms — UI transitions
      slow: 0.4,     // 400ms — modal entrance, page transition
    },
    easing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',         // ease-out (Material default)
      out: 'cubic-bezier(0.0, 0, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // ── Z-Index ────────────────────────────────────────────────────────────
  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    drawer: 30,
    modal: 40,
    popover: 50,
    tooltip: 60,
    toast: 70,
  },

  // ── Breakpoints (Tailwind 기본과 정합) ─────────────────────────────────
  breakpoint: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    xxl: '1536px',
  },
} as const

// 타입 추출 — autocomplete 지원
export type Tokens = typeof tokens
export type ColorToken = keyof typeof tokens.color
export type SpacingToken = keyof typeof tokens.spacing
export type RadiusToken = keyof typeof tokens.radius

// ── Semantic 매핑 헬퍼 ───────────────────────────────────────────────────
// 상태 → 색상 매핑 (BM v10 정합)

export type StatusKind = 'pending' | 'running' | 'done' | 'failed'
export type ReviewKind = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_revision'

export function statusColor(status: StatusKind): string {
  switch (status) {
    case 'pending': return tokens.color.text.tertiary
    case 'running': return tokens.color.accent.DEFAULT
    case 'done':    return tokens.color.semantic.success
    case 'failed':  return tokens.color.semantic.danger
  }
}

export function reviewColor(status: ReviewKind): string {
  switch (status) {
    case 'pending':         return tokens.color.text.tertiary
    case 'in_review':       return tokens.color.accent.DEFAULT
    case 'approved':        return tokens.color.semantic.success
    case 'rejected':        return tokens.color.semantic.danger
    case 'needs_revision':  return tokens.color.semantic.warning
  }
}

// 한도 도달률 (0~1) → 색상
export function capacityColor(ratio: number): string {
  if (ratio >= 1.0) return tokens.color.semantic.danger
  if (ratio >= 0.8) return tokens.color.semantic.warning
  return tokens.color.semantic.success
}
