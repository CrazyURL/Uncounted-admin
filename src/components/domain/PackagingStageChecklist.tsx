// 패키징 진행 단계 체크리스트
// API의 packageBuilder.ts setStage 라벨과 정확히 일치해야 한다.

const PACKAGING_STAGES: readonly string[] = [
  '작업 조회',
  '클라이언트 조회',
  'BU 잠금 세션 조회',
  '발화 목록 조회 (v3)',
  '품질 지표 로드',
  '화자 인구통계 로드',
  '동의 상태 로드',
  '전사 로드',
  '메타데이터 이벤트 로드',
  'ZIP 생성',
  '오디오 추가',
  'S3 업로드',
  '작업 상태 업데이트',
]

// 폴백/대체 경로 단계 → 정규 단계 매핑
const STAGE_ALIASES: Record<string, string> = {
  '제외 발화 목록 조회': '발화 목록 조회 (v3)',
  '레거시 발화 목록 조회': '발화 목록 조회 (v3)',
}

// 동적 진행률을 가진 stage (예: "오디오 추가 200/1000") → 정규 stage로 매핑
function resolveStage(raw: string): { canonical: string; detail: string | null } {
  if (STAGE_ALIASES[raw]) return { canonical: STAGE_ALIASES[raw], detail: null }
  // "오디오 추가 N/M" 같은 prefix 매칭
  for (const stage of PACKAGING_STAGES) {
    if (raw.startsWith(stage + ' ') || raw === stage) {
      const detail = raw === stage ? null : raw.slice(stage.length + 1)
      return { canonical: stage, detail }
    }
  }
  return { canonical: raw, detail: null }
}

interface PackagingStageChecklistProps {
  currentStage: string | null
}

export default function PackagingStageChecklist({ currentStage }: PackagingStageChecklistProps) {
  const resolved = currentStage ? resolveStage(currentStage) : null
  const currentIndex = resolved ? PACKAGING_STAGES.indexOf(resolved.canonical) : -1

  return (
    <ul className="flex flex-col gap-1.5 w-full" style={{ minWidth: 240 }}>
      {PACKAGING_STAGES.map((stage, idx) => {
        const isCompleted = currentIndex >= 0 && idx < currentIndex
        const isCurrent = idx === currentIndex

        const icon = isCompleted
          ? 'check_circle'
          : isCurrent
            ? 'progress_activity'
            : 'radio_button_unchecked'
        const iconColor = isCompleted
          ? '#22c55e'
          : isCurrent
            ? '#8b5cf6'
            : 'rgba(255,255,255,0.25)'
        const textColor = isCompleted
          ? 'rgba(255,255,255,0.55)'
          : isCurrent
            ? '#ffffff'
            : 'rgba(255,255,255,0.35)'

        const detail = isCurrent ? resolved?.detail : null

        return (
          <li key={stage} className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-base ${isCurrent ? 'animate-spin' : ''}`}
              style={{ color: iconColor, fontSize: 18 }}
            >
              {icon}
            </span>
            <span
              className="text-xs"
              style={{ color: textColor, fontWeight: isCurrent ? 600 : 400 }}
            >
              {stage}
              {detail && (
                <span className="ml-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {detail}
                </span>
              )}
            </span>
          </li>
        )
      })}
      {currentStage && currentIndex < 0 && !STAGE_ALIASES[currentStage] && (
        <li className="flex items-center gap-2 mt-1">
          <span
            className="material-symbols-outlined text-base animate-spin"
            style={{ color: '#8b5cf6', fontSize: 18 }}
          >
            progress_activity
          </span>
          <span className="text-xs" style={{ color: '#ffffff', fontWeight: 600 }}>
            {currentStage}
          </span>
        </li>
      )}
    </ul>
  )
}
