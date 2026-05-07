import { Fragment } from 'react'

interface HeatmapCell {
  dateBucket: string
  timeBucket: string
  count: number
}

interface MetadataHeatmapProps {
  data: HeatmapCell[]
}

const TIME_SLOTS = [
  '00-02', '02-04', '04-06', '06-08', '08-10', '10-12',
  '12-14', '14-16', '16-18', '18-20', '20-22', '22-24',
]

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
}

function getHeatColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return 'var(--color-surface-alt)'
  const ratio = count / maxCount
  if (ratio > 0.75) return 'rgba(139,92,246,0.7)'
  if (ratio > 0.5) return 'rgba(139,92,246,0.45)'
  if (ratio > 0.25) return 'rgba(139,92,246,0.25)'
  return 'rgba(139,92,246,0.12)'
}

export default function MetadataHeatmap({ data }: MetadataHeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>히트맵 데이터 없음</p>
      </div>
    )
  }

  // 요일 모드 자동 감지: dateBucket에 mon/tue/... 가 있으면 요일 모드
  const isDayOfWeekMode = data.some(d => DAY_ORDER.includes(d.dateBucket))

  const rawBuckets = [...new Set(data.map(d => d.dateBucket))]
  // 요일 모드: 항상 월~일 7개 전체 표시. 날짜 모드: 데이터 있는 날짜만.
  const dateBuckets = isDayOfWeekMode
    ? [...DAY_ORDER]
    : rawBuckets.sort()
  const maxCount = Math.max(...data.map(d => d.count), 1)

  const cellMap = new Map<string, number>()
  data.forEach(d => {
    cellMap.set(`${d.dateBucket}|${d.timeBucket}`, d.count)
  })

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-sub)' }}>
        {isDayOfWeekMode ? '요일×시간대 밀도' : '시간대별 밀도'}
      </h3>

      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `48px repeat(${dateBuckets.length}, minmax(32px, 1fr))`,
          }}
        >
          {/* Header row: date labels */}
          <div />
          {dateBuckets.map(date => (
            <div
              key={date}
              className="text-center text-[9px] font-mono truncate"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {isDayOfWeekMode ? (DAY_LABELS[date] ?? date) : date.slice(5)}
            </div>
          ))}

          {/* Data rows: one per time slot */}
          {TIME_SLOTS.map(slot => (
            <Fragment key={slot}>
              <div
                className="text-right pr-2 text-[9px] font-mono flex items-center justify-end"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {slot}
              </div>
              {dateBuckets.map(date => {
                const count = cellMap.get(`${date}|${slot}`) ?? 0
                return (
                  <div
                    key={`${date}|${slot}`}
                    className="rounded-sm aspect-square min-h-[16px] flex items-center justify-center text-[8px] font-bold"
                    style={{
                      backgroundColor: getHeatColor(count, maxCount),
                      color: count > 0 ? (count / maxCount > 0.5 ? '#000' : 'var(--color-text-sub)') : 'transparent',
                    }}
                    title={`${date} ${slot}: ${count}건`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>적음</span>
        {[0.12, 0.25, 0.45, 0.7].map(opacity => (
          <div
            key={opacity}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: `rgba(139,92,246,${opacity})` }}
          />
        ))}
        <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>많음</span>
      </div>
    </div>
  )
}
