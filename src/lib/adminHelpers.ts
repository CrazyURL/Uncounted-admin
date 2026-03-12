import { type Session, type LabelCategory } from '../types/session'
import { type Dataset, type DatasetFilterCriteria, type DatasetSummary, type QualityGrade, type LabelFieldKey, type LabelFieldCoverage, type LabelCoverageReport, type ExportFieldSelection } from '../types/dataset'
import { type SkuId, SKU_CATALOG } from '../types/sku'
import { RELATIONSHIP_OPTIONS, DOMAIN_OPTIONS, PURPOSE_OPTIONS, TONE_OPTIONS, NOISE_OPTIONS } from './labelOptions'
import { type UserProfile, loadProfile } from '../types/userProfile'
import { getPid } from './auth'
import { formatDuration } from './earnings'
import { maskSessionTitle, maskFilePath } from './displayMask'
import { sanitizeAndUpload, type AudioSource } from './audioSanitizer'
import { resolveExportFields } from './exportFields'
import { calcQualityGrade } from './valueEngine'

// ── 품질 등급 (통합: valueEngine.calcQualityGrade 사용) ──
export const qualityGradeFromScore = calcQualityGrade

// ── 라벨 필드 분석 ──

export const LABEL_FIELDS: { key: LabelFieldKey; labelKo: string; options: readonly string[] }[] = [
  { key: 'relationship', labelKo: '관계', options: RELATIONSHIP_OPTIONS },
  { key: 'purpose',      labelKo: '목적', options: PURPOSE_OPTIONS },
  { key: 'domain',       labelKo: '도메인', options: DOMAIN_OPTIONS },
  { key: 'tone',         labelKo: '톤',   options: TONE_OPTIONS },
  { key: 'noise',        labelKo: '소음', options: NOISE_OPTIONS },
]

/** 세션의 라벨 5필드 중 채워진 수 (0~5) */
export function countFilledLabelFields(labels: LabelCategory | null): number {
  if (!labels) return 0
  return LABEL_FIELDS.filter(f => labels[f.key] != null).length
}

/** 세션의 라벨 필드별 채움 여부 */
export function getLabelFieldStatus(labels: LabelCategory | null): Record<LabelFieldKey, boolean> {
  const result = {} as Record<LabelFieldKey, boolean>
  for (const f of LABEL_FIELDS) {
    result[f.key] = labels != null && labels[f.key] != null
  }
  return result
}

/** 세션 배열의 라벨 필드별 커버리지 보고서 */
export function calcLabelCoverage(sessions: Session[]): LabelCoverageReport {
  const total = sessions.length
  let anyLabelCount = 0
  let fullLabelCount = 0

  const filledCounts: Record<LabelFieldKey, number> = {
    relationship: 0, purpose: 0, domain: 0, tone: 0, noise: 0,
  }
  const fieldCounters: Record<LabelFieldKey, Map<string, number>> = {
    relationship: new Map(), purpose: new Map(), domain: new Map(),
    tone: new Map(), noise: new Map(),
  }

  for (const s of sessions) {
    const filled = countFilledLabelFields(s.labels)
    if (filled > 0) anyLabelCount++
    if (filled === 5) fullLabelCount++

    for (const f of LABEL_FIELDS) {
      const val = s.labels?.[f.key]
      if (val != null) {
        filledCounts[f.key]++
        fieldCounters[f.key].set(val, (fieldCounters[f.key].get(val) ?? 0) + 1)
      }
    }
  }

  const fields: LabelFieldCoverage[] = LABEL_FIELDS.map(f => ({
    field: f.key,
    labelKo: f.labelKo,
    filledCount: filledCounts[f.key],
    totalCount: total,
    fillRate: total > 0 ? filledCounts[f.key] / total : 0,
    topValues: [...fieldCounters[f.key].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count })),
  }))

  return { totalSessions: total, anyLabelCount, fullLabelCount, fields }
}

/** 특정 라벨 필드의 전체 값 분포 (카탈로그 페이지용) */
export function calcFieldValueDistribution(
  sessions: Session[],
  field: LabelFieldKey,
): { value: string; count: number; pct: number }[] {
  const counter = new Map<string, number>()
  for (const s of sessions) {
    const val = s.labels?.[field]
    if (val != null) counter.set(val, (counter.get(val) ?? 0) + 1)
  }
  const total = sessions.length
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count, pct: total > 0 ? count / total : 0 }))
}

// ── 세션 필터링 ──

/** 세션이 공개 상태인지 판정 (여러 필드 종합) */
export function isSessionPublic(s: Session): boolean {
  return s.visibilityStatus === 'PUBLIC_CONSENTED' ||
    s.isPublic === true ||
    s.shareScope === 'PUBLIC'
}

export function applyAdminFilters(
  sessions: Session[],
  filters: Partial<DatasetFilterCriteria>,
  transcriptIds?: Set<string>,
): Session[] {
  let result = sessions

  if (filters.publicStatus && filters.publicStatus !== 'all') {
    if (filters.publicStatus === 'public') {
      result = result.filter(isSessionPublic)
    } else {
      result = result.filter(s => !isSessionPublic(s))
    }
  }

  if (filters.domains && filters.domains.length > 0) {
    result = result.filter(s => {
      const domain = s.labels?.domain ?? null
      return domain !== null && filters.domains!.includes(domain)
    })
  }

  if (filters.uploadStatuses && filters.uploadStatuses.length > 0) {
    result = result.filter(s => filters.uploadStatuses!.includes(s.uploadStatus ?? 'LOCAL'))
  }

  if (filters.qualityGrades && filters.qualityGrades.length > 0) {
    result = result.filter(s => filters.qualityGrades!.includes(qualityGradeFromScore(s.qaScore ?? 0)))
  }

  if (filters.labelStatus && filters.labelStatus !== 'all') {
    if (filters.labelStatus === 'labeled') {
      result = result.filter(s => s.labels !== null)
    } else {
      result = result.filter(s => s.labels === null)
    }
  }

  if (filters.piiCleanedOnly) {
    result = result.filter(s => s.isPiiCleaned)
  }

  if (filters.hasAudioUrl) {
    result = result.filter(s => !!s.audioUrl)
  }

  if (filters.diarizationStatus && filters.diarizationStatus !== 'all') {
    if (filters.diarizationStatus === 'done') {
      result = result.filter(s => !!s.hasDiarization)
    } else {
      result = result.filter(s => !s.hasDiarization)
    }
  }

  if (filters.transcriptStatus && filters.transcriptStatus !== 'all' && transcriptIds) {
    if (filters.transcriptStatus === 'done') {
      result = result.filter(s => transcriptIds.has(s.id))
    } else {
      result = result.filter(s => !transcriptIds.has(s.id))
    }
  }

  if (filters.dateRange) {
    const { from, to } = filters.dateRange
    result = result.filter(s => s.date >= from && s.date <= to)
  }

  return result
}

// ── 정렬 ──

export type AdminSortKey = 'date' | 'qaScore' | 'duration'

export function sortAdminSessions(
  sessions: Session[],
  key: AdminSortKey,
  direction: 'asc' | 'desc',
): Session[] {
  const sorted = [...sessions].sort((a, b) => {
    const va = a[key] ?? 0
    const vb = b[key] ?? 0
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb)
    return (va as number) - (vb as number)
  })
  return direction === 'desc' ? sorted.reverse() : sorted
}

// ── 요약 통계 ──

export function calcDatasetSummary(sessions: Session[]): DatasetSummary {
  const sessionCount = sessions.length
  const totalDurationHours = sessions.reduce((sum, s) => sum + s.duration, 0) / 3600
  const avgQaScore = sessionCount > 0
    ? Math.round(sessions.reduce((sum, s) => sum + (s.qaScore ?? 0), 0) / sessionCount)
    : 0
  const labeledCount = sessions.filter(s => s.labels !== null).length
  const labeledRatio = sessionCount > 0 ? labeledCount / sessionCount : 0

  const domainDistribution: Record<string, number> = {}
  const qualityDistribution: Record<QualityGrade, number> = { A: 0, B: 0, C: 0 }

  for (const s of sessions) {
    const domain = s.labels?.domain ?? '미지정'
    domainDistribution[domain] = (domainDistribution[domain] ?? 0) + 1
    qualityDistribution[qualityGradeFromScore(s.qaScore ?? 0)]++
  }

  return {
    sessionCount,
    totalDurationHours,
    avgQaScore,
    labeledCount,
    labeledRatio,
    domainDistribution,
    qualityDistribution,
  }
}

// ── SKU 적합성 판정 ──

export type SkuBreakdown = {
  skuId: SkuId
  nameKo: string
  category: 'voice' | 'metadata'
  sessions: string[]   // session IDs
  count: number
  totalHours: number
}

/** 세션별 해당 SKU 판정 (MVP 음성 SKU 중심) */
function sessionEligibleSkus(s: Session): SkuId[] {
  const skus: SkuId[] = []

  // U-A01: 음성 원천 — 오디오 참조 존재 + 동의 시
  const hasAudio = !!(s.callRecordId || s.audioUrl || s.localSanitizedWavPath)
  if (hasAudio) {
    skus.push('U-A01')

    // U-A02: 음성 + 상황 라벨 — labels 존재
    if (s.labels) skus.push('U-A02')

    // U-A03: 음성 + 대화행위 라벨 — labels.tone 존재 (dialog_act 대용)
    if (s.labels?.tone) skus.push('U-A03')
  }

  // U-M01: 통화 메타데이터 — 통화 녹음 세션이면 해당
  if (s.callRecordId) skus.push('U-M01')

  return skus
}

/** 데이터셋의 SKU별 분류 */
export function calcSkuBreakdown(sessions: Session[]): SkuBreakdown[] {
  const map = new Map<SkuId, { ids: string[]; hours: number }>()

  for (const s of sessions) {
    const skus = sessionEligibleSkus(s)
    for (const sku of skus) {
      const entry = map.get(sku) ?? { ids: [], hours: 0 }
      entry.ids.push(s.id)
      entry.hours += s.duration / 3600
      map.set(sku, entry)
    }
  }

  return Array.from(map.entries()).map(([skuId, data]) => {
    const def = SKU_CATALOG.find(c => c.id === skuId)
    return {
      skuId,
      nameKo: def?.nameKo ?? skuId,
      category: def?.category ?? 'voice',
      sessions: data.ids,
      count: data.ids.length,
      totalHours: data.hours,
    }
  })
}

// ── 오디오 파일 참조 조회 ──

function getAudioRef(s: Session): { filePath: string | null; audioUrl: string | null; sanitizedPath: string | null } {
  // localStorage 파일 경로 매핑
  let filePath: string | null = s.callRecordId ?? null
  try {
    const fp: Record<string, string> = JSON.parse(
      localStorage.getItem('uncounted_file_paths') ?? '{}',
    )
    if (fp[s.id]) filePath = fp[s.id]
  } catch { /* ignore */ }

  return {
    filePath,
    audioUrl: s.audioUrl ?? null,
    sanitizedPath: s.localSanitizedWavPath ?? null,
  }
}

// ── 이름 자동 생성 ──

export function suggestDatasetName(
  filters: DatasetFilterCriteria,
  count: number,
): string {
  const parts: string[] = []
  if (filters.domains.length === 1) parts.push(filters.domains[0])
  if (filters.qualityGrades.length === 1) parts.push(`${filters.qualityGrades[0]}등급`)
  const now = new Date()
  parts.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  parts.push(`${count}건`)
  return parts.join('_')
}

// ── 기여자 프로필 수집 ──

function collectContributorInfo(sessions: Session[]) {
  const pid = getPid()
  const profile = loadProfile()

  // 세션에서 고유 userId 수집
  const userIds = new Set<string>()
  for (const s of sessions) {
    if (s.userId) userIds.add(s.userId)
  }

  return { pid, profile, uniqueUserIds: [...userIds] }
}

function profileToExport(profile: UserProfile | null) {
  if (!profile) return null
  return {
    pid: profile.pid,
    ageBand: profile.age_band,
    gender: profile.gender,
    regionGroup: profile.region_group,
    accentGroup: profile.accent_group,
    speechStyle: profile.speech_style,
    primaryLanguage: profile.primary_language,
    commonEnv: profile.common_env,
    commonDeviceMode: profile.common_device_mode,
    domainMix: profile.domain_mix,
  }
}

// ── 내보내기: JSON 매니페스트 (판매용 전체 패키지) ──

export function exportAsJson(dataset: Dataset, sessions: Session[], fieldSelection?: ExportFieldSelection): string {
  const fields = fieldSelection ? resolveExportFields(fieldSelection) : null
  const has = (key: string) => !fields || fields.has(key)

  const summary = calcDatasetSummary(sessions)
  const skuBreakdown = calcSkuBreakdown(sessions)
  const publicCount = sessions.filter(isSessionPublic).length
  const contributor = collectContributorInfo(sessions)

  const payload = {
    _format: 'uncounted-dataset-v3',
    _exportedAt: new Date().toISOString(),
    ...(fieldSelection ? { _fieldSelection: { mode: fieldSelection.mode, presetSkuId: fieldSelection.presetSkuId } } : {}),

    dataset: {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      status: dataset.status,
      createdAt: dataset.createdAt,
    },

    // 기여자 정보 (화자 프로필 — 비PII)
    contributors: [
      {
        pid: contributor.pid,
        userIds: contributor.uniqueUserIds,
        ...(has('speaker.ageBand') || has('speaker.gender') || has('speaker.region')
          ? { profile: profileToExport(contributor.profile) }
          : {}),
      },
    ],

    summary: {
      ...summary,
      totalDurationHours: Math.round(summary.totalDurationHours * 100) / 100,
      publicConsentedCount: publicCount,
      publicConsentedRatio: sessions.length > 0 ? Math.round(publicCount / sessions.length * 100) / 100 : 0,
      uniqueContributors: contributor.uniqueUserIds.length || 1,
    },

    ...(has('eligibleSkus') ? {
      skuBreakdown: skuBreakdown.map(sku => ({
        skuId: sku.skuId,
        name: sku.nameKo,
        category: sku.category,
        sessionCount: sku.count,
        totalHours: Math.round(sku.totalHours * 100) / 100,
      })),
    } : {}),

    sessions: sessions.map(s => {
      const audio = getAudioRef(s)
      const grade = qualityGradeFromScore(s.qaScore ?? 0)
      const eligibleSkus = sessionEligibleSkus(s)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = {
        id: s.id,
      }
      if (has('title')) row.title = maskSessionTitle(s.title)
      if (has('date')) row.date = s.date
      if (has('duration')) row.duration = s.duration
      if (has('durationFormatted')) row.durationFormatted = formatDuration(s.duration)
      if (has('userId') || has('peerId')) {
        row.contributor = {
          ...(has('userId') ? { userId: s.userId ?? null } : {}),
          ...(has('peerId') ? { peerId: s.peerId ?? null } : {}),
        }
      }
      if (has('qaScore')) row.qaScore = s.qaScore ?? 0
      if (has('qualityGrade')) row.qualityGrade = grade
      if (has('labels.relationship') || has('labels.purpose') || has('labels.domain') || has('labels.tone') || has('labels.noise')) {
        row.labels = {
          ...(has('labels.relationship') ? { relationship: s.labels?.relationship ?? null } : {}),
          ...(has('labels.purpose') ? { purpose: s.labels?.purpose ?? null } : {}),
          ...(has('labels.domain') ? { domain: s.labels?.domain ?? null } : {}),
          ...(has('labels.tone') ? { tone: s.labels?.tone ?? null } : {}),
          ...(has('labels.noise') ? { noise: s.labels?.noise ?? null } : {}),
        }
      }
      if (has('labelStatus')) row.labelStatus = s.labelStatus ?? null
      if (has('audioFilePath') || has('audioUrl') || has('sanitizedWavPath')) {
        row.audio = {
          ...(has('audioFilePath') ? { filePath: maskFilePath(audio.filePath) } : {}),
          ...(has('audioUrl') ? { audioUrl: audio.audioUrl } : {}),
          ...(has('sanitizedWavPath') ? { sanitizedWavPath: maskFilePath(audio.sanitizedPath) } : {}),
        }
      }
      if (has('visibilityStatus') || has('consentVersion') || has('shareScope')) {
        row.consent = {
          isPublic: s.isPublic,
          ...(has('visibilityStatus') ? { visibilityStatus: s.visibilityStatus } : {}),
          ...(has('consentVersion') ? { consentVersion: s.visibilityConsentVersion } : {}),
          ...(has('shareScope') ? { shareScope: s.shareScope ?? 'PRIVATE' } : {}),
        }
      }
      if (has('isPiiCleaned') || has('piiStatus') || has('uploadStatus')) {
        row.privacy = {
          ...(has('isPiiCleaned') ? { isPiiCleaned: s.isPiiCleaned } : {}),
          ...(has('piiStatus') ? { piiStatus: s.piiStatus ?? 'CLEAR' } : {}),
          ...(has('uploadStatus') ? { uploadStatus: s.uploadStatus ?? 'LOCAL' } : {}),
        }
      }
      if (has('eligibleSkus')) row.eligibleSkus = eligibleSkus
      if (has('chunkCount')) row.chunkCount = s.chunkCount
      return row
    }),
  }
  return JSON.stringify(payload, null, 2)
}

// ── 내보내기: JSONL (ML 파이프라인용, 1행=1세션) ──

export function exportAsJsonl(sessions: Session[], fieldSelection?: ExportFieldSelection): string {
  const fields = fieldSelection ? resolveExportFields(fieldSelection) : null
  const has = (key: string) => !fields || fields.has(key)

  const contributor = collectContributorInfo(sessions)
  const profile = contributor.profile

  return sessions.map(s => {
    const audio = getAudioRef(s)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = { id: s.id }
    if (has('date')) row.date = s.date
    if (has('duration')) row.duration_sec = s.duration
    if (has('userId')) row.user_id = s.userId ?? null
    if (has('peerId')) row.peer_id = s.peerId ?? null
    if (has('userId')) row.contributor_pid = contributor.pid
    // 화자 프로필
    if (has('speaker.ageBand')) row.speaker_age_band = profile?.age_band ?? null
    if (has('speaker.gender')) row.speaker_gender = profile?.gender ?? null
    if (has('speaker.region')) row.speaker_region = profile?.region_group ?? null
    if (has('speaker.accent')) row.speaker_accent = profile?.accent_group ?? null
    if (has('speaker.speechStyle')) row.speaker_speech_style = profile?.speech_style ?? null
    if (has('speaker.language')) row.speaker_language = profile?.primary_language ?? null
    if (has('speaker.env')) row.speaker_env = profile?.common_env ?? null
    if (has('speaker.deviceMode')) row.speaker_device_mode = profile?.common_device_mode ?? null
    // 품질
    if (has('qaScore')) row.qa_score = s.qaScore ?? 0
    if (has('qualityGrade')) row.quality_grade = qualityGradeFromScore(s.qaScore ?? 0)
    // 라벨 (필드별 필터링)
    if (has('labels.relationship') || has('labels.purpose') || has('labels.domain') || has('labels.tone') || has('labels.noise')) {
      row.labels = {
        ...(has('labels.relationship') ? { relationship: s.labels?.relationship ?? null } : {}),
        ...(has('labels.purpose') ? { purpose: s.labels?.purpose ?? null } : {}),
        ...(has('labels.domain') ? { domain: s.labels?.domain ?? null } : {}),
        ...(has('labels.tone') ? { tone: s.labels?.tone ?? null } : {}),
        ...(has('labels.noise') ? { noise: s.labels?.noise ?? null } : {}),
      }
    }
    if (has('labelStatus')) row.label_status = s.labelStatus ?? null
    if (has('visibilityStatus')) row.is_public = isSessionPublic(s)
    if (has('consentVersion')) row.consent_version = s.visibilityConsentVersion
    if (has('isPiiCleaned')) row.is_pii_cleaned = s.isPiiCleaned
    if (has('piiStatus')) row.pii_status = s.piiStatus ?? 'CLEAR'
    if (has('audioFilePath')) row.audio_file_path = maskFilePath(audio.filePath)
    if (has('audioUrl')) row.audio_url = audio.audioUrl
    if (has('sanitizedWavPath')) row.sanitized_wav_path = maskFilePath(audio.sanitizedPath)
    if (has('chunkCount')) row.chunk_count = s.chunkCount
    if (has('eligibleSkus')) row.eligible_skus = sessionEligibleSkus(s)
    return JSON.stringify(row)
  }).join('\n')
}

// ── 내보내기: 오디오 매니페스트 (WAV 파일 목록) ──

export function exportAudioManifest(sessions: Session[], _fieldSelection?: ExportFieldSelection): string {
  const BOM = '\uFEFF'
  const headers = [
    'session_id', 'user_id', 'date', 'duration_sec', 'quality_grade',
    'file_path', 'audio_url', 'sanitized_wav_path',
    'is_pii_cleaned', 'consent_status', 'eligible_skus',
  ]

  const rows = sessions.map(s => {
    const audio = getAudioRef(s)
    return [
      s.id,
      s.userId ?? '',
      s.date,
      s.duration,
      qualityGradeFromScore(s.qaScore ?? 0),
      maskFilePath(audio.filePath) ?? '',
      audio.audioUrl ?? '',
      maskFilePath(audio.sanitizedPath) ?? '',
      s.isPiiCleaned ? 'Y' : 'N',
      s.visibilityStatus,
      sessionEligibleSkus(s).join(';'),
    ]
  })

  return BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

// ── 내보내기: CSV (메타데이터 전체) ──

export function exportAsCsv(sessions: Session[], fieldSelection?: ExportFieldSelection): string {
  const fields = fieldSelection ? resolveExportFields(fieldSelection) : null
  const has = (key: string) => !fields || fields.has(key)

  const BOM = '\uFEFF'
  const profile = loadProfile()

  // 헤더-키 매핑 (필드 선택 시 필터링)
  const allColumns: { header: string; key: string; getValue: (s: Session, audio: ReturnType<typeof getAudioRef>) => string | number }[] = [
    { header: 'ID', key: 'id', getValue: s => s.id },
    { header: '제목', key: 'title', getValue: s => `"${maskSessionTitle(s.title).replace(/"/g, '""')}"` },
    { header: '날짜', key: 'date', getValue: s => s.date },
    { header: '시간(초)', key: 'duration', getValue: s => s.duration },
    { header: '시간', key: 'durationFormatted', getValue: s => formatDuration(s.duration) },
    { header: '등급', key: 'qualityGrade', getValue: s => qualityGradeFromScore(s.qaScore ?? 0) },
    { header: 'QA점수', key: 'qaScore', getValue: s => s.qaScore ?? 0 },
    { header: 'userId', key: 'userId', getValue: s => s.userId ?? '' },
    { header: 'peerId', key: 'peerId', getValue: s => s.peerId ?? '' },
    { header: '라벨_관계', key: 'labels.relationship', getValue: s => s.labels?.relationship ?? '' },
    { header: '라벨_목적', key: 'labels.purpose', getValue: s => s.labels?.purpose ?? '' },
    { header: '라벨_도메인', key: 'labels.domain', getValue: s => s.labels?.domain ?? '' },
    { header: '라벨_톤', key: 'labels.tone', getValue: s => s.labels?.tone ?? '' },
    { header: '라벨_소음', key: 'labels.noise', getValue: s => s.labels?.noise ?? '' },
    { header: '공개상태', key: 'visibilityStatus', getValue: s => s.visibilityStatus },
    { header: '동의버전', key: 'consentVersion', getValue: s => s.visibilityConsentVersion ?? '' },
    { header: 'PII처리', key: 'isPiiCleaned', getValue: s => s.isPiiCleaned ? 'Y' : 'N' },
    { header: 'PII상태', key: 'piiStatus', getValue: s => s.piiStatus ?? 'CLEAR' },
    { header: '업로드상태', key: 'uploadStatus', getValue: s => s.uploadStatus ?? 'LOCAL' },
    { header: '오디오경로', key: 'audioFilePath', getValue: (_s, audio) => maskFilePath(audio.filePath) ?? '' },
    { header: '오디오URL', key: 'audioUrl', getValue: (_s, audio) => audio.audioUrl ?? '' },
    { header: '정제WAV경로', key: 'sanitizedWavPath', getValue: (_s, audio) => maskFilePath(audio.sanitizedPath) ?? '' },
    { header: '청크수', key: 'chunkCount', getValue: s => s.chunkCount },
    { header: '적합SKU', key: 'eligibleSkus', getValue: s => sessionEligibleSkus(s).join(';') },
    { header: '화자_연령대', key: 'speaker.ageBand', getValue: () => profile?.age_band ?? '' },
    { header: '화자_성별', key: 'speaker.gender', getValue: () => profile?.gender ?? '' },
    { header: '화자_지역', key: 'speaker.region', getValue: () => profile?.region_group ?? '' },
    { header: '화자_사투리', key: 'speaker.accent', getValue: () => profile?.accent_group ?? '' },
    { header: '화자_말투', key: 'speaker.speechStyle', getValue: () => profile?.speech_style ?? '' },
    { header: '화자_언어', key: 'speaker.language', getValue: () => profile?.primary_language ?? '' },
    { header: '화자_환경', key: 'speaker.env', getValue: () => profile?.common_env ?? '' },
    { header: '화자_기기모드', key: 'speaker.deviceMode', getValue: () => profile?.common_device_mode ?? '' },
    { header: '화자_도메인믹스', key: 'speaker.domainMix', getValue: () => profile?.domain_mix?.join(';') ?? '' },
  ]

  const cols = allColumns.filter(c => has(c.key))
  const headers = cols.map(c => c.header)
  const rows = sessions.map(s => {
    const audio = getAudioRef(s)
    return cols.map(c => c.getValue(s, audio))
  })

  return BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

// ── 내보내기: 정제 WAV (비식별화 + 무음제거 + 16kHz 모노) ──

export type WavExportProgress = {
  done: number
  total: number
  phase: string
  currentSessionId: string | null
}

export type WavExportResult = {
  eligible: number
  processed: number
  failed: number
  noAudio: number
  firstError: string | null
}

export async function exportSanitizedWavs(
  sessions: Session[],
  onProgress: (p: WavExportProgress) => void,
  cancelled: { current: boolean },
): Promise<WavExportResult> {
  // callRecordId 또는 audioUrl 있는 세션만 처리 대상
  const eligible = sessions.filter(s => s.callRecordId || s.audioUrl)
  const noAudio = sessions.length - eligible.length
  const total = eligible.length
  let processed = 0
  let failed = 0
  let firstError: string | null = null

  for (let i = 0; i < total; i++) {
    if (cancelled.current) break
    const s = eligible[i]

    onProgress({ done: i, total, phase: 'processing', currentSessionId: s.id })

    const source: AudioSource = {
      callRecordId: s.callRecordId,
      audioUrl: s.audioUrl,
      sessionId: s.id,
    }

    try {
      const { result, storagePath } = await sanitizeAndUpload(
        source,
        undefined, // PII intervals — 추후 STT 타임스탬프 연동 시 추가
        (phase: string) => onProgress({ done: i, total, phase, currentSessionId: s.id }),
      )

      // Storage 업로드 성공 시 세션에 audioUrl 기록
      if (storagePath && !s.audioUrl) {
        s.audioUrl = storagePath
      }

      // 비식별화된 파일명 생성 (세션ID + 날짜)
      const filename = `${s.id}_${s.date}.wav`
      await saveWavToDevice(result.wav, filename)

      processed++
    } catch (err) {
      failed++
      if (!firstError) {
        const msg = err instanceof Error ? err.message : String(err)
        const ref = s.callRecordId ?? s.audioUrl ?? s.id
        firstError = `[${ref}] ${msg}`
      }
    }

    onProgress({ done: i + 1, total, phase: 'done', currentSessionId: null })

    // 브라우저 다운로드 큐 과부하 방지 (200ms 간격)
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return { eligible: total, processed, failed, noAudio, firstError }
}

async function saveWavToDevice(wav: ArrayBuffer, filename: string): Promise<void> {
  const blob = new Blob([wav], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

// ── 사용자별 그룹핑 ──

export type UserGroupSummary = {
  userId: string | null
  displayId: string
  sessionCount: number
  totalDurationHours: number
  avgQaScore: number
  labeledRatio: number
  qualityDistribution: Record<QualityGrade, number>
  publicCount: number
}

export function groupSessionsByUserId(sessions: Session[]): UserGroupSummary[] {
  const groups = new Map<string, Session[]>()

  for (const s of sessions) {
    const key = s.userId ?? '__null__'
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }

  return Array.from(groups.entries()).map(([key, groupSessions]) => {
    const userId = key === '__null__' ? null : key
    const summary = calcDatasetSummary(groupSessions)
    const publicCount = groupSessions.filter(isSessionPublic).length
    return {
      userId,
      displayId: userId ? `${userId.slice(0, 8)}...` : '미인증 사용자',
      sessionCount: summary.sessionCount,
      totalDurationHours: summary.totalDurationHours,
      avgQaScore: summary.avgQaScore,
      labeledRatio: summary.labeledRatio,
      qualityDistribution: summary.qualityDistribution,
      publicCount,
    }
  }).sort((a, b) => b.sessionCount - a.sessionCount)
}

// ── 다운로드 ──

export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── WAV 다운로드 (API 경유) ─────────────────────────────────────────────

export async function downloadWavFromStorage(
  storagePath: string,
  filename: string,
): Promise<{ error: string | null }> {
  const { getAdminSignedUrlApi } = await import('./api/admin')
  const { data, error: apiErr } = await getAdminSignedUrlApi(storagePath, 300)
  if (apiErr || !data?.signedUrl) return { error: apiErr ?? 'Signed URL 생성 실패' }

  try {
    const res = await fetch(data.signedUrl)
    if (!res.ok) return { error: `다운로드 실패: ${res.status}` }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return { error: null }
  } catch (e) {
    return { error: String(e) }
  }
}

// ── STT 자막 JSONL 내보내기 (API 경유) ──────────────────────────────────

export async function exportTranscriptJsonl(
  sessions: Session[],
): Promise<{ jsonl: string; count: number; error?: string }> {
  const { bulkFetchTranscriptsApi } = await import('./api/admin')

  const sessionIds = sessions.map(s => s.id)
  const { data, error } = await bulkFetchTranscriptsApi(sessionIds)

  if (error) {
    return { jsonl: '', count: 0, error }
  }

  const transcriptMap = new Map<string, { text: string; words?: unknown[]; summary?: string; source?: string }>()
  for (const row of data ?? []) {
    transcriptMap.set(row.sessionId, {
      text: row.text,
      words: row.words,
      summary: row.summary,
      source: row.source,
    })
  }

  const lines: string[] = []
  for (const s of sessions) {
    const t = transcriptMap.get(s.id)
    if (!t?.text) continue
    const row: Record<string, unknown> = {
      session_id: s.id,
      date: s.date,
      duration_sec: s.duration,
      quality_grade: s.qaScore ? (s.qaScore >= 80 ? 'A' : s.qaScore >= 60 ? 'B' : 'C') : null,
      labels: s.labels ?? null,
      text: t.text,
      source: t.source ?? null,
    }
    if (t.words && (t.words as unknown[]).length > 0) row.words = t.words
    if (t.summary) row.summary = t.summary
    lines.push(JSON.stringify(row))
  }

  return { jsonl: lines.join('\n'), count: lines.length }
}

// ── WAV + 자막 ZIP 내보내기 (API 경유) ──────────────────────────────────

export async function exportWavWithTranscript(
  sessions: Session[],
  onProgress: (done: number, total: number) => void,
  cancelled: { current: boolean },
): Promise<{ processed: number; noAudio: number; noTranscript: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jszip = await import('jszip') as any
  const JSZip = jszip.default ?? jszip
  const { getAdminSignedUrlApi, bulkFetchTranscriptsApi } = await import('./api/admin')

  // 1. Transcripts 일괄 조회 (API 경유)
  const sessionIds = sessions.map(s => s.id)
  const transcriptMap = new Map<string, { text: string; words?: unknown[]; summary?: string }>()
  try {
    const { data } = await bulkFetchTranscriptsApi(sessionIds)
    for (const row of data ?? []) {
      transcriptMap.set(row.sessionId, {
        text: row.text,
        words: row.words,
        summary: row.summary,
      })
    }
  } catch (e) {
    console.warn('[exportWavWithTranscript] transcript fetch failed:', e)
  }

  // 2. audioUrl 있는 세션만 처리
  const eligible = sessions.filter(s => !!s.audioUrl)
  const noAudio = sessions.length - eligible.length
  let processed = 0
  let noTranscript = 0

  const zip = new JSZip()

  for (let i = 0; i < eligible.length; i++) {
    if (cancelled.current) break
    const s = eligible[i]
    const audioUrl = s.audioUrl as string
    onProgress(processed, eligible.length)

    const baseName = `${s.date}_${s.id.slice(0, 8)}`

    // WAV: Signed URL로 fetch → ZIP에 추가
    try {
      const { data } = await getAdminSignedUrlApi(audioUrl, 600)
      if (data?.signedUrl) {
        const res = await fetch(data.signedUrl)
        if (res.ok) {
          zip.file(`${baseName}.wav`, await res.arrayBuffer())
        }
      }
    } catch (e) {
      console.warn(`[exportWavWithTranscript] WAV error for ${s.id}:`, e)
    }

    // 자막 JSON
    const t = transcriptMap.get(s.id)
    if (t?.text) {
      const row = {
        session_id: s.id,
        date: s.date,
        duration_sec: s.duration,
        labels: s.labels ?? null,
        text: t.text,
        words: t.words ?? [],
        summary: t.summary ?? null,
      }
      zip.file(`${baseName}.json`, JSON.stringify(row, null, 2))
    } else {
      noTranscript++
    }

    processed++
  }

  onProgress(processed, eligible.length)

  if (processed > 0) {
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `uncounted_wav_transcript_${new Date().toISOString().slice(0, 10)}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 15000)
  }

  return { processed, noAudio, noTranscript }
}
