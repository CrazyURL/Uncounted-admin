// ── Global Consent Engine ─────────────────────────────────────────────────────
// 일괄 데이터 공개 동의 설정 CRUD + 적용 로직.
// MANUAL 레코드는 글로벌 토글 변경 시 항상 유지 (정책 고정).

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { batchUpdateSessions } from './api/sessions'
import { getEffectiveUserId } from './auth'
import { idbGet, idbSet } from './idb'
import { type Session } from '../types/session'
import { type VisibilityStatus, type VisibilitySource } from '../types/consent'
import {
  type UserSettings,
  type BatchApplyResult,
  DEFAULT_USER_SETTINGS,
  CURRENT_CONSENT_VERSION,
} from '../types/consent'

const SETTINGS_KEY = 'uncounted_user_settings'
const CONSENT_FLAG_PATH = 'consent_flag.json'

// ── localStorage CRUD ─────────────────────────────────────────────────────────

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? (JSON.parse(raw) as UserSettings) : { ...DEFAULT_USER_SETTINGS }
  } catch {
    return { ...DEFAULT_USER_SETTINGS }
  }
}

export function saveUserSettings(s: UserSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* 용량 초과 무시 */ }
}

// ── Native file consent flag — Android WebView localStorage 비동기 flush 대비 ──
// localStorage는 메모리 버퍼에만 쓰고 디스크 flush를 보장하지 않음.
// 빠른 앱 재시작 시 localStorage 데이터 유실 가능 → 네이티브 파일로 백업.

type ConsentFlag = {
  enabled: boolean
  consentVersion: string | null
  updatedAt: string | null
}

/** 동의 상태를 네이티브 파일에 즉시 저장 (디스크 flush 보장) */
export async function saveConsentFlag(enabled: boolean, settings?: UserSettings): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return
    const flag: ConsentFlag = {
      enabled,
      consentVersion: settings?.consentVersion ?? null,
      updatedAt: settings?.globalShareConsentUpdatedAt ?? new Date().toISOString().slice(0, 10),
    }
    await Filesystem.writeFile({
      path: CONSENT_FLAG_PATH,
      data: JSON.stringify(flag),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
  } catch { /* ignore */ }
}

/** 네이티브 파일에서 동의 상태 복원 */
export async function loadConsentFlag(): Promise<ConsentFlag | null> {
  try {
    if (!Capacitor.isNativePlatform()) return null
    const result = await Filesystem.readFile({
      path: CONSENT_FLAG_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    return JSON.parse(result.data as string) as ConsentFlag
  } catch { return null }
}

// ── IDB consent flag — 가장 신뢰할 수 있는 백업 (세션 7000건 저장/로드 검증됨) ──
const IDB_CONSENT_KEY = 'consent_flag'

/** IDB에 동의 플래그 저장 (세션 저장과 동일 경로 → 검증된 신뢰성) */
export async function saveConsentToIDB(enabled: boolean, settings?: UserSettings): Promise<void> {
  const flag: ConsentFlag = {
    enabled,
    consentVersion: settings?.consentVersion ?? null,
    updatedAt: settings?.globalShareConsentUpdatedAt ?? new Date().toISOString().slice(0, 10),
  }
  await idbSet(IDB_CONSENT_KEY, flag)
}

/** IDB에서 동의 플래그 로드 */
export async function loadConsentFromIDB(): Promise<ConsentFlag | null> {
  return await idbGet<ConsentFlag>(IDB_CONSENT_KEY)
}

// ── 동의 버전 생성 ────────────────────────────────────────────────────────────

export function buildConsentVersion(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `v1-${yyyy}-${mm}`
}

function todayBucket(): string {
  const now = new Date()
  return now.toISOString().slice(0, 10)  // 'YYYY-MM-DD'
}

// ── 신규 세션에 공개 동의 적용 ────────────────────────────────────────────────
// 신규 데이터 생성 시 호출. visibilityStatus, isPublic 자동 설정.

const VOICE_SKUS = new Set(['U-A01', 'U-A02', 'U-A03'])

function matchesJoinedSku(joinedSkus: Set<string>): boolean {
  // 세션의 assetType으로 voice/metadata 구분은 불완전하므로 voice SKU 참여 여부로 판단
  return [...joinedSkus].some((id) => VOICE_SKUS.has(id))
}

export function shouldDefaultPublic(
  _session: Session,
  joinedSkus: Set<string>,
  settings: UserSettings,
): boolean {
  if (!settings.globalShareConsentEnabled) return false
  if (settings.globalShareConsentScope === 'all_skus') return true
  return matchesJoinedSku(joinedSkus)
}

export function applyGlobalConsentToNew(
  session: Session,
  joinedSkus: Set<string>,
  settings: UserSettings,
): Session {
  const pub = shouldDefaultPublic(session, joinedSkus, settings)
  const visibilityStatus: VisibilityStatus = pub ? 'PUBLIC_CONSENTED' : 'PRIVATE'
  const visibilitySource: VisibilitySource = pub ? 'GLOBAL_DEFAULT' : 'SKU_DEFAULT'
  return {
    ...session,
    isPublic: pub,
    visibilityStatus,
    visibilitySource,
    visibilityConsentVersion: pub ? (settings.consentVersion ?? CURRENT_CONSENT_VERSION) : null,
    visibilityChangedAt: todayBucket(),
  }
}

// ── 일괄 적용 (기존 데이터 변경) ─────────────────────────────────────────────
// GLOBAL_DEFAULT 레코드만 변경. MANUAL 레코드는 항상 유지.
// Supabase 없으면 즉시 반환 (호출 측에서 토스트).

type BatchApplyOpts = {
  sessions: Session[]
  newStatus: VisibilityStatus
  joinedSkus: Set<string>
  settings: UserSettings
  onProgress: (done: number, total: number) => void
  cancelled?: { current: boolean }
}

const BATCH_SIZE = 500

export async function batchApplyConsent(opts: BatchApplyOpts): Promise<BatchApplyResult> {
  const { sessions, newStatus, settings, onProgress, cancelled } = opts

  // Supabase 미연결 시 즉시 반환
  if (!import.meta.env.VITE_API_URL) {
    return { updated: 0, skipped: sessions.length, failed: 0 }
  }

  // MANUAL 레코드 제외 (항상 유지 — 정책 고정)
  const targets = sessions.filter((s) => s.visibilitySource !== 'MANUAL')
  const skipped = sessions.length - targets.length
  let updated = 0
  let failed = 0
  const today = todayBucket()
  const consentVer = settings.consentVersion ?? CURRENT_CONSENT_VERSION

  // 500건씩 batch update
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (cancelled?.current) break

    const chunk = targets.slice(i, i + BATCH_SIZE)
    const userId = getEffectiveUserId()
    const rows = chunk.map((s) => ({
      id: s.id,
      is_public: newStatus === 'PUBLIC_CONSENTED',
      visibility_status: newStatus,
      visibility_source: 'GLOBAL_DEFAULT' as VisibilitySource,
      visibility_consent_version: newStatus === 'PUBLIC_CONSENTED' ? consentVer : null,
      visibility_changed_at: today,
      ...(userId ? { user_id: userId } : {}),
    }))

    try {
      const { error } = await batchUpdateSessions(rows)
      if (error) {
        // v2 컬럼 미적용 시 v1 호환 폴백 (is_public만)
        const coreRows = chunk.map((s) => ({
          id: s.id,
          is_public: newStatus === 'PUBLIC_CONSENTED',
        }))
        const { error: e2 } = await batchUpdateSessions(coreRows)
        if (e2) throw e2
      }
      updated += chunk.length
    } catch {
      failed += chunk.length
    }

    onProgress(updated + failed, targets.length)
  }

  return { updated, skipped, failed }
}
