import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Session, type ShareScope } from '../../types/session'
import { preScan, type PreScanSummary } from '../../lib/sharePrepEngine'
import { getCachedSummary, setCachedSummary } from '../../lib/sharePrepStore'

type SharePrepModalProps = {
  isOpen: boolean
  targetScope: ShareScope
  sessions: Session[]
  onConfirm: () => void
  onCancel: () => void
}

export default function SharePrepModal({
  isOpen,
  targetScope,
  sessions,
  onConfirm,
  onCancel,
}: SharePrepModalProps) {
  const [summary, setSummary] = useState<PreScanSummary | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanDone, setScanDone] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSummary(null)
      setScanDone(0)
      setScanTotal(0)
      setFromCache(false)
      return
    }

    // 캐시 히트 → 즉시 표시
    const cached = getCachedSummary(sessions.length)
    if (cached) {
      setSummary(cached)
      setFromCache(true)
      return
    }

    // 캐시 미스 → 전체 스캔
    runScan()
  }, [isOpen, sessions])

  function runScan() {
    setFromCache(false)
    setScanning(true)
    setScanTotal(sessions.length)
    setScanDone(0)
    setSummary(null)
    preScan(sessions, (done, total) => {
      setScanDone(done)
      setScanTotal(total)
    }).then((s) => {
      setSummary(s)
      setScanning(false)
      setCachedSummary(s, sessions.length)
    })
  }

  const scanPct = scanTotal > 0 ? Math.round((scanDone / scanTotal) * 100) : 0
  const scopeLabel = targetScope === 'PUBLIC' ? '전체 공개' : '그룹 공개'

  // 캐시 경과 시간
  const cacheAge = summary?.scannedAt
    ? Math.floor((Date.now() - summary.scannedAt) / 1000)
    : 0
  const cacheAgeLabel = cacheAge < 60 ? `${cacheAge}초 전` : `${Math.floor(cacheAge / 60)}분 전`

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md rounded-t-3xl px-5 pt-6 pb-8 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            {/* 핸들 */}
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'var(--color-border)' }} />

            {/* 제목 */}
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-accent)' }}>
                verified_user
              </span>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                {scopeLabel} 준비
              </h2>
            </div>

            <p className="text-xs mb-5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
              공개 전 민감정보를 자동 점검합니다. 민감정보 의심 구간은 잠금 처리되며
              확인 및 승인 전까지 공개되지 않습니다.
            </p>

            {/* 스캔 요약 */}
            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'var(--color-muted)' }}>
              {scanning ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg animate-spin" style={{ color: 'var(--color-accent)' }}>
                        autorenew
                      </span>
                      <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>세션 점검 중</p>
                    </div>
                    <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
                      {scanDone.toLocaleString()}/{scanTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${scanPct}%`, backgroundColor: 'var(--color-accent)' }}
                    />
                  </div>
                  <p className="text-[10px] text-right" style={{ color: 'var(--color-text-tertiary)' }}>
                    {scanPct}% 완료
                  </p>
                </div>
              ) : summary ? (
                <div className="flex flex-col gap-2">
                  <SummaryRow icon="folder_open" label="전체 세션" value={`${summary.total.toLocaleString()}건`} />
                  <SummaryRow icon="check_circle" label="공개 가능" value={`${summary.eligible.toLocaleString()}건`} accent />
                  {summary.locked > 0 && (
                    <SummaryRow icon="lock" label="잠금 (PII)" value={`${summary.locked.toLocaleString()}건`} warning />
                  )}
                  {summary.ineligible > 0 && (
                    <SummaryRow icon="block" label="품질 미달" value={`${summary.ineligible.toLocaleString()}건`} />
                  )}
                  {summary.alreadyUploaded > 0 && (
                    <SummaryRow icon="cloud_done" label="이미 업로드" value={`${summary.alreadyUploaded.toLocaleString()}건`} />
                  )}
                  {summary.notConsented > 0 && (
                    <SummaryRow icon="visibility_off" label="동의 필요" value={`${summary.notConsented.toLocaleString()}건`} warning />
                  )}
                  {summary.unlabeled > 0 && (
                    <SummaryRow icon="label_off" label="라벨 미완료" value={`${summary.unlabeled.toLocaleString()}건`} />
                  )}

                  {/* 캐시 + 재스캔 */}
                  {fromCache && (
                    <div className="flex items-center justify-between mt-1 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {cacheAgeLabel} 스캔 결과
                      </span>
                      <button
                        onClick={runScan}
                        className="text-[10px] font-semibold flex items-center gap-0.5"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
                        재스캔
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* 기본 정책 안내 */}
            <div className="flex items-start gap-2 mb-5 px-1">
              <span className="material-symbols-outlined text-sm mt-0.5" style={{ color: 'var(--color-accent)' }}>info</span>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                {summary && summary.notConsented > 0
                  ? '공개 동의가 필요한 세션은 자동 제외됩니다. 자산 페이지에서 공개 동의를 설정하세요.'
                  : summary && summary.locked > 0
                  ? '잠금 항목은 제외하고 공개됩니다. 잠금 항목은 별도로 검토할 수 있습니다.'
                  : '민감정보가 탐지되지 않았습니다. 품질 미달 세션은 자동 제외됩니다.'}
              </p>
            </div>

            {/* 버튼 */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onConfirm}
                disabled={scanning || (summary?.eligible ?? 0) === 0}
                className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                style={
                  !scanning && (summary?.eligible ?? 0) > 0
                    ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                    : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed' }
                }
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                {summary && summary.locked > 0
                  ? '잠금 제외하고 공개 진행'
                  : `공개 진행 (${(summary?.eligible ?? 0).toLocaleString()}건)`}
              </button>


              <button
                onClick={onCancel}
                className="w-full py-2.5 text-sm font-medium"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                취소
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SummaryRow({
  icon,
  label,
  value,
  accent,
  warning,
}: {
  icon: string
  label: string
  value: string
  accent?: boolean
  warning?: boolean
}) {
  let iconColor = 'var(--color-text-tertiary)'
  if (accent) iconColor = 'var(--color-accent)'
  if (warning) iconColor = 'var(--color-text-sub)'

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm" style={{ color: iconColor }}>{icon}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{label}</span>
      </div>
      <span
        className="text-xs font-semibold"
        style={{ color: accent ? 'var(--color-accent)' : warning ? 'var(--color-text)' : 'var(--color-text-sub)' }}
      >
        {value}
      </span>
    </div>
  )
}
