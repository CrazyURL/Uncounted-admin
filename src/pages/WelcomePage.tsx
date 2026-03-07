// ── WelcomePage — 풀스크린 온보딩 슬라이드 (최초 1회) ──────────────────────────
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { DURATION, EASE } from '../lib/motionTokens'
import { advanceStage } from '../lib/tutorialStore'
import UncountedLogo from '../components/domain/UncountedLogo'

type Slide = {
  icon: string
  title: string
  subtitle: string
  bullets: string[]
}

const SLIDES: Slide[] = [
  {
    icon: 'shield_lock',
    title: '안심하세요',
    subtitle: '당신의 데이터는 안전합니다',
    bullets: [
      '원본 파일은 서버에 저장하지 않아요',
      '민감정보(PII)는 자동으로 잠금 처리돼요',
      '승인 전에는 절대 공개되지 않아요',
    ],
  },
  {
    icon: 'account_balance_wallet',
    title: '내 데이터, 내 가치',
    subtitle: 'Gross / Net / Locked',
    bullets: [
      'Gross: 전체 데이터의 예상 가치 범위',
      'Net: 공개 허용한 데이터의 가치',
      'Locked: 검토가 필요한 잠금 데이터',
    ],
  },
  {
    icon: 'rocket_launch',
    title: '지금 시작해요',
    subtitle: '3가지만 하면 준비 완료',
    bullets: [
      '기기에서 자산 스캔하기',
      '공개 준비 실행하기',
      '잠금 세션 1건 검토하기',
    ],
  },
]

const slideVariants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: DURATION.medium, ease: EASE.decelerate } },
  exit: { opacity: 0, y: -8, transition: { duration: DURATION.short, ease: EASE.accelerate } },
}

export default function WelcomePage() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState(0)

  const finish = useCallback(() => {
    advanceStage('coachmarks')
    navigate('/', { replace: true })
  }, [navigate])

  function next() {
    if (current < SLIDES.length - 1) {
      setCurrent((c) => c + 1)
    } else {
      finish()
    }
  }

  function prev() {
    if (current > 0) setCurrent((c) => c - 1)
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -50) next()
    else if (info.offset.x > 50) prev()
  }

  const slide = SLIDES[current]

  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* 배경 그라디언트 */}
      <div
        className="fixed top-0 left-0 w-full h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 0%, var(--color-accent-dim) 0%, transparent 70%)' }}
      />

      {/* 상단 바 */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        <UncountedLogo size={28} variant="mark" />
        <button
          onClick={finish}
          className="text-xs font-medium"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          건너뛰기
        </button>
      </div>

      {/* 슬라이드 영역 */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="w-full max-w-sm flex flex-col items-center text-center select-none"
          >
            {/* 아이콘 */}
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
              style={{ backgroundColor: 'var(--color-accent-dim)' }}
            >
              <span
                className="material-symbols-outlined text-4xl"
                style={{ color: 'var(--color-accent)' }}
              >
                {slide.icon}
              </span>
            </div>

            {/* 타이틀 */}
            <h1
              className="text-2xl font-extrabold mb-1 leading-tight"
              style={{ color: 'var(--color-text)' }}
            >
              {slide.title}
            </h1>
            <p
              className="text-sm mb-6"
              style={{ color: 'var(--color-text-sub)' }}
            >
              {slide.subtitle}
            </p>

            {/* 불릿 리스트 */}
            <ul className="flex flex-col gap-3 w-full text-left">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="material-symbols-outlined text-base mt-0.5 flex-shrink-0"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    check_circle
                  </span>
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 — dot + CTA */}
      <div
        className="relative z-10 px-8 pb-6"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {/* 도트 인디케이터 */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className="h-2 rounded-full transition-all duration-200"
              style={{
                width: i === current ? 24 : 8,
                backgroundColor: i === current ? 'var(--color-accent)' : 'var(--color-muted)',
              }}
            />
          ))}
        </div>

        {/* CTA 버튼 */}
        <button
          onClick={next}
          className="w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          {current < SLIDES.length - 1 ? '다음' : '시작하기'}
        </button>
      </div>
    </div>
  )
}
