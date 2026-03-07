// ── 기여자 등급 체계 ─────────────────────────────────────────────────────────
// basic → verified → certified 3단계
// 프로필 완성도 + 라벨 확인율 + 프로필 일관성으로 결정

export type ContributorLevel = 'basic' | 'verified' | 'certified'

export type ContributorResult = {
  level: ContributorLevel
  labelKo: string
  profileComplete: boolean
  labelConfirmRate: number    // user_confirmed / total labeled (0~1)
  consistencyScore: number    // profile_confidence 수치 (0~1)
  nextRequirements: string[]  // 다음 등급 달성 미충족 조건
}

const LABEL_KO: Record<ContributorLevel, string> = {
  basic: '기본',
  verified: '인증됨',
  certified: '공인됨',
}

export function calcContributorLevel(params: {
  profileCompleted: boolean
  labelConfirmRate: number
  consistencyScore: number
}): ContributorResult {
  const { profileCompleted, labelConfirmRate, consistencyScore } = params

  const meetsVerified = profileCompleted && labelConfirmRate >= 0.70
  const meetsCertified = meetsVerified && consistencyScore >= 0.85

  const level: ContributorLevel = meetsCertified
    ? 'certified'
    : meetsVerified
      ? 'verified'
      : 'basic'

  const nextRequirements: string[] = []

  if (level === 'basic') {
    if (!profileCompleted) nextRequirements.push('프로필 설정 완료')
    if (labelConfirmRate < 0.70) {
      nextRequirements.push(`라벨 확인율 70% 이상 (현재 ${Math.round(labelConfirmRate * 100)}%)`)
    }
  } else if (level === 'verified') {
    if (consistencyScore < 0.85) {
      nextRequirements.push('프로필 90일 일관성 유지 (consistency_verified 승격)')
    }
  }

  return {
    level,
    labelKo: LABEL_KO[level],
    profileComplete: profileCompleted,
    labelConfirmRate: Math.round(labelConfirmRate * 100) / 100,
    consistencyScore: Math.round(consistencyScore * 100) / 100,
    nextRequirements,
  }
}

// 세션 배열에서 user_confirmed 비율 계산
export function calcUserConfirmedRatio(sessions: { labelSource?: string | null; labels?: unknown }[]): number {
  const labeled = sessions.filter((s) => s.labels !== null && s.labels !== undefined)
  if (labeled.length === 0) return 0
  const confirmed = labeled.filter((s) => s.labelSource === 'user_confirmed')
  return confirmed.length / labeled.length
}
