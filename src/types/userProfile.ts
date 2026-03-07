export type AgeBand = '10대' | '20대' | '30대' | '40대' | '50대' | '60대이상' | '응답안함'
export type Gender = '남성' | '여성' | '논바이너리' | '응답안함'
export type RegionGroup = '수도권' | '영남' | '호남' | '충청' | '강원' | '제주' | '해외' | '응답안함'
export type AccentGroup = '표준' | '경상도' | '전라도' | '충청도' | '강원도' | '제주도' | '혼합' | '모르겠음'
export type SpeechStyle = '주로 존댓말' | '주로 반말' | '혼합' | '응답안함'
export type PrimaryLanguage = '한국어(ko-KR)' | '영어(en-US)' | '중국어(zh-CN)' | '일본어(ja-JP)' | '기타' | '응답안함'
export type CommonEnv = '조용한 실내' | '보통' | '시끄러운 환경' | '응답안함'
export type CommonDeviceMode = '수화기' | '핸즈프리' | '블루투스' | '혼합' | '응답안함'
export type DomainMixItem = '일상대화' | '업무' | '육아' | '쇼핑' | '금융' | '의료' | '교육' | '여행' | '게임'

export type ProfileConfidence = 'self_declared' | 'consistency_verified' | 'behavior_verified'

export type UserProfile = {
  pid: string
  age_band: AgeBand | null
  gender: Gender | null
  region_group: RegionGroup | null
  accent_group: AccentGroup | null
  speech_style: SpeechStyle | null
  primary_language: PrimaryLanguage | null
  common_env: CommonEnv | null
  common_device_mode: CommonDeviceMode | null
  domain_mix: DomainMixItem[]
  // 온보딩 게이트
  profile_required_completed_at: string | null
  profile_confidence: ProfileConfidence
  // 90일 일관성 체크용 스냅샷
  profile_snapshot_at: string | null
  profile_snapshot: Record<string, string | null> | null
}

import { generateUUID } from '../lib/uuid'

export const TOTAL_PROFILE_FIELDS = 9

const STORAGE_KEY = 'uncounted_user_profile'

function generatePid(): string {
  return generateUUID()
}

export function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserProfile
  } catch {
    return null
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

export function getOrCreateProfile(): UserProfile {
  const existing = loadProfile()
  if (existing) {
    // 기존 프로필에 새 필드가 없으면 기본값 보충
    if (!('profile_required_completed_at' in existing)) {
      (existing as UserProfile).profile_required_completed_at = null
    }
    if (!('profile_confidence' in existing)) {
      (existing as UserProfile).profile_confidence = 'self_declared'
    }
    if (!('profile_snapshot_at' in existing)) {
      (existing as UserProfile).profile_snapshot_at = null
    }
    if (!('profile_snapshot' in existing)) {
      (existing as UserProfile).profile_snapshot = null
    }
    return existing
  }
  return {
    pid: generatePid(),
    age_band: null,
    gender: null,
    region_group: null,
    accent_group: null,
    speech_style: null,
    primary_language: null,
    common_env: null,
    common_device_mode: null,
    domain_mix: [],
    profile_required_completed_at: null,
    profile_confidence: 'self_declared',
    profile_snapshot_at: null,
    profile_snapshot: null,
  }
}

// 폼 완성도용: null이 아닌 모든 필드 수 (응답안함 포함)
export function calcAnsweredCount(profile: UserProfile): number {
  let count = 0
  if (profile.age_band !== null) count++
  if (profile.gender !== null) count++
  if (profile.region_group !== null) count++
  if (profile.accent_group !== null) count++
  if (profile.speech_style !== null) count++
  if (profile.primary_language !== null) count++
  if (profile.common_env !== null) count++
  if (profile.common_device_mode !== null) count++
  if (profile.domain_mix.length > 0) count++
  return count
}

// 가치 업리프트용: 실질 답변 수 (응답안함/모르겠음 제외)
export function calcValueBoostCount(profile: UserProfile): number {
  const ABSTAIN = ['응답안함', '모르겠음']
  let count = 0
  if (profile.age_band && !ABSTAIN.includes(profile.age_band)) count++
  if (profile.gender && !ABSTAIN.includes(profile.gender)) count++
  if (profile.region_group && !ABSTAIN.includes(profile.region_group)) count++
  if (profile.accent_group && !ABSTAIN.includes(profile.accent_group)) count++
  if (profile.speech_style && !ABSTAIN.includes(profile.speech_style)) count++
  if (profile.primary_language && !ABSTAIN.includes(profile.primary_language)) count++
  if (profile.common_env && !ABSTAIN.includes(profile.common_env)) count++
  if (profile.common_device_mode && !ABSTAIN.includes(profile.common_device_mode)) count++
  if (profile.domain_mix.length > 0) count++
  return count
}

// 온보딩 게이트 완료 여부
export function isProfileGateCompleted(profile: UserProfile): boolean {
  return profile.profile_required_completed_at !== null
}

// profile_confidence → 수치 변환
export function getConsistencyScore(profile: UserProfile): number {
  switch (profile.profile_confidence) {
    case 'behavior_verified': return 1.0
    case 'consistency_verified': return 0.85
    case 'self_declared': return 0.5
    default: return 0
  }
}

// 90일 일관성 체크 → consistency_verified 승격
export function checkAndUpgradeConsistency(profile: UserProfile): UserProfile {
  // 이미 consistency_verified 이상이면 스킵
  if (profile.profile_confidence !== 'self_declared') return profile
  // 게이트 미완료 시 스킵
  if (!profile.profile_required_completed_at) return profile

  const now = Date.now()

  // 스냅샷이 없으면 현재 값으로 생성
  if (!profile.profile_snapshot_at || !profile.profile_snapshot) {
    const snapshot: Record<string, string | null> = {
      age_band: profile.age_band,
      gender: profile.gender,
      region_group: profile.region_group,
      accent_group: profile.accent_group,
      speech_style: profile.speech_style,
      primary_language: profile.primary_language,
      common_env: profile.common_env,
      common_device_mode: profile.common_device_mode,
      domain_mix: profile.domain_mix.join(',') || null,
    }
    return {
      ...profile,
      profile_snapshot_at: new Date().toISOString(),
      profile_snapshot: snapshot,
    }
  }

  // 90일 미경과 → 스킵
  const snapshotTime = new Date(profile.profile_snapshot_at).getTime()
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
  if (now - snapshotTime < NINETY_DAYS_MS) return profile

  // 90일 경과 → 현재 값과 스냅샷 비교
  const snap = profile.profile_snapshot
  const currentDomainMix = profile.domain_mix.join(',') || null
  const consistent =
    snap.age_band === profile.age_band &&
    snap.gender === profile.gender &&
    snap.region_group === profile.region_group &&
    snap.accent_group === profile.accent_group &&
    snap.speech_style === profile.speech_style &&
    snap.primary_language === profile.primary_language &&
    snap.common_env === profile.common_env &&
    snap.common_device_mode === profile.common_device_mode &&
    snap.domain_mix === currentDomainMix

  if (consistent) {
    return {
      ...profile,
      profile_confidence: 'consistency_verified',
    }
  }

  // 변경 감지 → 스냅샷 리셋 (90일 카운트 재시작)
  const freshSnapshot: Record<string, string | null> = {
    age_band: profile.age_band,
    gender: profile.gender,
    region_group: profile.region_group,
    accent_group: profile.accent_group,
    speech_style: profile.speech_style,
    primary_language: profile.primary_language,
    common_env: profile.common_env,
    common_device_mode: profile.common_device_mode,
    domain_mix: currentDomainMix,
  }
  return {
    ...profile,
    profile_snapshot_at: new Date().toISOString(),
    profile_snapshot: freshSnapshot,
  }
}
