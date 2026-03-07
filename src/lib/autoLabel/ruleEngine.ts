// ── 자동 라벨링 룰 엔진 v3 ─────────────────────────────────────────────
// 모든 점수는 0~1 클램프. AUTO ≥ 0.90, RECOMMENDED ≥ 0.60, REVIEW < 0.60
// v3: 관계-도메인 상관관계 추가, TECH/MEDICAL/LEGAL/FINANCE 도메인 확장

import { type Session } from '../../types/session'
import { type AudioMetrics } from '../../types/session'
import {
  type RelationshipKey, type DomainKey,
  FAMILY_NAME_KEYWORDS, WORK_TITLE_KEYWORDS, WORK_ORG_KEYWORDS,
  CLIENT_KEYWORDS, CLIENT_CS_KEYWORDS, FRIEND_KEYWORDS,
  DOMAIN_KEYWORDS, PII_TRIGGER_KEYWORDS,
} from './dictionaries'
import { REL_KO_TO_EN, REL_KO_TO_DOMAIN_HINT } from '../labelOptions'

// ── 타입 ────────────────────────────────────────────────────────────────

export type RuleResult = {
  ruleName: string
  score: number
}

export type LabelStatus = 'AUTO' | 'RECOMMENDED' | 'REVIEW' | 'LOCKED'

export type AutoLabelResult = {
  relationship: RelationshipKey
  relConfidence: number
  relRules: RuleResult[]
  domain: DomainKey
  domConfidence: number
  domRules: RuleResult[]
  // v2: 수동 라벨링과 통합된 필드
  purpose: string | null       // 보고/협의/교육/영업/인터뷰/일상
  purposeConfidence: number
  tone: string | null          // 공식적/캐주얼/긴박/차분/열정적
  toneConfidence: number
  noise: string | null         // 없음/약함/중간/심함
  noiseConfidence: number
  labelStatus: LabelStatus
  piiOverride: boolean
}

export type GroupStats = {
  callCount: number
  avgDuration: number     // seconds
  totalDuration: number
  weekdayBusinessRatio: number  // 0~1 (평일 09-18시 비중)
  nightWeekendRatio: number     // 0~1 (야간/주말 비중)
  latestDate: string
}

// ── 상수 ────────────────────────────────────────────────────────────────

const AUTO_THRESHOLD = 0.90
const RECOMMENDED_THRESHOLD = 0.60

// ── 유틸 ────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let count = 0
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) count++
  }
  return count
}

// ── 상태 결정 ────────────────────────────────────────────────────────────

export function determineLabelStatus(confidence: number, piiLocked: boolean): LabelStatus {
  if (piiLocked) return 'LOCKED'
  if (confidence >= AUTO_THRESHOLD) return 'AUTO'
  if (confidence >= RECOMMENDED_THRESHOLD) return 'RECOMMENDED'
  return 'REVIEW'
}

// ── Relationship 스코어링 ─────────────────────────────────────────────

function scoreFAMILY(displayName: string, stats: GroupStats): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  if (containsAny(displayName, FAMILY_NAME_KEYWORDS)) {
    score += 0.50
    rules.push({ ruleName: 'family_name_keyword', score: 0.50 })
  }

  if (stats.callCount >= 5) {
    score += 0.25
    rules.push({ ruleName: 'call_freq_high', score: 0.25 })
  } else if (stats.callCount >= 3) {
    score += 0.15
    rules.push({ ruleName: 'call_freq_mid', score: 0.15 })
  }

  if (stats.nightWeekendRatio >= 0.60) {
    score += 0.15
    rules.push({ ruleName: 'night_weekend_high', score: 0.15 })
  }

  if (stats.avgDuration > 0 && stats.avgDuration <= 180) {
    score += 0.10
    rules.push({ ruleName: 'avg_duration_short', score: 0.10 })
  }

  return { score: clamp01(score), rules }
}

function scoreWORK(displayName: string, stats: GroupStats, bizConfidence: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  if (containsAny(displayName, WORK_TITLE_KEYWORDS)) {
    score += 0.45
    rules.push({ ruleName: 'work_title_keyword', score: 0.45 })
  }

  if (containsAny(displayName, WORK_ORG_KEYWORDS)) {
    score += 0.20
    rules.push({ ruleName: 'work_org_keyword', score: 0.20 })
  }

  if (stats.weekdayBusinessRatio >= 0.60) {
    score += 0.20
    rules.push({ ruleName: 'weekday_business_high', score: 0.20 })
  }

  if (stats.avgDuration >= 180 && stats.avgDuration <= 900) {
    score += 0.10
    rules.push({ ruleName: 'avg_duration_work', score: 0.10 })
  }

  if (bizConfidence >= 0.80) {
    score += 0.15
    rules.push({ ruleName: 'biz_cross_boost', score: 0.15 })
  }

  return { score: clamp01(score), rules }
}

function scoreCLIENT(displayName: string, stats: GroupStats, salesConfidence: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  if (containsAny(displayName, CLIENT_KEYWORDS)) {
    score += 0.45
    rules.push({ ruleName: 'client_keyword', score: 0.45 })
  }

  if (containsAny(displayName, CLIENT_CS_KEYWORDS)) {
    score += 0.25
    rules.push({ ruleName: 'client_cs_keyword', score: 0.25 })
  }

  if (stats.weekdayBusinessRatio >= 0.50) {
    score += 0.10
    rules.push({ ruleName: 'daytime_ratio', score: 0.10 })
  }

  if (stats.avgDuration >= 60 && stats.avgDuration <= 360) {
    score += 0.10
    rules.push({ ruleName: 'avg_duration_client', score: 0.10 })
  }

  if (salesConfidence >= 0.80) {
    score += 0.15
    rules.push({ ruleName: 'sales_cross_boost', score: 0.15 })
  }

  return { score: clamp01(score), rules }
}

function scoreFRIEND(displayName: string, stats: GroupStats): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  if (containsAny(displayName, FRIEND_KEYWORDS)) {
    score += 0.25
    rules.push({ ruleName: 'friend_keyword', score: 0.25 })
  }

  if (stats.callCount >= 3) {
    score += 0.15
    rules.push({ ruleName: 'call_freq_friend', score: 0.15 })
  }

  if (stats.nightWeekendRatio >= 0.60) {
    score += 0.20
    rules.push({ ruleName: 'night_weekend_friend', score: 0.20 })
  }

  if (stats.avgDuration >= 120 && stats.avgDuration <= 1200) {
    score += 0.10
    rules.push({ ruleName: 'avg_duration_friend', score: 0.10 })
  }

  return { score: clamp01(score), rules }
}

// ── Domain 스코어링 (v3: TECH/MEDICAL/LEGAL/FINANCE 추가 + 관계-도메인 상관) ──

function scoreBIZ(title: string, duration: number, stats: GroupStats, workConfidence: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.BIZ)
  if (hits > 0) {
    const kwScore = Math.min(0.30, hits * 0.10)
    score += kwScore
    rules.push({ ruleName: 'biz_keyword', score: kwScore })
  }

  if (stats.weekdayBusinessRatio >= 0.60) {
    score += 0.35
    rules.push({ ruleName: 'weekday_business_strong', score: 0.35 })
  } else if (stats.weekdayBusinessRatio >= 0.40) {
    score += 0.20
    rules.push({ ruleName: 'weekday_business_mid', score: 0.20 })
  }

  if (duration >= 600 && duration <= 3600) {
    score += 0.20
    rules.push({ ruleName: 'duration_biz_long', score: 0.20 })
  } else if (duration >= 180 && duration < 600) {
    score += 0.10
    rules.push({ ruleName: 'duration_biz_mid', score: 0.10 })
  }

  if (workConfidence >= 0.70) {
    score += 0.30
    rules.push({ ruleName: 'work_cross_boost', score: 0.30 })
  } else if (workConfidence >= 0.40) {
    score += 0.15
    rules.push({ ruleName: 'work_cross_mid', score: 0.15 })
  }

  return { score: clamp01(score), rules }
}

function scoreSALES(title: string, duration: number, stats: GroupStats, clientConfidence: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.SALES)
  if (hits > 0) {
    const kwScore = Math.min(0.30, hits * 0.10)
    score += kwScore
    rules.push({ ruleName: 'sales_keyword', score: kwScore })
  }

  if (stats.weekdayBusinessRatio >= 0.40) {
    score += 0.15
    rules.push({ ruleName: 'daytime_sales', score: 0.15 })
  }

  if (duration >= 120 && duration <= 600) {
    score += 0.20
    rules.push({ ruleName: 'duration_sales', score: 0.20 })
  }

  if (clientConfidence >= 0.70) {
    score += 0.30
    rules.push({ ruleName: 'client_cross_boost', score: 0.30 })
  } else if (clientConfidence >= 0.40) {
    score += 0.15
    rules.push({ ruleName: 'client_cross_mid', score: 0.15 })
  }

  return { score: clamp01(score), rules }
}

function scoreEDU(title: string, duration: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.EDU)
  if (hits > 0) {
    const kwScore = Math.min(0.35, hits * 0.12)
    score += kwScore
    rules.push({ ruleName: 'edu_keyword', score: kwScore })
  }

  if (duration >= 1800) {
    score += 0.30
    rules.push({ ruleName: 'duration_edu_long', score: 0.30 })
  } else if (duration >= 600) {
    score += 0.15
    rules.push({ ruleName: 'duration_edu_mid', score: 0.15 })
  }

  return { score: clamp01(score), rules }
}

function scoreDAILY(title: string, stats: GroupStats, familyFriendConfidence: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.DAILY)
  if (hits > 0) {
    const kwScore = Math.min(0.20, hits * 0.07)
    score += kwScore
    rules.push({ ruleName: 'daily_keyword', score: kwScore })
  }

  if (stats.nightWeekendRatio >= 0.60) {
    score += 0.35
    rules.push({ ruleName: 'night_weekend_strong', score: 0.35 })
  } else if (stats.nightWeekendRatio >= 0.40) {
    score += 0.20
    rules.push({ ruleName: 'night_weekend_mid', score: 0.20 })
  }

  if (familyFriendConfidence >= 0.70) {
    score += 0.30
    rules.push({ ruleName: 'family_friend_cross_boost', score: 0.30 })
  } else if (familyFriendConfidence >= 0.40) {
    score += 0.15
    rules.push({ ruleName: 'family_friend_cross_mid', score: 0.15 })
  }

  if (stats.avgDuration > 0 && stats.avgDuration <= 300) {
    score += 0.10
    rules.push({ ruleName: 'short_call_daily', score: 0.10 })
  }

  return { score: clamp01(score), rules }
}

function scoreTECH(title: string, duration: number, stats: GroupStats, workConfidence: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.TECH)
  if (hits > 0) {
    const kwScore = Math.min(0.35, hits * 0.12)
    score += kwScore
    rules.push({ ruleName: 'tech_keyword', score: kwScore })
  }

  if (stats.weekdayBusinessRatio >= 0.60) {
    score += 0.25
    rules.push({ ruleName: 'weekday_business_tech', score: 0.25 })
  }

  if (duration >= 600 && duration <= 3600) {
    score += 0.15
    rules.push({ ruleName: 'duration_tech_long', score: 0.15 })
  }

  if (workConfidence >= 0.70) {
    score += 0.25
    rules.push({ ruleName: 'work_cross_boost_tech', score: 0.25 })
  }

  return { score: clamp01(score), rules }
}

function scoreMEDICAL(title: string, duration: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.MEDICAL)
  if (hits > 0) {
    const kwScore = Math.min(0.35, hits * 0.12)
    score += kwScore
    rules.push({ ruleName: 'medical_keyword', score: kwScore })
  }

  // 짧은~중간 통화 (진료 상담)
  if (duration >= 60 && duration <= 600) {
    score += 0.10
    rules.push({ ruleName: 'duration_medical', score: 0.10 })
  }

  return { score: clamp01(score), rules }
}

function scoreLEGAL(title: string, duration: number): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.LEGAL)
  if (hits > 0) {
    const kwScore = Math.min(0.35, hits * 0.12)
    score += kwScore
    rules.push({ ruleName: 'legal_keyword', score: kwScore })
  }

  // 장시간 통화 (법률 상담)
  if (duration >= 600) {
    score += 0.15
    rules.push({ ruleName: 'duration_legal', score: 0.15 })
  }

  return { score: clamp01(score), rules }
}

function scoreFINANCE(title: string, duration: number, stats: GroupStats): { score: number; rules: RuleResult[] } {
  const rules: RuleResult[] = []
  let score = 0

  const hits = countKeywordHits(title, DOMAIN_KEYWORDS.FINANCE)
  if (hits > 0) {
    const kwScore = Math.min(0.35, hits * 0.12)
    score += kwScore
    rules.push({ ruleName: 'finance_keyword', score: kwScore })
  }

  if (stats.weekdayBusinessRatio >= 0.50) {
    score += 0.15
    rules.push({ ruleName: 'weekday_finance', score: 0.15 })
  }

  if (duration >= 60 && duration <= 900) {
    score += 0.10
    rules.push({ ruleName: 'duration_finance', score: 0.10 })
  }

  return { score: clamp01(score), rules }
}

// ── Purpose 추론 (관계 + 도메인 + 시간 패턴 기반) ────────────────────

function inferPurpose(
  rel: RelationshipKey,
  dom: DomainKey,
  duration: number,
  stats: GroupStats,
): { purpose: string; confidence: number } {
  if (rel === 'WORK' && dom === 'BIZ') {
    if (duration >= 1800) return { purpose: '보고', confidence: 0.80 }
    if (duration >= 600) return { purpose: '협의', confidence: 0.85 }
    return { purpose: '협의', confidence: 0.70 }
  }
  if (rel === 'WORK' && dom === 'TECH') {
    if (duration >= 1800) return { purpose: '보고', confidence: 0.75 }
    return { purpose: '협의', confidence: 0.80 }
  }
  if (rel === 'WORK' && dom === 'EDU') {
    return { purpose: '교육', confidence: 0.80 }
  }
  if (rel === 'CLIENT' || dom === 'SALES') {
    return { purpose: '영업', confidence: 0.80 }
  }
  if (dom === 'MEDICAL') {
    return { purpose: '협의', confidence: 0.70 }
  }
  if (dom === 'LEGAL') {
    return { purpose: '협의', confidence: 0.70 }
  }
  if (dom === 'FINANCE') {
    return { purpose: '협의', confidence: 0.70 }
  }
  if (dom === 'TECH') {
    return { purpose: '협의', confidence: 0.70 }
  }
  if (dom === 'EDU') {
    return { purpose: '교육', confidence: 0.75 }
  }
  if (rel === 'FAMILY' || rel === 'FRIEND') {
    return { purpose: '일상', confidence: 0.85 }
  }
  if (dom === 'DAILY') {
    return { purpose: '일상', confidence: 0.75 }
  }
  if (rel === 'WORK') {
    return { purpose: '협의', confidence: 0.65 }
  }
  if (dom === 'BIZ') {
    if (stats.weekdayBusinessRatio >= 0.60) return { purpose: '협의', confidence: 0.65 }
    return { purpose: '보고', confidence: 0.55 }
  }
  if (stats.weekdayBusinessRatio >= 0.60) return { purpose: '협의', confidence: 0.50 }
  if (stats.nightWeekendRatio >= 0.60) return { purpose: '일상', confidence: 0.50 }
  return { purpose: '일상', confidence: 0.40 }
}

// ── Tone 추론 (AudioMetrics 기반) ────────────────────────────────────

function inferTone(
  audio: AudioMetrics | null,
  rel: RelationshipKey,
  stats: GroupStats,
): { tone: string; confidence: number } {
  if (audio) {
    const { rms, silenceRatio, clippingRatio, snrDb } = audio

    if (clippingRatio > 0.05 && rms > 0.30) {
      return { tone: '긴박', confidence: 0.85 }
    }

    if (rms > 0.25 && silenceRatio < 0.30) {
      return { tone: '열정적', confidence: 0.75 }
    }

    if (rms < 0.15 && silenceRatio > 0.40) {
      return { tone: '차분', confidence: 0.75 }
    }

    if (silenceRatio > 0.45) {
      return { tone: '공식적', confidence: 0.70 }
    }

    if (snrDb > 25 && rms >= 0.10 && rms <= 0.25) {
      return { tone: '공식적', confidence: 0.65 }
    }

    if (silenceRatio < 0.25 && rms >= 0.10 && rms <= 0.25) {
      return { tone: '캐주얼', confidence: 0.70 }
    }
  }

  if (rel === 'WORK' || rel === 'CLIENT') {
    if (stats.weekdayBusinessRatio >= 0.60) return { tone: '공식적', confidence: 0.55 }
    return { tone: '공식적', confidence: 0.45 }
  }
  if (rel === 'FAMILY' || rel === 'FRIEND') {
    return { tone: '캐주얼', confidence: 0.55 }
  }
  if (stats.weekdayBusinessRatio >= 0.60) return { tone: '공식적', confidence: 0.45 }
  if (stats.nightWeekendRatio >= 0.60) return { tone: '캐주얼', confidence: 0.45 }
  return { tone: '캐주얼', confidence: 0.35 }
}

// ── Noise 추론 (AudioMetrics 기반) ───────────────────────────────────

function inferNoise(audio: AudioMetrics | null): { noise: string; confidence: number } {
  if (audio) {
    const { snrDb, qualityFactor } = audio

    if (snrDb > 0) {
      if (snrDb >= 30) return { noise: '없음', confidence: 0.90 }
      if (snrDb >= 20) return { noise: '약함', confidence: 0.85 }
      if (snrDb >= 10) return { noise: '중간', confidence: 0.80 }
      return { noise: '심함', confidence: 0.85 }
    }

    if (qualityFactor > 0) {
      if (qualityFactor >= 0.8) return { noise: '없음', confidence: 0.65 }
      if (qualityFactor >= 0.6) return { noise: '약함', confidence: 0.60 }
      if (qualityFactor >= 0.4) return { noise: '중간', confidence: 0.60 }
      return { noise: '심함', confidence: 0.65 }
    }
  }

  return { noise: '약함', confidence: 0.30 }
}

// ── PII 트리거 키워드 체크 ────────────────────────────────────────────

export function hasPiiTrigger(text: string): boolean {
  return containsAny(text, PII_TRIGGER_KEYWORDS)
}

// ── 메인 스코어링 함수 ────────────────────────────────────────────────

export function scoreRelationship(
  displayName: string,
  stats: GroupStats,
  existingRel: string | null,
  domainScores: Record<DomainKey, number>,
): { key: RelationshipKey; confidence: number; rules: RuleResult[] } {
  const candidates: Array<{ key: RelationshipKey; score: number; rules: RuleResult[] }> = []

  const family = scoreFAMILY(displayName, stats)
  candidates.push({ key: 'FAMILY', ...family })

  const work = scoreWORK(displayName, stats, domainScores.BIZ)
  candidates.push({ key: 'WORK', ...work })

  const client = scoreCLIENT(displayName, stats, domainScores.SALES)
  candidates.push({ key: 'CLIENT', ...client })

  const friend = scoreFRIEND(displayName, stats)
  candidates.push({ key: 'FRIEND', ...friend })

  // 사용자 설정 관계 보너스 (+0.15) — 한국어 라벨도 매칭
  if (existingRel) {
    const relEnKey = REL_KO_TO_EN[existingRel] ?? existingRel.toUpperCase()
    const match = candidates.find((c) => c.key === relEnKey)
    if (match) {
      match.score = clamp01(match.score + 0.15)
      match.rules.push({ ruleName: 'user_set_bonus', score: 0.15 })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]

  if (best.score < RECOMMENDED_THRESHOLD) {
    return { key: 'UNKNOWN', confidence: best.score, rules: best.rules }
  }

  return { key: best.key, confidence: best.score, rules: best.rules }
}

export function scoreDomain(
  sessionTitle: string,
  duration: number,
  stats: GroupStats,
  relScores: Record<RelationshipKey, number>,
  domainHint: DomainKey | null,
): { key: DomainKey; confidence: number; rules: RuleResult[] } {
  const candidates: Array<{ key: DomainKey; score: number; rules: RuleResult[] }> = []

  const biz = scoreBIZ(sessionTitle, duration, stats, relScores.WORK ?? 0)
  candidates.push({ key: 'BIZ', ...biz })

  const sales = scoreSALES(sessionTitle, duration, stats, relScores.CLIENT ?? 0)
  candidates.push({ key: 'SALES', ...sales })

  const edu = scoreEDU(sessionTitle, duration)
  candidates.push({ key: 'EDU', ...edu })

  const familyFriendMax = Math.max(relScores.FAMILY ?? 0, relScores.FRIEND ?? 0)
  const daily = scoreDAILY(sessionTitle, stats, familyFriendMax)
  candidates.push({ key: 'DAILY', ...daily })

  const tech = scoreTECH(sessionTitle, duration, stats, relScores.WORK ?? 0)
  candidates.push({ key: 'TECH', ...tech })

  const medical = scoreMEDICAL(sessionTitle, duration)
  candidates.push({ key: 'MEDICAL', ...medical })

  const legal = scoreLEGAL(sessionTitle, duration)
  candidates.push({ key: 'LEGAL', ...legal })

  const finance = scoreFINANCE(sessionTitle, duration, stats)
  candidates.push({ key: 'FINANCE', ...finance })

  // 사용자 설정 관계에서 도메인 힌트 (+0.50)
  // 예: 가족→일상, 병원→의료, 금융→금융
  if (domainHint) {
    const hintMatch = candidates.find((c) => c.key === domainHint)
    if (hintMatch) {
      hintMatch.score = clamp01(hintMatch.score + 0.50)
      hintMatch.rules.push({ ruleName: 'rel_domain_hint', score: 0.50 })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]

  if (best.score < RECOMMENDED_THRESHOLD) {
    return { key: 'ETC', confidence: best.score, rules: best.rules }
  }

  return { key: best.key, confidence: best.score, rules: best.rules }
}

// ── 세션 단위 통합 스코어링 ───────────────────────────────────────────

export function scoreSession(
  session: Session,
  displayName: string,
  stats: GroupStats,
  existingRel: string | null,
  transcript?: string | null,
): AutoLabelResult {
  const piiLocked = session.piiStatus === 'LOCKED'

  // 트랜스크립트가 있으면 제목+내용으로 키워드 매칭 → 도메인 정확도 대폭 향상
  const matchText = transcript ? session.title + ' ' + transcript : session.title

  // 1차: 도메인 예비 스코어 (관계 상호보강 없이)
  const prelimDomScores: Record<DomainKey, number> = {
    BIZ: 0, SALES: 0, DAILY: 0, EDU: 0,
    TECH: 0, MEDICAL: 0, LEGAL: 0, FINANCE: 0, ETC: 0,
  }
  const bizPrelim = scoreBIZ(matchText, session.duration, stats, 0)
  const salesPrelim = scoreSALES(matchText, session.duration, stats, 0)
  prelimDomScores.BIZ = bizPrelim.score
  prelimDomScores.SALES = salesPrelim.score

  // 2차: 관계 스코어 (도메인 상호보강 포함)
  const rel = scoreRelationship(displayName, stats, existingRel, prelimDomScores)

  // 3차: 도메인 힌트 (사용자 설정 관계 → 도메인 상관관계)
  const domainHint = existingRel
    ? (REL_KO_TO_DOMAIN_HINT[existingRel] as DomainKey | undefined) ?? null
    : null

  // 4차: 도메인 최종 스코어 (관계 상호보강 + 도메인 힌트)
  const relScores: Record<RelationshipKey, number> = { FAMILY: 0, WORK: 0, CLIENT: 0, FRIEND: 0, UNKNOWN: 0 }
  relScores[rel.key] = rel.confidence
  const dom = scoreDomain(matchText, session.duration, stats, relScores, domainHint)

  // 5차: purpose 추론
  const { purpose, confidence: purposeConf } = inferPurpose(rel.key, dom.key, session.duration, stats)

  // 6차: tone 추론 (AudioMetrics 활용)
  const { tone, confidence: toneConf } = inferTone(session.audioMetrics, rel.key, stats)

  // 7차: noise 추론 (AudioMetrics 활용)
  const { noise, confidence: noiseConf } = inferNoise(session.audioMetrics)

  // 전체 신뢰도 = 관계와 도메인의 평균
  const overallConfidence = (rel.confidence + dom.confidence) / 2
  const labelStatus = determineLabelStatus(overallConfidence, piiLocked)

  return {
    relationship: rel.key,
    relConfidence: rel.confidence,
    relRules: rel.rules,
    domain: dom.key,
    domConfidence: dom.confidence,
    domRules: dom.rules,
    purpose,
    purposeConfidence: purposeConf,
    tone,
    toneConfidence: toneConf,
    noise,
    noiseConfidence: noiseConf,
    labelStatus,
    piiOverride: piiLocked,
  }
}
