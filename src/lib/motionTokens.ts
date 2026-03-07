// ── Kinetic Motion System v1 ─────────────────────────────────────────────────
// 철학: Quiet-first (80% subtle) + Kinetic accents (20% expressive)
// prefers-reduced-motion: App.tsx에서 MotionConfig reducedMotion="user" 적용
// spec: docs/motion-checklist.md

import { type Variants, type Transition } from 'framer-motion'

// ── Duration (seconds) ───────────────────────────────────────────────────────
export const DURATION = {
  micro:    0.12,  // 120ms — chip tap, toggle state, step check
  short:    0.18,  // 180ms — state change, exit
  stepDot:  0.20,  // 200ms — stepper dot fill
  medium:   0.24,  // 240ms — card entry, fade
  long:     0.30,  // 300ms — sheet slide, stamp reveal
  countUp:  0.75,  // 750ms — 숫자 카운트업/다운 (rAF)
} as const

// ── Cubic-bezier easing ──────────────────────────────────────────────────────
export const EASE = {
  standard:   [0.2, 0.0, 0.0, 1.0] as [number, number, number, number],
  decelerate: [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
  accelerate: [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
} as const

// ── Spring presets ───────────────────────────────────────────────────────────
export const SPRING: Record<string, Transition> = {
  responsive: { type: 'spring', stiffness: 400, damping: 28 },
  bouncy:     { type: 'spring', stiffness: 500, damping: 22 },
  snappy:     { type: 'spring', stiffness: 600, damping: 35 },
}

// ── Variants ─────────────────────────────────────────────────────────────────

/** 리스트 항목: 아래에서 위로 페이드인 (y 12px) */
export const fadeSlideVariants: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.medium, ease: EASE.standard },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: DURATION.short, ease: EASE.accelerate },
  },
}

/** 자식 요소를 순차적으로 등장시키는 컨테이너 */
export const staggerContainerVariants: Variants = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

/** 뱃지/도장: 스프링 스케일 + 미세 회전 */
export const stampVariants: Variants = {
  hidden:  { scale: 0.2, opacity: 0, rotate: -12 },
  visible: {
    scale: 1,
    opacity: 1,
    rotate: 0,
    transition: { type: 'spring', stiffness: 500, damping: 22 },
  },
}

/** 바텀시트: 아래에서 슬라이드 업 */
export const slideUpVariants: Variants = {
  hidden:  { y: '100%', opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: DURATION.long, ease: EASE.decelerate },
  },
  exit: {
    y: '100%',
    opacity: 0,
    transition: { duration: DURATION.medium, ease: EASE.accelerate },
  },
}

/** 가치 범위 바: originX 0 기준 scaleX 채우기 (custom = 0~100) */
export const barFillVariants: Variants = {
  hidden:  { scaleX: 0 },
  visible: (pct: number) => ({
    scaleX: pct / 100,
    transition: { duration: DURATION.long, ease: EASE.standard, delay: 0.1 },
  }),
}

/** 배경 오버레이 페이드 */
export const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.short } },
  exit:    { opacity: 0, transition: { duration: DURATION.short } },
}

// ── 5 핵심 모멘트 Variants (2026 Kinetic) ─────────────────────────────────────

/** Moment 1: Vault 카드 업데이트 — 스캔 완료 시 미세 pulse */
export const vaultPulseVariants: Variants = {
  idle:  { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.012, 1],
    opacity: [1, 0.85, 1],
    transition: { duration: 0.45, ease: EASE.standard },
  },
}

/** Moment 2: Grade 배지 도장 (stampVariants 재사용, 여기서 re-export alias) */
export { stampVariants as gradeBadgeVariants }

/** Moment 3: SKU Eligible 상태 변화 — 바 슬라이드 (custom = 0~100) */
export const eligibilityBarVariants: Variants = {
  hidden:  { scaleX: 0, originX: 0 },
  visible: (pct: number) => ({
    scaleX: pct / 100,
    transition: { duration: DURATION.long + 0.05, ease: EASE.standard, delay: 0.08 },
  }),
}

/** Moment 4: 라벨 저장 — 칩 → 완료 상태 전환 */
export const labelSaveVariants: Variants = {
  idle:   { scale: 1, opacity: 1 },
  saving: {
    scale: 0.92,
    opacity: 0.55,
    transition: { duration: DURATION.short, ease: EASE.accelerate },
  },
  saved:  {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 480, damping: 24 },
  },
}

/** Moment 5: 삭제/철회 — 단계적 차분한 fade (화려한 효과 금지) */
export const deleteFadeVariants: Variants = {
  visible:  { opacity: 1, scale: 1 },
  warning:  {
    opacity: 0.5,
    scale: 0.99,
    transition: { duration: DURATION.medium, ease: EASE.standard },
  },
  deleted:  {
    opacity: 0,
    scale: 0.97,
    transition: { duration: DURATION.long, ease: EASE.accelerate },
  },
}
