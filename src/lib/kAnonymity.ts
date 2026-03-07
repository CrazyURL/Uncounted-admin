// ── k-익명성 필터 ────────────────────────────────────────────────────────────
// 프로필 준식별자(age_band, gender, region_group) 조합의 로컬 근사 k-익명성 체크
// 실제 서버 버킷 크기는 알 수 없으므로, 로컬 세션 수 기반 근사 판단

import { type UserProfile } from '../types/userProfile'

// 각 준식별자의 가능한 값 수 (응답안함 포함)
const AGE_BAND_COUNT = 7   // 10대~60대이상 + 응답안함
const GENDER_COUNT = 4     // 남/여/논바이너리/응답안함
const REGION_COUNT = 8     // 수도권~해외 + 응답안함

export type KAnonymityResult = {
  pass: boolean
  bucketSize: number        // 추정 버킷 크기
  k: number                 // 기준 k
  suggestion: string | null // 통과 실패 시 개선 안내
}

/**
 * 로컬 근사 k-익명성 체크
 *
 * totalSessionsInPlatform: 플랫폼 전체 세션 수 추정치 (로컬에서는 자신의 세션 수 * 추정 사용자 수)
 * k: 기준 값 (기본 5)
 */
export function checkKAnonymity(
  profile: UserProfile,
  totalSessionsInPlatform: number,
  k = 5,
): KAnonymityResult {
  // 준식별자가 특정 값이면 1/옵션수, '응답안함'이면 전체(1.0)
  const ageFactor = (profile.age_band === null || profile.age_band === '응답안함') ? 1.0 : 1 / AGE_BAND_COUNT
  const genderFactor = (profile.gender === null || profile.gender === '응답안함') ? 1.0 : 1 / GENDER_COUNT
  const regionFactor = (profile.region_group === null || profile.region_group === '응답안함') ? 1.0 : 1 / REGION_COUNT

  // 추정 버킷 크기 = 전체 세션 * 각 차원 비율 (균등 분포 가정)
  const bucketSize = Math.floor(totalSessionsInPlatform * ageFactor * genderFactor * regionFactor)

  const pass = bucketSize >= k

  let suggestion: string | null = null
  if (!pass) {
    const specifics: string[] = []
    if (ageFactor < 1.0) specifics.push('연령대')
    if (genderFactor < 1.0) specifics.push('성별')
    if (regionFactor < 1.0) specifics.push('지역')
    suggestion = specifics.length > 0
      ? `${specifics.join(', ')}을(를) '응답안함'으로 변경하면 버킷 크기가 증가합니다`
      : '데이터가 더 축적되면 자동으로 충족될 수 있습니다'
  }

  return { pass, bucketSize, k, suggestion }
}
