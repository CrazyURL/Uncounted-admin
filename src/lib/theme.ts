// ── 테마 토큰 — 라이트(연보라) + 다크 ────────────────────────────────────────
// 원칙: Single accent = Lavender 1개 + 그레이스케일
// Eligible/Risk/High/Low = 색상 사용 금지 → 아이콘/텍스트/배지로만 구분
//   ✅ 적합 (check_circle)  ⚠ 개선 필요 (warning)  ⛔ 불가 (block)
// CTA/선택/진행바만 연보라 사용

// ── 테마 타입 (LIGHT/DARK 정의 전에 먼저 선언) ───────────────────────────────

export type ThemeMode = 'light' | 'dark'

export type ThemeTokens = {
  bg: string
  surface: string
  surfaceAlt: string
  surfaceDim: string
  accent: string
  accentDim: string
  accentHover: string
  text: string
  textSub: string
  textTertiary: string
  textOnAccent: string
  border: string
  borderLight: string
  eligible: string
  needsWork: string
  notEligible: string
  success: string
  warning: string
  danger: string
  shadowSm: string
  shadowMd: string
}

// ── 라이트 테마 토큰 ─────────────────────────────────────────────────────────

export const LIGHT: ThemeTokens = {
  // 배경
  bg: '#F9F8FF',              // 연보라 화이트 (메인 배경)
  surface: '#FFFFFF',          // 카드/시트 배경
  surfaceAlt: '#F0EEFF',       // 연보라 틴트 (강조 카드)
  surfaceDim: '#E8E3FF',       // 더 짙은 틴트 (선택 칩 배경)

  // 브랜드 (연보라 1색)
  accent: '#6B4EE8',           // Lavender 600 — CTA/진행바/선택
  accentDim: '#EDE9FE',        // Lavender 100 — 비활성 칩/배경
  accentHover: '#5B3FD8',      // Lavender 700 — 버튼 hover

  // 텍스트
  text: '#1A1333',             // 최상위 텍스트
  textSub: '#5F5A7A',          // 보조 텍스트
  textTertiary: '#9B96BC',     // 비활성/힌트
  textOnAccent: '#FFFFFF',     // accent 위 텍스트

  // 경계
  border: 'rgba(107, 78, 232, 0.12)',
  borderLight: 'rgba(107, 78, 232, 0.06)',

  // 상태 — 색상으로 구분 금지. 아이콘+텍스트 전용.
  eligible: '#1A1333',
  needsWork: '#1A1333',
  notEligible: '#9B96BC',

  // 시스템 메시지 (최소 사용)
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',

  // 그림자
  shadowSm: '0 1px 3px rgba(107, 78, 232, 0.08)',
  shadowMd: '0 4px 12px rgba(107, 78, 232, 0.12)',
}

// ── 다크 테마 토큰 (기존 색상 체계 유지) ─────────────────────────────────────

export const DARK: ThemeTokens = {
  bg: '#101322',
  surface: '#1b1e2e',
  surfaceAlt: '#252840',
  surfaceDim: '#2d3050',

  accent: '#1337ec',
  accentDim: 'rgba(19, 55, 236, 0.15)',
  accentHover: '#2548f8',

  text: '#FFFFFF',
  textSub: 'rgba(255,255,255,0.70)',
  textTertiary: 'rgba(255,255,255,0.40)',
  textOnAccent: '#FFFFFF',

  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.04)',

  eligible: '#FFFFFF',
  needsWork: '#FFFFFF',
  notEligible: 'rgba(255,255,255,0.40)',

  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',

  shadowSm: '0 1px 3px rgba(0,0,0,0.3)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.4)',
}

// ── 테마 맵 ───────────────────────────────────────────────────────────────────

export const THEMES: Record<ThemeMode, ThemeTokens> = {
  light: LIGHT,
  dark: DARK,
}

// ── localStorage 키 ───────────────────────────────────────────────────────────

const THEME_KEY = 'uncounted_theme_mode'

export function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* ignore */ }
  return 'light'
}

export function saveThemeMode(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_KEY, mode) } catch { /* ignore */ }
}

// ── CSS 커스텀 프로퍼티 적용 ─────────────────────────────────────────────────
// document.documentElement에 CSS 변수 주입 (index.css 변수명과 대응)

export function applyTheme(mode: ThemeMode): void {
  const t = THEMES[mode]
  const root = document.documentElement
  root.style.setProperty('--color-bg', t.bg)
  root.style.setProperty('--color-surface', t.surface)
  root.style.setProperty('--color-surface-alt', t.surfaceAlt)
  root.style.setProperty('--color-surface-dim', t.surfaceDim)
  root.style.setProperty('--color-accent', t.accent)
  root.style.setProperty('--color-accent-dim', t.accentDim)
  root.style.setProperty('--color-accent-hover', t.accentHover)
  root.style.setProperty('--color-text', t.text)
  root.style.setProperty('--color-text-sub', t.textSub)
  root.style.setProperty('--color-text-tertiary', t.textTertiary)
  root.style.setProperty('--color-text-on-accent', t.textOnAccent)
  root.style.setProperty('--color-border', t.border)
  root.style.setProperty('--color-border-light', t.borderLight)
  root.style.setProperty('--color-success', t.success)
  root.style.setProperty('--color-warning', t.warning)
  root.style.setProperty('--color-danger', t.danger)
  root.style.setProperty('--shadow-sm', t.shadowSm)
  root.style.setProperty('--shadow-md', t.shadowMd)
  root.dataset.theme = mode
}

// ── 적합도 표시 헬퍼 — 색상 없이 아이콘+텍스트만 ────────────────────────────

export type EligibilityDisplay = {
  icon: string          // Material Symbols Outlined 코드
  labelKo: string
  sublabelKo: string | null
}

export function getEligibilityDisplay(
  status: 'eligible' | 'needs_work' | 'not_eligible',
): EligibilityDisplay {
  switch (status) {
    case 'eligible':
      return { icon: 'check_circle', labelKo: '적합', sublabelKo: null }
    case 'needs_work':
      return { icon: 'warning', labelKo: '개선 필요', sublabelKo: '조건 충족 시 적합 전환' }
    case 'not_eligible':
      return { icon: 'block', labelKo: '현재 불가', sublabelKo: '이유 확인' }
  }
}

export function getPolicyRiskDisplay(
  risk: 'Low' | 'Med' | 'High',
): EligibilityDisplay {
  switch (risk) {
    case 'Low':
      return { icon: 'verified_user', labelKo: '리스크 낮음', sublabelKo: null }
    case 'Med':
      return { icon: 'security', labelKo: '리스크 중간', sublabelKo: '특수 권한 필요' }
    case 'High':
      return { icon: 'gpp_bad', labelKo: '리스크 높음', sublabelKo: '자기보고 대체 권장' }
  }
}
