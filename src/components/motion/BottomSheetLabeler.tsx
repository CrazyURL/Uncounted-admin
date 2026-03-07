// ── Motion Moment #3: Bottom Sheet Labeler (slide-up) ────────────────────────
// AnimatePresence로 mount/unmount 트랜지션 처리.
// 배경 오버레이 탭 시 닫힘.

import { motion, AnimatePresence } from 'framer-motion'
import { slideUpVariants, backdropVariants } from '../../lib/motionTokens'

type LabelOption = { value: string; label: string; emoji: string }

const LABEL_OPTIONS: LabelOption[] = [
  { value: 'business', label: '업무',    emoji: '💼' },
  { value: 'daily',    label: '일상',    emoji: '💬' },
  { value: 'edu',      label: '교육',    emoji: '📚' },
  { value: 'tech',     label: '기술 논의', emoji: '💻' },
]

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelect?: (value: string) => void
  title?: string
}

export default function BottomSheetLabeler({ isOpen, onClose, onSelect, title = '라벨 선택' }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            key="backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
          />

          {/* 시트 본체 */}
          <motion.div
            key="sheet"
            variants={slideUpVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
            style={{ backgroundColor: '#1b1e2e', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-white font-bold text-base">{title}</p>
              <button onClick={onClose} className="p-1">
                <span className="material-symbols-outlined text-white/40" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            {/* 라벨 옵션 */}
            <div className="px-5 pb-4 grid grid-cols-2 gap-2">
              {LABEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onSelect?.(opt.value); onClose() }}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl transition-colors active:scale-[0.97]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-white/80 text-sm font-medium">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="pb-6" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
