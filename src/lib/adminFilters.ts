import type { DashboardStats } from './api/dashboard'
import type { ReviewQueueFilters } from './api/reviews'

export const SESSIONS_PER_PAGE = 20

// ── 3그룹 필터 상태 모델 ────────────────────────────────────────────────────
// /admin/calls 상단 필터를 상태(단일선택) ↔ 속성(다중선택)으로 분리한다:
//   process(처리현황, 단일) · review(검수현황, 단일) · flags[](데이터 특이사항, 다중)
// 그룹 간 AND, flags 내부도 AND. 백엔드(read-only API #49)는 이미 각 차원을 독립 조합한다.
export type ProcessStatus = 'pending' | 'processing' | 'done' | 'failed' | 'stopped'
export type ReviewFilter = 'pending' | 'in_review' | 'approved' | 'needs_revision' | 'rejected'
export type FlagId = 'quality_c' | 'pii' | 'label_missing'

export interface FilterState {
  process?: ProcessStatus
  review?: ReviewFilter
  flags: FlagId[]
}

const PROCESS_VALUES: readonly ProcessStatus[] = ['pending', 'processing', 'done', 'failed', 'stopped']
const REVIEW_VALUES: readonly ReviewFilter[] = ['pending', 'in_review', 'approved', 'needs_revision', 'rejected']
const FLAG_VALUES: readonly FlagId[] = ['quality_c', 'pii', 'label_missing']

// URL searchParams → FilterState. 알 수 없는 값은 버린다(방어적 파싱).
export function parseFiltersFromSearch(sp: URLSearchParams): FilterState {
  const process = sp.get('process')
  const review = sp.get('review')
  const flags = (sp.get('flags')?.split(',') ?? []).filter(
    (f): f is FlagId => (FLAG_VALUES as readonly string[]).includes(f),
  )
  return {
    process: (PROCESS_VALUES as readonly string[]).includes(process ?? '') ? (process as ProcessStatus) : undefined,
    review: (REVIEW_VALUES as readonly string[]).includes(review ?? '') ? (review as ReviewFilter) : undefined,
    // 중복 제거 + 정의된 순서 유지
    flags: FLAG_VALUES.filter((f) => flags.includes(f)),
  }
}

// FilterState → API 필터(ReviewQueueFilters). 그룹 간/flags 내부 모두 AND.
export function buildFiltersFromState(state: FilterState, page: number, search?: string): ReviewQueueFilters {
  const f: ReviewQueueFilters = { page, limit: SESSIONS_PER_PAGE, ...(search ? { search } : {}) }
  if (state.process) f.processStatus = state.process
  if (state.review) f.reviewStatus = state.review
  if (state.flags.includes('quality_c')) f.qualityGradeMin = 'C'
  if (state.flags.includes('pii')) f.piiFlag = true
  if (state.flags.includes('label_missing')) f.labelMissing = true
  return f
}

// ── 레거시 ?filter=<id> shim ────────────────────────────────────────────────
// 기존 북마크/링크 호환. 14개 단일 filterId → 새 차원으로 1회 변환.
const LEGACY_MAP: Record<string, { process?: ProcessStatus; review?: ReviewFilter; flag?: FlagId }> = {
  // 검수(B)
  pending: { review: 'pending' },
  in_review: { review: 'in_review' },
  approved: { review: 'approved' },
  needs_revision: { review: 'needs_revision' },
  rejected: { review: 'rejected' },
  // 처리(A)
  failed: { process: 'failed' },
  pipeline_idle: { process: 'pending' },
  pipeline_running: { process: 'processing' },
  pipeline_waiting: { process: 'stopped' },
  pipeline_stuck: { process: 'stopped' }, // 병목 → 중단에 흡수
  // 플래그(C)
  quality_c: { flag: 'quality_c' },
  pii_flag: { flag: 'pii' },
  label_skipped: { flag: 'label_missing' },
  // all → clear (매핑 없음)
}

// 레거시 ?filter= 가 있으면 새 param 으로 변환한 URLSearchParams 를 반환(필요 시 호출부가 replace).
// 변환할 게 없으면 null. 이미 새 param 이 있으면 레거시는 무시하고 filter 만 제거한다(중복 변환 방지).
export function migrateLegacyFilter(sp: URLSearchParams): URLSearchParams | null {
  if (sp.get('filter') === null) return null
  const legacy = sp.get('filter') as string
  const next = new URLSearchParams(sp)
  next.delete('filter')
  const hasNew = sp.get('process') || sp.get('review') || sp.get('flags')
  if (!hasNew) {
    const m = LEGACY_MAP[legacy]
    if (m?.process) next.set('process', m.process)
    if (m?.review) next.set('review', m.review)
    if (m?.flag) next.set('flags', m.flag)
    // 'all' / 미지정 → 아무 param 도 안 붙음(전체)
  }
  return next
}

// ── 필터바 렌더용 그룹 정의 ─────────────────────────────────────────────────
// count 는 "깨끗이 제공되는 것"만(검수 5종 · 처리오류 · PII). 나머지는 미표기(세션단위 집계 부재).
export interface FilterOption {
  id: string // process/review: 값 또는 'all', flags: FlagId
  label: string
  count?: number
  danger?: boolean
  warn?: boolean
}
export interface FilterGroups {
  process: FilterOption[]
  review: FilterOption[]
  flags: FilterOption[]
}

export function buildFilterGroups(stats: DashboardStats | null): FilterGroups {
  const r = stats?.review
  const failedCount = stats?.alerts.pipelineFailedCount ?? 0
  const piiCount = stats?.alerts.piiSessionCount
  return {
    process: [
      { id: 'all', label: '전체' },
      { id: 'pending', label: '처리 대기' },
      { id: 'processing', label: '처리 중' },
      { id: 'done', label: '데이터 처리 완료' },
      { id: 'stopped', label: '처리 중단' },
      { id: 'failed', label: '처리 오류', count: failedCount, danger: true },
    ],
    review: [
      { id: 'all', label: '전체' },
      { id: 'pending', label: '검수 대기', count: r?.pending },
      { id: 'in_review', label: '검수 중', count: r?.in_review },
      { id: 'approved', label: '검수 승인 완료', count: r?.approved },
      { id: 'needs_revision', label: '재검수', count: r?.needs_revision },
      { id: 'rejected', label: '승인불가', count: r?.rejected },
    ],
    flags: [
      { id: 'quality_c', label: '품질 참고(C)', warn: true },
      { id: 'pii', label: 'PII 의심', count: piiCount, warn: true },
      { id: 'label_missing', label: '라벨링 누락', warn: true },
    ],
  }
}
