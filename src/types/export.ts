// ── Export Request Types (Phase 1 SKU Export) ────────────────────────────

export interface ExportRequest {
  id: string
  skuId: string
  clientId: string | null
  status: 'draft' | 'queued' | 'processing' | 'reviewing' | 'packaging' | 'ready' | 'delivered' | 'expired' | 'failed'
  requestedQuantity: number
  quantityUnit: 'hours' | 'events' | 'devices'
  filters: ExportFilters
  samplingStrategy: string
  qualityMix?: Record<string, number>
  diversityConstraints?: DiversityConstraints
  consentLevel: 'both_agreed' | 'user_only' | 'any'
  clientName?: string
  notes?: string
  // Results
  actualQuantity?: number
  sessionCount?: number
  utteranceCount?: number
  fileCount?: number
  packageSizeBytes?: number
  packageStoragePath?: string
  downloadUrl?: string
  downloadExpiresAt?: string
  qualitySummary?: QualitySummary
  demographicActual?: Record<string, Record<string, number>>
  // Timestamps
  createdAt: string
  queuedAt?: string
  processingAt?: string
  completedAt?: string
  deliveredAt?: string
}

export interface ExportFilters {
  minQualityGrade?: string | null
  qualityTier?: string | null
  requireConsent?: boolean
  requireTranscript?: boolean
  dateRange?: { from: string; to: string } | null
}

export interface DiversityConstraints {
  minUniqueSpeakers: number
  maxPerSpeakerRatio: number
  demographicTargets?: Record<string, Record<string, number>>
}

export interface QualitySummary {
  avgSnr: number
  avgSpeechRatio: number
  gradeDistribution: Record<string, number>
  speakerCount: number
}

export interface ExportUtterance {
  utteranceId: string
  sessionId: string
  pseudoId: string
  durationSec: number
  startSec: number
  endSec: number
  snrDb: number
  speechRatio: number
  qualityGrade: string
  qualityScore: number
  beepMaskRatio: number
  speakerAgeBand?: string
  speakerGender?: string
  speakerRegion?: string
  consentStatus: string
  isIncluded: boolean
  excludeReason?: string
  audioUrl?: string  // signed URL for playback
  // chunk mapping fields (utterances 테이블 연동)
  chunkIndex?: number
  sequenceInChunk?: number
  speakerId?: string
  isUser?: boolean
  volumeLufs?: number
  // labeling fields
  labels?: UtteranceLabels
  // PII fields
  piiIntervals?: Array<{ startSec: number; endSec: number; piiType: string; maskType: string }>
  piiReviewedAt?: string
  piiReviewedBy?: string
  // 마스킹 적용 감사 메타 (apply-mask 완료 후 채워짐)
  piiMasked?: boolean
  piiMaskedAt?: string
  piiMaskedBy?: string
  piiMaskedByEmail?: string
  piiMaskVersion?: number
}

export interface UtteranceLabels {
  relationship?: string
  purpose?: string
  domain?: string
  tone?: string
  noise?: string
  dialogAct?: string
  dialogIntensity?: number
  labelSource?: string
}

export interface SkuInventory {
  skuId: string
  availableBUs: number
  availableHours: number
  speakerCount: number
  labelCoverage: number  // 0-1
  qualityDistribution: Record<string, number>
}

export interface ExportPreview {
  canFulfill: boolean
  availableMinutes: number
  requestedMinutes: number
  shortfallMinutes?: number
  qualityDistribution: Record<string, number>
  speakerCount: number
  estimatedPackageSizeMb: number
}
