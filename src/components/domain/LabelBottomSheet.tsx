// ── LabelBottomSheet — 라벨 지정 바텀 시트 ────────────────────────────────────
// 5개 카테고리 선택 + 저장 시 900-1200ms 지연 (anti-macro).
// 최근 라벨 1탭 적용, AnimatePresence 슬라이드업.

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  slideUpVariants,
  backdropVariants,
  labelSaveVariants,
} from '../../lib/motionTokens'
import { type LabelCategory } from '../../types/session'
import {
  RELATIONSHIP_OPTIONS,
  PURPOSE_OPTIONS,
  DOMAIN_OPTIONS,
  TONE_OPTIONS,
  NOISE_OPTIONS,
} from '../../lib/labelOptions'

type SaveState = 'idle' | 'saving' | 'saved'

type Props = {
  isOpen: boolean
  initial: LabelCategory | null
  recentLabels?: LabelCategory[]
  onClose: () => void
  onSave: (labels: LabelCategory) => void
}

// ── 라벨 옵션 정의 (labelOptions.ts 단일 소스 참조) ──────────────────────────

const LABEL_OPTIONS: {
  key: keyof LabelCategory
  label: string
  options: readonly string[]
}[] = [
  { key: 'relationship', label: '관계', options: RELATIONSHIP_OPTIONS },
  { key: 'purpose', label: '목적', options: PURPOSE_OPTIONS },
  { key: 'domain', label: '도메인', options: DOMAIN_OPTIONS },
  { key: 'tone', label: '톤', options: TONE_OPTIONS },
  { key: 'noise', label: '환경 소음', options: NOISE_OPTIONS },
]

function emptyLabel(): LabelCategory {
  return { relationship: null, purpose: null, domain: null, tone: null, noise: null }
}

function countFilled(lc: LabelCategory): number {
  return Object.values(lc).filter((v) => v !== null).length
}

// ── Chip ───────────────────────────────────────────────────────────────────────
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={
        selected
          ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
          : {
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-text-sub)',
              border: '1px solid var(--color-border)',
            }
      }
    >
      {label}
    </button>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function LabelBottomSheet({
  isOpen,
  initial,
  recentLabels,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<LabelCategory>(() => initial ?? emptyLabel())
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // isOpen 변경 시 draft 리셋
  const prevOpen = useRef(false)
  if (isOpen && !prevOpen.current) {
    // 새로 열릴 때 initial 동기화
    setDraft(initial ?? emptyLabel())
    setSaveState('idle')
  }
  prevOpen.current = isOpen

  function pick(key: keyof LabelCategory, value: string) {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }))
  }

  function applyRecent(lc: LabelCategory) {
    setDraft(lc)
  }

  function handleSave() {
    if (saveState !== 'idle') return
    setSaveState('saving')

    // anti-macro: 900~1200ms 랜덤 지연
    const delay = 900 + Math.random() * 300
    timerRef.current = setTimeout(() => {
      setSaveState('saved')
      onSave(draft)
      setTimeout(() => {
        setSaveState('idle')
        onClose()
      }, 600)
    }, delay)
  }

  const filled = countFilled(draft)
  const saveLabel =
    saveState === 'saving' ? '저장 중...' : saveState === 'saved' ? '저장됨' : `저장 (${filled}/5)`

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 오버레이 */}
          <motion.div
            key="backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          />

          {/* 시트 */}
          <motion.div
            key="sheet"
            variants={slideUpVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              maxHeight: '88vh',
            }}
          >
            {/* 핸들 */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: 'var(--color-muted)' }}
              />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pb-3">
              <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>라벨 지정</p>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--color-muted)' }}
              >
                <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>
                  close
                </span>
              </button>
            </div>

            {/* 최근 라벨 1탭 적용 */}
            {recentLabels && recentLabels.length > 0 && (
              <div className="px-5 pb-3">
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>최근 라벨 빠른 적용</p>
                <div className="flex gap-2 flex-wrap">
                  {recentLabels.slice(0, 3).map((lc, i) => (
                    <button
                      key={i}
                      onClick={() => applyRecent(lc)}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium"
                      style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                    >
                      {[lc.relationship, lc.purpose, lc.domain].filter(Boolean).join(' · ') || `세트 ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 구분선 */}
            {recentLabels && recentLabels.length > 0 && (
              <div className="mx-5 h-px mb-3" style={{ backgroundColor: 'var(--color-border)' }} />
            )}

            {/* 스크롤 콘텐츠 */}
            <div className="overflow-y-auto px-5 pb-32" style={{ maxHeight: '60vh' }}>
              {LABEL_OPTIONS.map(({ key, label, options }) => (
                <div key={key} className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--color-text-sub)' }}>{label}</p>
                    {draft[key] && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                      >
                        {draft[key]}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.map((opt) => (
                      <Chip
                        key={opt}
                        label={opt}
                        selected={draft[key] === opt}
                        onClick={() => pick(key, opt)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 고정 하단 액션바 */}
            <div
              className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-3"
              style={{
                background: 'linear-gradient(to top, var(--color-surface) 70%, transparent)',
              }}
            >
              <motion.button
                variants={labelSaveVariants}
                animate={saveState}
                onClick={handleSave}
                disabled={saveState !== 'idle' || filled === 0}
                className="w-full py-3.5 rounded-xl text-sm font-semibold"
                style={
                  saveState === 'saved'
                    ? { backgroundColor: 'var(--color-success-dim)', color: 'var(--color-success)' }
                    : filled > 0
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                      : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }
                }
              >
                {saveLabel}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
