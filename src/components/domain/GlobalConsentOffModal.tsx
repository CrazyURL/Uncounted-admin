// ── GlobalConsentOffModal — 일괄 공개 동의 OFF 전환 모달 ──────────────────────

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { slideUpVariants, backdropVariants } from '../../lib/motionTokens'

type Props = {
  isOpen: boolean
  onConfirm: (applyToExisting: boolean) => void
  onCancel: () => void
}

export default function GlobalConsentOffModal({ isOpen, onConfirm, onCancel }: Props) {
  const [applyExisting, setApplyExisting] = useState(false)

  function handleClose() { setApplyExisting(false); onCancel() }
  function handleConfirm() { onConfirm(applyExisting); setApplyExisting(false) }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div key="backdrop" variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
            onClick={handleClose} className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />

          <motion.div key="sheet" variants={slideUpVariants} initial="hidden" animate="visible" exit="hidden"
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl px-5 pt-5"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }} />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>lock</span>
              <p className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>공개 동의 비활성화</p>
            </div>

            <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              비활성화 후, 새로 생성되는 데이터는 기본 비공개로 저장됩니다.
              기존 공개 데이터는 별도로 선택하지 않으면 현재 상태를 유지합니다.
            </p>

            <label className="flex items-start gap-3 mb-5 cursor-pointer">
              <div className="w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors"
                style={applyExisting
                  ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                  : { backgroundColor: 'transparent', borderColor: 'var(--color-border)' }}
                onClick={() => setApplyExisting((v) => !v)}>
                {applyExisting && <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-on-accent)' }}>check</span>}
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>기존 데이터도 비공개로 전환</p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                  개별 수동 설정 레코드는 변경되지 않습니다.
                </p>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block"
                  style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}>선택</span>
              </div>
            </label>

            <div className="flex gap-3">
              <button onClick={handleClose} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}>
                취소
              </button>
              <button onClick={handleConfirm} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text)' }}>
                비활성화
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
