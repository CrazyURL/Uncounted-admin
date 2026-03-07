/** 금액을 콤마 포맷으로 표시 (4757990 → "4,757,990") */
export function formatWonShort(amount: number): string {
  return Math.round(amount).toLocaleString()
}

/** 금액을 만/억 단위로 축약 (7791127 → "779만", 24070817 → "2,407만", 150000000 → "1.5억") */
export function formatWonCompact(amount: number): string {
  const n = Math.round(amount)
  if (n < 10000) return n.toLocaleString()
  if (n < 100000000) {
    const man = Math.round(n / 10000)
    return `${man.toLocaleString()}만`
  }
  const eok = n / 100000000
  return `${eok.toFixed(1)}억`
}

/** 금액을 최상위 2자리만 남기고 K 단위로 표시 (6008670 → "6,000K", 18026261 → "18,000K") */
export function formatWonTruncK(amount: number): string {
  if (amount < 1000) return `${Math.round(amount)}`
  const digits = Math.floor(Math.log10(amount)) + 1
  const unit = Math.pow(10, Math.max(digits - 2, 0))
  const truncated = Math.floor(amount / unit) * unit
  return `${Math.floor(truncated / 1000).toLocaleString()}K`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
