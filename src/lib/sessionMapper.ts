import { type Session, type SessionStatus, type VisibilityStatus, type VisibilitySource, type UploadStatus, type PiiStatus, type ShareScope, type ReviewAction, type ConsentStatus } from '../types/session'
import { fetchSessions, saveSessions, deleteSession } from './api/sessions'
import { loadConsentFlag, loadConsentFromIDB } from './globalConsent'
import { normalizeLabel } from './labelOptions'
import { maskSessionTitle } from './displayMask'
import { getVerifiedPaths } from './embeddingEngine'
import { getEffectiveUserId } from './auth'
import { fetchAllSessionsAdminApi } from './api/sessions'

export function sessionFromRow(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    title: row.title as string,
    date: row.date as string,
    duration: row.duration as number,
    qaScore: (row.qa_score as number) ?? 0,
    labels: row.labels as Session['labels'],
    audioMetrics: null,
    isPublic: (row.is_public as boolean) ?? false,
    visibilityStatus: ((row.visibility_status as VisibilityStatus) ?? 'PRIVATE'),
    visibilitySource: ((row.visibility_source as VisibilitySource) ?? 'MANUAL'),
    visibilityConsentVersion: (row.visibility_consent_version as string) ?? null,
    visibilityChangedAt: (row.visibility_changed_at as string) ?? null,
    status: ((row.status as SessionStatus) === 'pending' ? 'uploaded' : (row.status as SessionStatus)) ?? 'uploaded',
    isPiiCleaned: (row.is_pii_cleaned as boolean) ?? false,
    chunkCount: (row.chunk_count as number) ?? 0,
    audioUrl: (row.audio_url as string) ?? undefined,
    callRecordId: (row.call_record_id as string) ?? undefined,
    // 공개 준비 상태머신 필드
    uploadStatus: (row.upload_status as UploadStatus) ?? 'LOCAL',
    piiStatus: (row.pii_status as PiiStatus) ?? 'CLEAR',
    shareScope: (row.share_scope as ShareScope) ?? 'PRIVATE',
    eligibleForShare: (row.eligible_for_share as boolean) ?? false,
    reviewAction: (row.review_action as ReviewAction) ?? null,
    lockReason: (row.lock_reason as Record<string, unknown>) ?? null,
    lockStartMs: (row.lock_start_ms as number) ?? null,
    lockEndMs: (row.lock_end_ms as number) ?? null,
    localSanitizedWavPath: (row.local_sanitized_wav_path as string) ?? null,
    localSanitizedTextPreview: (row.local_sanitized_text_preview as string) ?? null,
    // 동의 상태 + 화자 인증
    consentStatus: (row.consent_status as ConsentStatus) ?? 'locked',
    verifiedSpeaker: (row.verified_speaker as boolean) ?? false,
    // Auth + 자동 라벨링
    userId: (row.user_id as string) ?? null,
    peerId: (row.peer_id as string) ?? null,
    labelStatus: (row.label_status as Session['labelStatus']) ?? null,
    // 라벨 출처/신뢰도
    labelSource: (row.label_source as Session['labelSource']) ?? null,
    labelConfidence: typeof row.label_confidence === 'number' ? row.label_confidence : null,
  }
}

export function sessionToRow(s: Session) {
  return {
    id: s.id,
    title: maskSessionTitle(s.title),
    date: s.date,
    duration: s.duration,
    qa_score: s.qaScore ?? 0,
    labels: s.labels,
    is_public: s.isPublic,
    visibility_status: s.visibilityStatus,
    visibility_source: s.visibilitySource,
    visibility_consent_version: s.visibilityConsentVersion,
    visibility_changed_at: s.visibilityChangedAt,
    status: s.status,
    is_pii_cleaned: s.isPiiCleaned,
    chunk_count: s.chunkCount,
    audio_url: s.audioUrl,
    call_record_id: s.callRecordId,
    // 공개 준비 상태머신 필드
    upload_status: s.uploadStatus ?? 'LOCAL',
    pii_status: s.piiStatus ?? 'CLEAR',
    share_scope: s.shareScope ?? 'PRIVATE',
    eligible_for_share: s.eligibleForShare ?? false,
    review_action: s.reviewAction ?? null,
    lock_reason: s.lockReason ?? null,
    lock_start_ms: s.lockStartMs ?? null,
    lock_end_ms: s.lockEndMs ?? null,
    local_sanitized_wav_path: s.localSanitizedWavPath ?? null,
    local_sanitized_text_preview: s.localSanitizedTextPreview ?? null,
    // 동의 상태 + 화자 인증
    consent_status: s.consentStatus ?? 'locked',
    verified_speaker: s.verifiedSpeaker ?? false,
    // Auth + 자동 라벨링
    user_id: s.userId ?? null,
    peer_id: s.peerId ?? null,
    label_status: s.labelStatus ?? null,
    // 라벨 출처/신뢰도
    label_source: s.labelSource ?? null,
    label_confidence: s.labelConfidence ?? null,
  }
}

/** v1 스키마 전용 — 마이그레이션 미적용 Supabase 인스턴스 호환
 *  001_mvp_schema + 002_auth_rls_storage 컬럼만 포함 (007 미적용 환경 안전) */
export function sessionToRowCore(s: Session) {
  return {
    id: s.id,
    title: maskSessionTitle(s.title),
    date: s.date,
    duration: s.duration,
    qa_score: s.qaScore ?? 0,
    labels: s.labels,
    is_public: s.isPublic,
    status: s.status,
    is_pii_cleaned: s.isPiiCleaned,
    chunk_count: s.chunkCount,
    audio_url: s.audioUrl,
    call_record_id: s.callRecordId,
    label_status: s.labelStatus ?? null,
    user_id: s.userId ?? null,
  }
}

// ── localStorage 폴백 — 세션 전체 (소량) + 공개 상태 override (대량) ───────────
const SESSIONS_KEY = 'uncounted_sessions'
const VISIBILITY_KEY = 'uncounted_visibility'

// 공개 상태 override — compact 저장 (7000건도 ~1MB 이내)
type VisibilityOverride = {
  p: boolean                   // isPublic
  s: VisibilityStatus          // visibilityStatus
  o: VisibilitySource          // visibilitySource
  v: string | null             // visibilityConsentVersion
  d: string | null             // visibilityChangedAt
}

function loadVisibilityOverrides(): Record<string, VisibilityOverride> {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    return raw ? (JSON.parse(raw) as Record<string, VisibilityOverride>) : {}
  } catch {
    return {}
  }
}

function saveVisibilityOverrides(sessions: Session[]): void {
  try {
    // 기존 데이터와 병합하지 않고 교체 (구버전 ID 누적으로 용량 초과 방지)
    const overrides: Record<string, VisibilityOverride> = {}
    for (const s of sessions) {
      overrides[s.id] = {
        p: s.isPublic,
        s: s.visibilityStatus,
        o: s.visibilitySource,
        v: s.visibilityConsentVersion,
        d: s.visibilityChangedAt,
      }
    }
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(overrides))
  } catch {
    // 용량 초과 무시
  }
}

function applyVisibilityOverrides(sessions: Session[]): Session[] {
  const overrides = loadVisibilityOverrides()
  return sessions.map((s) => {
    const ov = overrides[s.id]
    if (!ov) return s
    return {
      ...s,
      isPublic: ov.p,
      visibilityStatus: ov.s,
      visibilitySource: ov.o,
      visibilityConsentVersion: ov.v,
      visibilityChangedAt: ov.d,
    }
  })
}

// ── 세션 저장소 — Supabase (primary) + localStorage (fallback) ────────

function normalizeSession(s: Session): Session {
  const base = s.status === 'pending' ? { ...s, status: 'uploaded' as const } : s
  // 라벨 정규화: 영어 키(FAMILY/BIZ) 및 이전 한국어 매핑(직장/거래처) → 현재 표준
  if (base.labels) {
    return {
      ...base,
      labels: {
        ...base.labels,
        relationship: normalizeLabel(base.labels.relationship),
        domain: normalizeLabel(base.labels.domain),
        purpose: normalizeLabel(base.labels.purpose),
        tone: normalizeLabel(base.labels.tone),
        noise: normalizeLabel(base.labels.noise),
      },
    }
  }
  return base
}

/** compact 세션에 callRecordId가 없으면 uncounted_file_paths에서 복원 */
function enrichWithFilePaths(sessions: Session[]): Session[] {
  try {
    const fp: Record<string, string> = JSON.parse(
      localStorage.getItem('uncounted_file_paths') ?? '{}',
    )
    if (Object.keys(fp).length === 0) return sessions
    return sessions.map((s) =>
      s.callRecordId ? s : { ...s, callRecordId: fp[s.id] },
    )
  } catch {
    return sessions
  }
}

// localStorage 폴백 (IndexedDB 불가 시 또는 마이그레이션용)
function loadSessionsFromLS(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as Session[]).map(normalizeSession)
  } catch {
    return []
  }
}

function saveSessionsToLS(sessions: Session[]): void {
  try {
    localStorage.removeItem(SESSIONS_KEY)
    const compact = sessions.map((s) => ({
      id: s.id, title: s.title, date: s.date, duration: s.duration,
      qaScore: s.qaScore ?? 0,
      labels: s.labels, labelStatus: s.labelStatus ?? null, status: s.status,
      isPiiCleaned: s.isPiiCleaned, chunkCount: s.chunkCount,
      callRecordId: s.callRecordId,
      isPublic: s.isPublic,
      visibilityStatus: s.visibilityStatus,
      consentStatus: s.consentStatus ?? 'locked',
      verifiedSpeaker: s.verifiedSpeaker ?? false,
    }))
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(compact))
  } catch { /* 용량 초과 무시 — visibility override가 커버 */ }
}

// API primary — 클라우드 저장소 (백엔드 경유)
async function loadSessionsFromApi(): Promise<Session[]> {
  const userId = getEffectiveUserId()
  if (!userId) {
    console.warn('[loadSessionsFromApi] userId 없음, 로컬만 반환')
    return []
  }

  try {
    const all: Session[] = []
    let page = 1
    const limit = 1000

    while (true) {
      const { data, error, count } = await fetchSessions(page, limit)
      if (error) {
        console.warn('[loadSessionsFromApi] API error:', error)
        break
      }
      if (!data || data.length === 0) break
      all.push(...data)
      // count가 있으면 전체 개수 기반으로 종료, 없으면 data.length < limit으로 판단
      const total = count ?? 0
      if (total > 0 ? all.length >= total : data.length < limit) break
      page++
    }

    return all.map(normalizeSession)
  } catch (err: any) {
    console.warn('[loadSessionsFromApi] 오류:', err.message)
    return []
  }
}

async function saveSessionsToApi(sessions: Session[]): Promise<boolean> {
  if (sessions.length === 0) return true

  try {
    const CHUNK = 500
    for (let i = 0; i < sessions.length; i += CHUNK) {
      const chunk = sessions.slice(i, i + CHUNK)
      const { error } = await saveSessions(chunk)
      if (error) {
        console.warn('[saveSessionsToApi] API error:', error)
        return false
      }
    }
    return true
  } catch (err: any) {
    console.warn('[saveSessionsToApi] 오류:', err.message)
    return false
  }
}

// ── 중복 제거 — 같은 파일(callRecordId)의 중복 세션 제거 ─────────────────────
// De-dup 스펙: title/파일명으로 중복 판정 금지 → callRecordId(파일 경로)만 사용
// 스캔 데이터(callRecordId 있음)가 존재하면 구버전 세션(callRecordId 없음)은 stale로 간주
/** 공개 동의된 세션 우선, 라벨 있는 세션 우선 */
function deduplicateByPath(sessions: Session[]): Session[] {
  const byPath = new Map<string, Session>()
  const noPaths: Session[] = []
  for (const s of sessions) {
    if (!s.callRecordId) {
      noPaths.push(s)
      continue
    }
    const existing = byPath.get(s.callRecordId)
    if (!existing) {
      byPath.set(s.callRecordId, s)
    } else if (
      (s.isPublic && !existing.isPublic) ||
      (s.labels && !existing.labels)
    ) {
      byPath.set(s.callRecordId, s)
    }
  }

  // 스캔 완료(callRecordId 있는 세션 존재) → 구버전 세션(callRecordId 없음) 제외
  // 스캔 전(callRecordId 없음만) → noPaths 유지
  return byPath.size > 0 ? [...byPath.values()] : [...noPaths]
}

/** API를 통해 stale 세션 삭제 (비동기, 실패 무시) */
async function cleanupStaleSessions(staleIds: string[]): Promise<void> {
  if (staleIds.length === 0) return

  await Promise.allSettled(
    staleIds.map((id) =>
      deleteSession(id).catch((err: any) =>
        console.warn('[cleanupStaleSessions] 오류:', id, err.message)
      )
    )
  )
}

/** visibility override에서 유효 ID만 남기고 정리 */
function cleanupVisibilityOverrides(validIds: Set<string>): void {
  try {
    const overrides = loadVisibilityOverrides()
    const clean: Record<string, VisibilityOverride> = {}
    for (const [id, ov] of Object.entries(overrides)) {
      if (validIds.has(id)) clean[id] = ov
    }
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(clean))
  } catch { /* ignore */ }
}

// ── 인메모리 캐시 — 탭 이동 시 Supabase 재조회 방지 ─────────────────────────
let _cachedSessions: Session[] | null = null

/** 캐시 무효화 (스캔/새로고침 시 호출) */
export function invalidateSessionCache(): void {
  _cachedSessions = null
}

/** 캐시된 세션 동기 반환 (탭 전환 시 즉시 렌더용, 없으면 null)
 *  검증 캐시가 뒤늦게 로드될 수 있으므로 매 호출 시 패치 재적용 */
export function getCachedSessions(): Session[] | null {
  if (!_cachedSessions) return null
  const patched = applyVerificationPatches(_cachedSessions)
  if (patched !== _cachedSessions) _cachedSessions = patched
  return _cachedSessions
}

/** 글로벌 동의 설정(ON)이면 모든 세션을 공개로 강제 적용
 *  1차: localStorage → 2차: 네이티브 파일 (Android WebView flush 지연 대비) */
async function applyGlobalConsent(sessions: Session[]): Promise<Session[]> {
  try {
    // 1차: localStorage 확인 (빠름, 메모리 기반)
    let enabled = false
    let ver = 'v1-2026-02'
    let day = new Date().toISOString().slice(0, 10)

    const raw = localStorage.getItem('uncounted_user_settings')
    if (raw) {
      const us = JSON.parse(raw)
      enabled = !!us.globalShareConsentEnabled
      ver = us.consentVersion ?? ver
      day = us.globalShareConsentUpdatedAt ?? day
    }

    // 2차: IDB 폴백 (세션 7000건 저장/로드 검증됨 — 가장 신뢰)
    if (!enabled) {
      const idbFlag = await loadConsentFromIDB()
      if (idbFlag?.enabled) {
        enabled = true
        ver = idbFlag.consentVersion ?? ver
        day = idbFlag.updatedAt ?? day
      }
    }

    // 3차: 네이티브 파일 폴백
    if (!enabled) {
      const flag = await loadConsentFlag()
      if (flag?.enabled) {
        enabled = true
        ver = flag.consentVersion ?? ver
        day = flag.updatedAt ?? day
      }
    }

    if (!enabled) return sessions

    return sessions.map((s) => {
      // 수동 설정(MANUAL) 세션은 글로벌 토글로 덮어씌우지 않음
      if (s.visibilitySource === 'MANUAL') return s
      return {
        ...s,
        isPublic: true,
        visibilityStatus: 'PUBLIC_CONSENTED' as VisibilityStatus,
        visibilitySource: 'GLOBAL_DEFAULT' as VisibilitySource,
        visibilityConsentVersion: ver,
        visibilityChangedAt: day,
      }
    })
  } catch {
    return sessions
  }
}

// ── 검증 캐시 → 세션 동의 상태 패치 (안전망) ────────────────────────────────
// 검증 캐시에 verified인 callRecordId가 있으면 세션 consentStatus를 'user_only'로 승격
// loadAllSessions()/saveAllSessions() 양쪽에서 호출하여 race condition 방지
function applyVerificationPatches(sessions: Session[]): Session[] {
  let verifiedPaths: Set<string>
  try {
    verifiedPaths = getVerifiedPaths()
  } catch {
    return sessions
  }
  if (verifiedPaths.size === 0) return sessions

  let filePaths: Record<string, string> = {}
  try {
    filePaths = JSON.parse(localStorage.getItem('uncounted_file_paths') ?? '{}')
  } catch { /* ignore */ }

  let changed = false
  const patched = sessions.map((s) => {
    if (s.verifiedSpeaker) return s
    const path = s.callRecordId || filePaths[s.id] || null
    if (!path || !verifiedPaths.has(path)) return s
    changed = true
    const consent: ConsentStatus =
      s.consentStatus === 'both_agreed' ? 'both_agreed' : 'user_only'
    return { ...s, verifiedSpeaker: true, consentStatus: consent }
  })
  return changed ? patched : sessions
}

/** 등록 초기화(재등록) 시 모든 세션의 검증 필드 리셋.
 *  verifiedSpeaker → false, consentStatus → 'locked' (both_agreed는 유지하지 않음)
 *  인메모리 캐시 + Supabase + localStorage 모두 갱신. */
export async function resetVerificationFields(): Promise<void> {
  let sessions = _cachedSessions
  if (!sessions) {
    sessions = await loadSessionsFromApi()
    if (sessions.length === 0) {
      sessions = enrichWithFilePaths(loadSessionsFromLS())
    }
  }
  if (sessions.length === 0) return

  const reset = sessions.map((s) => {
    if (!s.verifiedSpeaker && s.consentStatus === 'locked') return s
    return { ...s, verifiedSpeaker: false, consentStatus: 'locked' as ConsentStatus }
  })

  _cachedSessions = reset
  saveVisibilityOverrides(reset)
  saveSessionsToLS(reset)
  await saveSessionsToApi(reset)
}

export type LoadSessionsOptions = {
  /** true이면 user_id 필터 없이 전체 세션 조회 (관리자용) */
  skipUserFilter?: boolean
}

// ── 로드 — 캐시 → Supabase + localStorage + visibility override + 중복 제거 ────
export async function loadAllSessions(opts?: LoadSessionsOptions): Promise<Session[]> {
  const skipUserFilter = opts?.skipUserFilter ?? false

  // 캐시 히트 → Supabase 재조회 없이 즉시 반환
  // skipUserFilter 요청 시 캐시 무시 (관리자 전체 조회 보장)
  // 검증 캐시가 뒤늦게 로드될 수 있으므로 매 히트 시 패치 재적용
  if (_cachedSessions && !skipUserFilter) {
    const patched = applyVerificationPatches(_cachedSessions)
    if (patched !== _cachedSessions) _cachedSessions = patched
    return _cachedSessions
  }

  // localStorage 폴백 (오프라인 또는 초기 데이터)
  const local = enrichWithFilePaths(loadSessionsFromLS())
  if (import.meta.env.DEV) {
    console.log(`[loadAllSessions] localStorage: ${local.length}건, skipUserFilter: ${skipUserFilter}`)
  }

  // skipUserFilter (관리자 모드): admin API로 전체 세션 조회, 실패 시 로컬 폴백
  if (skipUserFilter) {
    const { data: adminData } = await fetchAllSessionsAdminApi()
    const base = adminData && adminData.length > 0
      ? adminData
      : local
    const result = applyVerificationPatches(await applyGlobalConsent(deduplicateByPath(applyVisibilityOverrides(base))))
    _cachedSessions = result
    return result
  }

  // API에서 세션 조회
  const remote = await loadSessionsFromApi()
  if (import.meta.env.DEV) {
    console.log(`[loadAllSessions] Supabase: ${remote.length}건`)
  }

  if (remote.length === 0) {
    const result = applyVerificationPatches(await applyGlobalConsent(deduplicateByPath(applyVisibilityOverrides(local))))
    if (import.meta.env.DEV) {
      console.log(`[loadAllSessions] returning local only: ${result.length}건`)
    }
    _cachedSessions = result
    return result
  }

  // Supabase 우선 병합 + 로컬 라벨/상태 보완
  // Supabase가 신뢰할 수 있는 소스이지만,
  // 로컬에만 있는 라벨은 보존 (오프라인 작업 지원)
  const localMap = new Map<string, Session>()
  for (const s of local) localMap.set(s.id, s)

  const remoteMap = new Map<string, Session>()
  for (const rs of remote) remoteMap.set(rs.id, rs)

  // Supabase 세션에 로컬 라벨/상태 보완
  const merged: Session[] = remote.map((rs) => {
    const ls = localMap.get(rs.id)
    if (!ls) return rs
    // 로컬에 라벨이 있고 Supabase에 없으면 → 로컬 라벨 채택
    const labels = rs.labels ?? ls.labels
    const labelStatus = rs.labelStatus ?? ls.labelStatus
    if (labels !== rs.labels || labelStatus !== rs.labelStatus) {
      return { ...rs, labels, labelStatus }
    }
    return rs
  })

  // 로컬에만 있는 세션 추가 (아직 Supabase에 업로드 안 됨)
  for (const ls of local) {
    if (!remoteMap.has(ls.id)) merged.push(ls)
  }

  // visibility override 최종 적용 (모든 소스에 대해 안전망)
  const withOverrides = applyVisibilityOverrides(merged)

  // 중복 제거 (같은 파일의 중복 세션 + 구버전 stale 세션)
  const deduped = deduplicateByPath(withOverrides)

  // 중복이 있었으면 정리
  if (deduped.length < withOverrides.length) {
    const validIds = new Set(deduped.map((s) => s.id))
    const staleIds = withOverrides.filter((s) => !validIds.has(s.id)).map((s) => s.id)

    // localStorage에 정리된 데이터 저장
    saveSessionsToLS(deduped)
    // visibility override 정리
    cleanupVisibilityOverrides(validIds)
    // Supabase stale 삭제 — 완료 대기 (다음 로드에서 재유입 방지)
    await cleanupStaleSessions(staleIds)
  }

  // 글로벌 동의 설정 최종 적용 (localStorage + 네이티브 파일 기반)
  // 검증 캐시 패치 최종 적용 (verification cache → consentStatus 복원)
  const result = applyVerificationPatches(await applyGlobalConsent(deduped))

  // LOCKED 세션 자동 보호 (auto_pii_protect ON + 미검토 → REVIEWED + MASK_TEXT_ONLY)
  // 구코드에서 undo 시 LOCKED로 남은 세션을 앱 시작 시 자동 복구
  const autoProtect = localStorage.getItem('uncounted_pii_auto_protect') === 'on'
  if (autoProtect) {
    let needsFix = false
    for (const s of result) {
      if ((s.piiStatus ?? 'CLEAR') === 'LOCKED' && !s.reviewAction) {
        s.reviewAction = 'MASK_TEXT_ONLY'
        s.piiStatus = 'REVIEWED'
        s.eligibleForShare = true
        needsFix = true
      }
    }
    if (needsFix) {
      saveSessionsToLS(result)
      await saveSessionsToApi(result)
    }
  }

  _cachedSessions = result
  return result
}

// ── 저장 — visibility override + Supabase + localStorage + 캐시 갱신 ───────
export async function saveAllSessions(sessions: Session[]): Promise<void> {
  // 저장 전 중복 제거 + 검증 캐시 패치 (다른 코드가 저장해도 검증 상태 보존)
  const uid = getEffectiveUserId()
  // user_id 미설정 세션에 현재 auth user_id 스탬프 (RLS 필수)
  const stamped = uid
    ? sessions.map((s) => (s.userId ? s : { ...s, userId: uid }))
    : sessions
  const clean = applyVerificationPatches(deduplicateByPath(stamped))

  // 인메모리 캐시 즉시 갱신 (탭 이동 시 최신 데이터 반환)
  _cachedSessions = clean

  // 공개 상태 compact 저장 (localStorage, 안전망)
  saveVisibilityOverrides(clean)

  // localStorage 폴백 저장 (오프라인 지원)
  saveSessionsToLS(clean)

  // API 저장 (클라우드 동기화)
  try {
    await saveSessionsToApi(clean)
  } catch (err) {
    console.warn('[saveAllSessions] API 저장 실패, localStorage에는 저장됨:', err)
  }
}
