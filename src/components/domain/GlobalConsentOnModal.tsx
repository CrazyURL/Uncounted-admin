// ── GlobalConsentOnModal — 일괄 공개 동의 ON 전환 모달 ──────────────────────────

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { slideUpVariants, backdropVariants } from '../../lib/motionTokens'

type Props = {
  isOpen: boolean
  joinedSkus: Set<string>
  onConfirm: (applyToExisting: boolean) => void
  onCancel: () => void
}

const VOICE_SKUS = new Set(['U-A01', 'U-A02', 'U-A03'])

const PUBLIC_SCOPE_ITEMS = [
  '음성 파일 메타데이터 (길이, 날짜, 품질 점수)',
  '사용자가 입력한 라벨 (관계·목적·도메인·톤·소음)',
  '휴대폰 통화 이벤트 버킷 (건수, 시간대 — 내용 없음)',
  '기기 환경 버킷 (연결성, 배터리 수준 — 위치 없음)',
]

const NOT_PUBLIC_ITEMS = [
  '음성 통화 내용 (대화·녹취록)',
  '이름·주소·전화번호 등 PII',
  'GPU AI 추론 결과물',
  '정밀 위치·정밀 타임스탬프',
]

export default function GlobalConsentOnModal({ isOpen, joinedSkus, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [checked1, setChecked1] = useState(false)
  const [checked2, setChecked2] = useState(false)
  const [applyExisting, setApplyExisting] = useState(false)

  const hasVoiceSkuJoined = [...joinedSkus].some((id) => VOICE_SKUS.has(id))
  const canConfirm = checked1 && (!hasVoiceSkuJoined || checked2)

  function handleClose() {
    setStep(1); setChecked1(false); setChecked2(false); setApplyExisting(false); onCancel()
  }

  function handleConfirm() {
    if (!canConfirm) return
    onConfirm(applyExisting)
    setStep(1); setChecked1(false); setChecked2(false); setApplyExisting(false)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div key="backdrop" variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
            onClick={handleClose} className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />

          <motion.div key="sheet" variants={slideUpVariants} initial="hidden" animate="visible" exit="hidden"
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', maxHeight: '90vh' }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }} />
            </div>

            <div className="overflow-y-auto px-5" style={{ maxHeight: '80vh', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>

              {step === 1 && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-accent)' }}>shield</span>
                    <p className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>데이터 공개 동의 안내</p>
                  </div>

                  <div className="rounded-xl p-4 mb-3" style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>공개 대상 항목</p>
                    {PUBLIC_SCOPE_ITEMS.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="material-symbols-outlined text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }}>check</span>
                        <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl p-4 mb-3" style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>공개하지 않는 항목</p>
                    {NOT_PUBLIC_ITEMS.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="material-symbols-outlined text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }}>cancel</span>
                        <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl p-3 mb-5" style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                      <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>공개 범위:</span>{' '}
                      현재 참여 ON인 SKU에 한정 (기본값). 언제든 토글 OFF로 철회할 수 있습니다.
                    </p>
                  </div>

                  <button onClick={() => setStep(2)} className="w-full py-3.5 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}>
                    다음 — 상세 동의
                  </button>
                  <button onClick={handleClose} className="w-full py-3 text-sm mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    취소
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="font-semibold text-base mb-4" style={{ color: 'var(--color-text)' }}>동의 확인</p>

                  <label className="flex items-start gap-3 mb-4 cursor-pointer">
                    <div className="w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors"
                      style={checked1
                        ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                        : { backgroundColor: 'transparent', borderColor: 'var(--color-border)' }}
                      onClick={() => setChecked1((v) => !v)}>
                      {checked1 && <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-on-accent)' }}>check</span>}
                    </div>
                    <div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>데이터 공개 및 이용에 동의합니다</p>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                        목적: AI 학습 데이터 판매/제공. 적용 시점: 동의 즉시 (향후 데이터).
                      </p>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-danger)' }}>필수</span>
                    </div>
                  </label>

                  {hasVoiceSkuJoined && (
                    <label className="flex items-start gap-3 mb-4 cursor-pointer">
                      <div className="w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors"
                        style={checked2
                          ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                          : { backgroundColor: 'transparent', borderColor: 'var(--color-border)' }}
                        onClick={() => setChecked2((v) => !v)}>
                        {checked2 && <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-on-accent)' }}>check</span>}
                      </div>
                      <div>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>제3자 음성·대화가 포함될 수 있음을 이해합니다</p>
                        <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                          통화 녹음에는 상대방의 음성이 포함될 수 있습니다.
                        </p>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block"
                          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-danger)' }}>필수 (음성 SKU 참여 중)</span>
                      </div>
                    </label>
                  )}

                  <div className="h-px mb-4" style={{ backgroundColor: 'var(--color-border)' }} />

                  <label className="flex items-start gap-3 mb-2 cursor-pointer">
                    <div className="w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors"
                      style={applyExisting
                        ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                        : { backgroundColor: 'transparent', borderColor: 'var(--color-border)' }}
                      onClick={() => setApplyExisting((v) => !v)}>
                      {applyExisting && <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-on-accent)' }}>check</span>}
                    </div>
                    <div>
                      <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>기존 데이터에도 일괄 적용</p>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                        개별 수동 설정(비공개) 레코드는 변경되지 않습니다.
                      </p>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }}>선택</span>
                    </div>
                  </label>

                  <div className="mt-5 flex flex-col gap-2">
                    <button onClick={handleConfirm} disabled={!canConfirm}
                      className="w-full py-3.5 rounded-xl text-sm font-semibold"
                      style={canConfirm
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                        : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }}>
                      동의하고 활성화
                    </button>
                    <button onClick={() => setStep(1)} className="w-full py-2.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      이전
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
