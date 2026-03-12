import { type BillableUnit } from '../../types/admin'

type Props = { unit: BillableUnit }

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' }
const TIER_LABELS: Record<string, string> = { basic: '기본', verified: '검증', gold: '골드' }

export default function BillableUnitRow({ unit }: Props) {
  const isConsented = unit.consentStatus === 'PUBLIC_CONSENTED'

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ backgroundColor: '#1b1e2e' }}
    >
      {/* 등급 배지 */}
      <span
        className="text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded"
        style={{ backgroundColor: `${GRADE_COLORS[unit.qualityGrade]}20`, color: GRADE_COLORS[unit.qualityGrade] }}
      >
        {unit.qualityGrade}
      </span>

      {/* 세션 ID + 분 인덱스 */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">
          {unit.sessionId ? unit.sessionId.slice(0, 8) : ''}..._{unit.minuteIndex}
        </p>
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {unit.sessionDate} · {Math.round(unit.effectiveSeconds)}초
        </p>
      </div>

      {/* 티어 */}
      <span
        className="text-[10px] px-1.5 py-0.5 rounded"
        style={{
          backgroundColor: unit.qualityTier === 'gold' ? 'rgba(234,179,8,0.15)' :
            unit.qualityTier === 'verified' ? 'rgba(19,55,236,0.15)' : 'rgba(255,255,255,0.06)',
          color: unit.qualityTier === 'gold' ? '#eab308' :
            unit.qualityTier === 'verified' ? '#7b9aff' : 'rgba(255,255,255,0.4)',
        }}
      >
        {TIER_LABELS[unit.qualityTier]}
      </span>

      {/* 동의 */}
      <span
        className="material-symbols-outlined text-sm"
        style={{ color: isConsented ? '#22c55e' : 'rgba(255,255,255,0.2)' }}
      >
        {isConsented ? 'verified_user' : 'shield'}
      </span>

      {/* 잠금 상태 */}
      {unit.lockStatus !== 'available' && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: unit.lockStatus === 'delivered' ? 'rgba(19,55,236,0.15)' : 'rgba(234,179,8,0.15)',
            color: unit.lockStatus === 'delivered' ? '#7b9aff' : '#eab308',
          }}
        >
          {unit.lockStatus === 'delivered' ? '납품' : '잠금'}
        </span>
      )}
    </div>
  )
}
