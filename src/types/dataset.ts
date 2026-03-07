import { type UploadStatus } from './session'
import { type SkuId } from './sku'

export type DatasetStatus = 'draft' | 'finalized' | 'exported'
export type QualityGrade = 'A' | 'B' | 'C'

// ── Label field visibility ─────────────────────────────────────────────────────

export type LabelFieldKey = 'relationship' | 'purpose' | 'domain' | 'tone' | 'noise'

export type LabelFieldCoverage = {
  field: LabelFieldKey
  labelKo: string
  filledCount: number
  totalCount: number
  fillRate: number              // 0~1
  topValues: { value: string; count: number }[]
}

export type LabelCoverageReport = {
  totalSessions: number
  anyLabelCount: number         // sessions with at least 1 field filled
  fullLabelCount: number        // sessions with all 5 fields filled
  fields: LabelFieldCoverage[]
}

// ── Export field selection ──────────────────────────────────────────────────────

export type ExportFieldGroup = 'core' | 'quality' | 'labels' | 'consent' | 'privacy' | 'audio' | 'speaker' | 'sku' | 'metadata'

export type ExportFieldDef = {
  key: string              // e.g. 'labels.relationship'
  labelKo: string
  group: ExportFieldGroup
  defaultOn: boolean
}

export type ExportFieldSelection = {
  mode: 'all' | 'preset' | 'custom'
  presetSkuId?: SkuId
  selectedKeys: string[]
}

export type DatasetFilterCriteria = {
  domains: string[]                  // DOMAIN_OPTIONS 기준 (was assetTypes)
  qualityGrades: QualityGrade[]
  labelStatus: 'all' | 'labeled' | 'unlabeled'
  publicStatus: 'all' | 'public' | 'private'
  piiCleanedOnly: boolean
  dateRange: { from: string; to: string } | null
  uploadStatuses: UploadStatus[]     // LOCAL/UPLOADED/FAILED
}

export type Dataset = {
  id: string
  name: string
  description: string
  sessionIds: string[]
  status: DatasetStatus
  filters: DatasetFilterCriteria
  createdAt: string
  updatedAt: string
  exportedAt: string | null
}

export type DatasetSummary = {
  sessionCount: number
  totalDurationHours: number
  avgQaScore: number
  labeledCount: number
  labeledRatio: number
  domainDistribution: Record<string, number>   // was typeDistribution
  qualityDistribution: Record<QualityGrade, number>
}
