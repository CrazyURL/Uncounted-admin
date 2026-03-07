// ── 화자 검증 백그라운드 엔진 ─────────────────────────────────────────────────
// sttEngine/pipelineState 패턴 동일: 모듈 레벨 싱글턴 + useSyncExternalStore
// 페이지 이동해도 검증 계속 진행. 진척률 실시간 구독 가능.

import { useSyncExternalStore } from 'react'
import { type Session, type ConsentStatus } from '../types/session'
import { isEnrolled, verifySession, getVerifiedPaths, getAllCachedPaths, getOutdatedCachePaths, ensureProfileLoaded, ensureVerificationCacheLoaded, reevaluateCachedResults, getHighConfidenceEmbeddings, clearHighConfidenceEmbeddings, augmentReferenceWithEmbeddings, clearUnverifiedCache } from './embeddingEngine'
import { loadAllSessions, saveAllSessions } from './sessionMapper'
import { registerProcessingTask, updateProcessingTask, unregisterProcessingTask } from './processingServiceBridge'

const SERVICE_TASK_ID = 'verification'
const SERVICE_TITLE = '음성 확인 중'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type VerificationState = {
  isRunning: boolean
  done: number
  total: number
  verified: number
  message: string | null
  /** 직전 검증 완료된 세션 ID (페이지별 즉시 반영용) */
  lastVerifiedId: string | null
}

// ── 모듈 상태 ──────────────────────────────────────────────────────────────

let state: VerificationState = {
  isRunning: false,
  done: 0,
  total: 0,
  verified: 0,
  message: null,
  lastVerifiedId: null,
}

let listeners: Array<() => void> = []

function notify() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function getSnapshot(): VerificationState {
  return state
}

// ── 파일 경로 해석 ─────────────────────────────────────────────────────────

function loadFilePaths(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('uncounted_file_paths') ?? '{}')
  } catch {
    return {}
  }
}

function resolveCallRecordId(
  session: Session,
  filePaths: Record<string, string>,
): string | null {
  return session.callRecordId || filePaths[session.id] || null
}

// ── 백그라운드 검증 실행 ───────────────────────────────────────────────────

let _running = false

/** 이미 실행 중이면 무시 (중복 호출 안전). 페이지와 무관하게 끝까지 진행. */
export async function startBackgroundVerification(): Promise<void> {
  if (_running) return

  // localStorage 유실 시 Capacitor Preferences에서 복원
  await ensureProfileLoaded()
  await ensureVerificationCacheLoaded()

  if (!isEnrolled()) {
    state = { ...state, message: '목소리 등록을 먼저 완료해주세요' }
    notify()
    return
  }

  _running = true

  // 임계값 변경 시 기존 캐시 결과 재평가 (오디오 재처리 없이 즉시 반영)
  const reevaluated = reevaluateCachedResults()
  if (reevaluated > 0) {
    console.log(`[verification] reevaluated ${reevaluated} cached results with new threshold`)
  }

  // 구버전 캐시 엔트리 로그 (multi-segment 재처리 대상)
  const outdatedPaths = getOutdatedCachePaths()
  if (outdatedPaths.size > 0) {
    console.log(`[verification] ${outdatedPaths.size} sessions need multi-segment re-processing`)
  }

  let sessions = await loadAllSessions()
  const filePaths = loadFilePaths()

  // ── 검증 캐시 → 세션 패치 (callRecordId 기준 — sessionId 변경에 안전) ──
  // IDB/Supabase에 verifiedSpeaker가 유실되어도 검증 캐시에서 복원
  const verifiedPaths = getVerifiedPaths()
  if (verifiedPaths.size > 0) {
    let patched = false
    sessions = sessions.map((s) => {
      if (s.verifiedSpeaker) return s
      const path = resolveCallRecordId(s, filePaths)
      if (!path || !verifiedPaths.has(path)) return s
      patched = true
      const consent: ConsentStatus =
        s.consentStatus === 'both_agreed' ? 'both_agreed' : 'user_only'
      return { ...s, verifiedSpeaker: true, consentStatus: consent }
    })
    if (patched) {
      await saveAllSessions(sessions)
    }
  }

  const alreadyVerified = sessions.filter((s) => s.verifiedSpeaker).length

  // 이미 검증 시도된 세션(결과 무관)은 재처리하지 않음
  // callRecordId(파일 경로) 기준 — sessionId 변경에 안전
  const cachedPaths = getAllCachedPaths()

  // 전체 세션 중 파일 경로가 있는 것만 카운트 (= 검증 가능 전체)
  const totalWithPath = sessions.filter((s) => resolveCallRecordId(s, filePaths)).length
  // 이미 캐시된(이전 실행에서 처리 완료) 세션 수
  const alreadyCached = cachedPaths.size

  const targets = sessions.filter(
    (s) => {
      if (s.verifiedSpeaker) return false
      const path = resolveCallRecordId(s, filePaths)
      if (!path) return false
      if (cachedPaths.has(path)) return false
      return true
    },
  )

  // Foreground Service 등록 (검증 대상이 있든 없든 서비스 상태 관리)
  await registerProcessingTask(SERVICE_TASK_ID, SERVICE_TITLE, totalWithPath)

  // 검증 대상 없음 — 즉시 완료
  if (targets.length === 0) {
    state = {
      isRunning: false,
      done: totalWithPath,
      total: totalWithPath,
      verified: alreadyVerified,
      message:
        alreadyVerified > 0
          ? `${alreadyVerified.toLocaleString()}건의 세션에서 본인 음성이 확인되었습니다`
          : '검증 대상 세션이 없습니다',
      // 캐시에서 복원된 검증이 있으면 sentinel ID로 설정 → 구독자(AssetsPage 등) 갱신 유도
      lastVerifiedId: alreadyVerified > 0 ? '__cache_restored__' : null,
    }
    _running = false
    await unregisterProcessingTask(SERVICE_TASK_ID)
    notify()
    return
  }

  state = {
    isRunning: true,
    done: alreadyCached,
    total: totalWithPath,
    verified: alreadyVerified,
    message: `음성 확인 중... (${alreadyCached.toLocaleString()}/${totalWithPath.toLocaleString()})`,
    lastVerifiedId: null,
  }
  notify()

  let done = alreadyCached
  let verified = alreadyVerified

  // ── 다단계 점진적 보강 + 실패 세션 재검사 ──────────────────────────────
  // 고신뢰 임베딩이 AUGMENT_TRIGGER개 모일 때마다 reference 보강
  // 보강 직후 이전에 실패한 세션들을 재검사 (캐시 삭제 후 재시도)
  const AUGMENT_TRIGGER = 5
  const MAX_AUGMENT_VECS = 15
  const MAX_AUGMENT_ROUNDS = 5
  let augmentCount = 0

  // 실패 세션 추적 (보강 후 재검사 대상)
  type FailedTarget = { session: Session; callRecordId: string }
  let failedTargets: FailedTarget[] = []

  /** 단일 세션 검증 + 결과 반영 */
  async function verifySingle(
    target: Session,
    callRecordId: string,
  ): Promise<boolean> {
    let isVerified = false
    try {
      const result = await verifySession(target.id, callRecordId)
      isVerified = result.isVerified
    } catch {
      // 개별 실패 — 다음 세션 계속
    }

    if (isVerified) {
      const idx = sessions.findIndex((s) => s.id === target.id)
      if (idx !== -1) {
        const consent: ConsentStatus =
          sessions[idx].consentStatus === 'both_agreed'
            ? 'both_agreed'
            : 'user_only'
        sessions[idx] = {
          ...sessions[idx],
          verifiedSpeaker: true,
          consentStatus: consent,
        }
        verified++
        await saveAllSessions(sessions)
      }
    }
    return isVerified
  }

  /** 보강 시도 → 성공 시 실패 세션 재검사 */
  async function tryAugmentAndRetry(): Promise<void> {
    if (augmentCount >= MAX_AUGMENT_ROUNDS) return
    const highConf = getHighConfidenceEmbeddings()
    if (highConf.size < AUGMENT_TRIGGER) return

    const callVecs = Array.from(highConf.values()).slice(0, MAX_AUGMENT_VECS)
    clearHighConfidenceEmbeddings()

    state = { ...state, message: `참조 음성 보강 중 (${augmentCount + 1}차)... (${callVecs.length}건 통화 임베딩 적용)` }
    notify()

    const ok = augmentReferenceWithEmbeddings(callVecs)
    if (!ok) return

    augmentCount++
    console.log(`[verification] reference augmented (round ${augmentCount}) at ${done}/${totalWithPath} with ${callVecs.length} call embeddings`)

    // 실패 캐시 삭제 → 재검사 가능하게
    if (failedTargets.length > 0) {
      const cleared = clearUnverifiedCache()
      console.log(`[verification] cleared ${cleared} unverified cache entries for retry`)

      state = { ...state, message: `${augmentCount}차 보강 후 실패 세션 재검사 중... (${failedTargets.length.toLocaleString()}건)` }
      notify()

      const retrying = [...failedTargets]
      failedTargets = []

      let retryVerified = 0
      for (const { session: t, callRecordId: crid } of retrying) {
        // 이미 다른 경로로 검증 완료된 세션은 스킵
        if (sessions.find((s) => s.id === t.id)?.verifiedSpeaker) continue

        const ok2 = await verifySingle(t, crid)
        if (ok2) {
          retryVerified++
          state = {
            ...state,
            verified,
            message: `${augmentCount}차 보강 재검사 중... (${retryVerified}건 추가 확인)`,
            lastVerifiedId: t.id,
          }
          notify()
        } else {
          // 여전히 실패 → 다음 보강 때 다시 시도
          failedTargets.push({ session: t, callRecordId: crid })
        }
      }
      if (retryVerified > 0) {
        console.log(`[verification] retry after round ${augmentCount}: ${retryVerified} newly verified`)
      }
    }
  }

  for (const target of targets) {
    const callRecordId = resolveCallRecordId(target, filePaths)
    if (!callRecordId) {
      done++
      continue
    }

    // ── 보강 체크 + 실패 세션 재검사 ──
    await tryAugmentAndRetry()

    // ONNX 임베딩 추출 + 코사인 유사도
    const isVerified = await verifySingle(target, callRecordId)

    if (!isVerified) {
      failedTargets.push({ session: target, callRecordId })
    }

    done++
    const statusMsg = augmentCount > 0
      ? `음성 확인 중 (${augmentCount}차 보강)... (${done.toLocaleString()}/${totalWithPath.toLocaleString()})`
      : `음성 확인 중... (${done.toLocaleString()}/${totalWithPath.toLocaleString()})`
    state = {
      isRunning: true,
      done,
      total: totalWithPath,
      verified,
      message: statusMsg,
      lastVerifiedId: isVerified ? target.id : state.lastVerifiedId,
    }
    notify()
    // 매 10건마다 알림 업데이트 (너무 잦은 IPC 방지)
    if (done % 10 === 0 || done === totalWithPath) {
      updateProcessingTask(SERVICE_TASK_ID, done, totalWithPath, statusMsg)
    }
  }

  // 루프 종료 후 마지막 보강 + 재검사 (남은 고신뢰 임베딩이 충분할 경우)
  await tryAugmentAndRetry()

  // 루프 종료 후 남은 고신뢰 임베딩 정리
  clearHighConfidenceEmbeddings()

  const totalNewlyVerified = verified - alreadyVerified
  state = {
    isRunning: false,
    done: totalWithPath,
    total: totalWithPath,
    verified,
    message:
      totalNewlyVerified > 0
        ? `${totalNewlyVerified.toLocaleString()}건 추가 확인 (총 ${verified.toLocaleString()}건 완료)${augmentCount > 0 ? ` · 참조 보강 ${augmentCount}회 적용` : ''}`
        : `${verified.toLocaleString()}건의 세션에서 본인 음성이 확인되었습니다`,
    lastVerifiedId: state.lastVerifiedId,
  }
  _running = false
  await unregisterProcessingTask(SERVICE_TASK_ID)
  notify()
}

// ── React 훅 ──────────────────────────────────────────────────────────────

export function useVerificationProgress(): VerificationState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** 현재 상태 동기 조회 (React 외부용) */
export function getVerificationSnapshot(): VerificationState {
  return state
}
