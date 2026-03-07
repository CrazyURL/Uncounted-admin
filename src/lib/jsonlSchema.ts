// ── JSONL 납품 스키마 ────────────────────────────────────────────────────────
// 외부 납품용 JSONL 1행 구조 정의 + 세션 → DeliveryRow 변환

import { type Session } from '../types/session'
import { type SkuId, type SkuTier } from '../types/sku'
import { type UserProfile } from '../types/userProfile'
import { type ContributorLevel } from './contributorLevel'
import { calcQualityGrade } from './valueEngine'

export type DeliveryRow = {
  pseudo_id: string
  session_id: string
  sku_id: string
  sku_tier: SkuTier
  audio_url: string
  duration_sec: number
  effective_speech_sec: number
  quality_grade: 'A' | 'B' | 'C'
  quality_score: number
  // 프로필 (버킷형, PII 없음)
  speaker_age_band: string
  speaker_gender: string
  speaker_region: string
  speaker_accent: string
  speaker_language: string
  // 라벨
  label_relationship: string | null
  label_domain: string | null
  label_purpose: string | null
  label_tone: string | null
  label_noise: string | null
  label_source: string
  label_confidence: number
  // A03 (해당 SKU만)
  primary_speech_act?: string | null
  speech_act_events?: string[]
  interaction_mode?: string | null
  // 메타
  profile_confidence: string
  contributor_level: string
  consent_version: string | null
  exported_at: string
}

/** 세션 배열 → 납품용 JSONL 문자열 생성 */
export function exportSessionsToJsonl(
  sessions: Session[],
  skuId: SkuId,
  skuTier: SkuTier,
  profile: UserProfile,
  contributorLevel: ContributorLevel,
): string {
  const now = new Date().toISOString()
  const isA03 = skuId === 'U-A03'

  const rows = sessions.map((s): DeliveryRow => {
    const qaScore = s.audioMetrics?.qualityFactor
      ? Math.round(s.audioMetrics.qualityFactor * 100)
      : (s.qaScore ?? 50)
    const effectiveSpeech = s.audioMetrics
      ? s.duration * (1 - s.audioMetrics.silenceRatio)
      : s.duration * 0.7

    const row: DeliveryRow = {
      pseudo_id: profile.pid,
      session_id: s.id,
      sku_id: skuId,
      sku_tier: skuTier,
      audio_url: s.audioUrl ?? '',
      duration_sec: s.duration,
      effective_speech_sec: Math.round(effectiveSpeech),
      quality_grade: calcQualityGrade(qaScore),
      quality_score: qaScore,
      // 프로필 (응답안함 → 'unknown')
      speaker_age_band: profile.age_band ?? 'unknown',
      speaker_gender: profile.gender ?? 'unknown',
      speaker_region: profile.region_group ?? 'unknown',
      speaker_accent: profile.accent_group ?? 'unknown',
      speaker_language: profile.primary_language ?? 'unknown',
      // 라벨
      label_relationship: s.labels?.relationship ?? null,
      label_domain: s.labels?.domain ?? null,
      label_purpose: s.labels?.purpose ?? null,
      label_tone: s.labels?.tone ?? null,
      label_noise: s.labels?.noise ?? null,
      label_source: s.labelSource ?? 'auto',
      label_confidence: s.labelConfidence ?? 0,
      // 메타
      profile_confidence: profile.profile_confidence,
      contributor_level: contributorLevel,
      consent_version: s.visibilityConsentVersion ?? null,
      exported_at: now,
    }

    // A03 전용 필드
    if (isA03) {
      row.primary_speech_act = s.labels?.primarySpeechAct ?? null
      row.speech_act_events = s.labels?.speechActEvents ?? []
      row.interaction_mode = s.labels?.interactionMode ?? null
    }

    return row
  })

  return rows.map((r) => JSON.stringify(r)).join('\n')
}
