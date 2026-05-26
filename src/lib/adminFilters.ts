import type { DashboardStats } from './api/dashboard'
import type { FilterChip } from '../components/domain/FilterChips'
import type { ReviewQueueFilters } from './api/reviews'

export type FilterId =
  | 'all'
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'needs_revision'
  | 'rejected'
  | 'failed'
  | 'pii_flag'
  | 'quality_c'
  | 'pipeline_idle'
  | 'pipeline_waiting'
  | 'pipeline_running'
  | 'pipeline_stuck'
  | 'label_skipped'

export const SESSIONS_PER_PAGE = 20

export function buildFilters(filterId: FilterId, page: number, search?: string): ReviewQueueFilters {
  const base: ReviewQueueFilters = { page, limit: SESSIONS_PER_PAGE, ...(search ? { search } : {}) }
  switch (filterId) {
    case 'pending':          return { ...base, reviewStatus: 'pending' }
    case 'in_review':        return { ...base, reviewStatus: 'in_review' }
    case 'approved':         return { ...base, reviewStatus: 'approved' }
    case 'needs_revision':   return { ...base, reviewStatus: 'needs_revision' }
    case 'rejected':         return { ...base, reviewStatus: 'rejected' }
    case 'failed':           return { ...base, pipelineFailed: true }
    case 'pii_flag':         return { ...base, piiFlag: true }
    case 'quality_c':        return { ...base, qualityGradeMin: 'C' }
    case 'pipeline_idle':    return { ...base, pipelineState: 'idle' }
    case 'pipeline_waiting': return { ...base, pipelineState: 'waiting' }
    case 'pipeline_running': return { ...base, pipelineState: 'running' }
    case 'pipeline_stuck':   return { ...base, pipelineState: 'stuck' }
    case 'label_skipped':    return { ...base, pipelineState: 'label_skipped' }
    default:                 return base
  }
}

export function buildChips(stats: DashboardStats | null): FilterChip[] {
  const r = stats?.review
  const failedCount = stats?.alerts.pipelineFailedCount ?? 0
  const total =
    (r?.pending ?? 0) +
    (r?.in_review ?? 0) +
    (r?.approved ?? 0) +
    (r?.rejected ?? 0) +
    (r?.needs_revision ?? 0)
  // primary = 기본 노출(전체·검수 대기·저품질·PII 의심). 나머지 처리 상태 칩은
  // FilterChips 의 '상세 필터' 아래로 접힌다.
  return [
    { id: 'all',             label: '전체',           count: total, primary: true },
    { id: 'pending',         label: '검수 대기',       count: r?.pending ?? 0, primary: true },
    { id: 'quality_c',       label: '저품질(C)',       warn: true, primary: true },
    { id: 'pii_flag',        label: '⚠ PII 의심',     count: stats?.alerts.piiSessionCount ?? 0, warn: true, primary: true },
    { id: 'in_review',       label: '검수 중',         count: r?.in_review ?? 0 },
    { id: 'approved',        label: '승인됨',          count: r?.approved ?? 0 },
    { id: 'needs_revision',  label: '수정 필요',       count: r?.needs_revision ?? 0 },
    { id: 'rejected',        label: '거절됨',          count: r?.rejected ?? 0 },
    { id: 'failed',          label: '처리 오류',       count: failedCount, warn: failedCount > 0 },
    { id: 'pipeline_idle',    label: '처리 대기' },
    { id: 'pipeline_waiting', label: '처리 중단',  warn: true },
    { id: 'pipeline_running', label: '처리 중' },
    { id: 'pipeline_stuck',   label: '처리 병목',  warn: true },
    { id: 'label_skipped',    label: '⚠ 라벨링 누락', warn: true },
  ]
}
