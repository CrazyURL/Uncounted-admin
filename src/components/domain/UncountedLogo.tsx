// ── UncountedLogo — SVG 로고 컴포넌트 (U + 사운드웨이브) ─────────────────────

type Props = {
  /** mark 높이(px). 기본 40 */
  size?: number
  /** mark = U 아이콘만, full = U + "Uncounted" 텍스트 */
  variant?: 'mark' | 'full'
  className?: string
}

/**
 * 보라색 U자 + 사운드웨이브 바 SVG 로고.
 * 라이트/다크 모두 동일한 고유 컬러 사용 (브랜드 보라).
 * 바 좌표는 favicon.svg와 동일 (정수 좌표, 4px 너비).
 */
export default function UncountedLogo({ size = 40, variant = 'mark', className }: Props) {
  const markWidth = size * (80 / 88)  // viewBox 비율 유지

  if (variant === 'mark') {
    return (
      <svg
        width={markWidth}
        height={size}
        viewBox="0 0 80 88"
        fill="none"
        className={className}
        aria-label="Uncounted"
      >
        <defs>
          <linearGradient id="u-grad" x1="40" y1="4" x2="40" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A599D4" />
            <stop offset="100%" stopColor="#7B6DB6" />
          </linearGradient>
        </defs>
        {/* U 형태 */}
        <path
          d="M10 4 L10 52 Q10 82 40 82 Q70 82 70 52 L70 4 L60 4 L56 14 L56 50 Q56 68 40 68 Q24 68 24 50 L24 14 L20 4 Z"
          fill="url(#u-grad)"
        />
        {/* 사운드웨이브 바 5개 — 정수 좌표, U 내부 정중앙 */}
        <rect x="26" y="30" width="4" height="12" rx="2" fill="#E0DAF0" />
        <rect x="32" y="26" width="4" height="20" rx="2" fill="#E0DAF0" />
        <rect x="38" y="22" width="4" height="28" rx="2" fill="#E0DAF0" />
        <rect x="44" y="26" width="4" height="20" rx="2" fill="#E0DAF0" />
        <rect x="50" y="30" width="4" height="12" rx="2" fill="#E0DAF0" />
        {/* 작은 점 (바 2, 4 위) */}
        <circle cx="34" cy="23" r="2" fill="#E0DAF0" />
        <circle cx="46" cy="23" r="2" fill="#E0DAF0" />
      </svg>
    )
  }

  // full variant: mark + 텍스트
  const textSize = size * 0.35
  return (
    <div className={`flex flex-col items-center ${className ?? ''}`} style={{ gap: 4 }}>
      <svg
        width={markWidth}
        height={size}
        viewBox="0 0 80 88"
        fill="none"
        aria-label="Uncounted"
      >
        <defs>
          <linearGradient id="u-grad-full" x1="40" y1="4" x2="40" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A599D4" />
            <stop offset="100%" stopColor="#7B6DB6" />
          </linearGradient>
        </defs>
        <path
          d="M10 4 L10 52 Q10 82 40 82 Q70 82 70 52 L70 4 L60 4 L56 14 L56 50 Q56 68 40 68 Q24 68 24 50 L24 14 L20 4 Z"
          fill="url(#u-grad-full)"
        />
        <rect x="26" y="30" width="4" height="12" rx="2" fill="#E0DAF0" />
        <rect x="32" y="26" width="4" height="20" rx="2" fill="#E0DAF0" />
        <rect x="38" y="22" width="4" height="28" rx="2" fill="#E0DAF0" />
        <rect x="44" y="26" width="4" height="20" rx="2" fill="#E0DAF0" />
        <rect x="50" y="30" width="4" height="12" rx="2" fill="#E0DAF0" />
        <circle cx="34" cy="23" r="2" fill="#E0DAF0" />
        <circle cx="46" cy="23" r="2" fill="#E0DAF0" />
      </svg>
      <span
        style={{
          fontSize: textSize,
          fontWeight: 800,
          fontFamily: "'Manrope', 'Noto Sans KR', sans-serif",
          color: 'var(--color-text)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        Uncounted
      </span>
    </div>
  )
}
