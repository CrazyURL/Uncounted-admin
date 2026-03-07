// ── 배치 자동 라벨링 프로세서 ──────────────────────────────────────────
// groupByContact → 그룹별 통계 → scoreSession → IDB 저장

import { type Session } from '../../types/session'
import { groupByContact, type ContactGroup } from '../contactUtils'
import { idbGet, idbSet } from '../idb'
import { scoreSession, type AutoLabelResult, type GroupStats } from './ruleEngine'
import { loadAllTranscripts } from '../transcriptStore'

// ── 타입 ────────────────────────────────────────────────────────────────

export type BatchProgress = {
  phase: 'grouping' | 'scoring' | 'saving' | 'done'
  done: number
  total: number
}

export type BatchResult = {
  auto: number
  recommended: number
  review: number
  locked: number
  total: number
}

const IDB_KEY = 'auto_label_results'

// ── 그룹 통계 계산 ──────────────────────────────────────────────────────

function calcGroupStats(group: ContactGroup): GroupStats {
  const sessions = group.sessions
  const callCount = sessions.length
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0)
  const avgDuration = callCount > 0 ? totalDuration / callCount : 0

  // 시간대 분석 (날짜 기반 — 정밀 시간 없으므로 파일명에서 추출 시도)
  let weekdayBusinessCount = 0
  let nightWeekendCount = 0

  for (const s of sessions) {
    // 날짜 파싱 (YYYY-MM-DD)
    const d = new Date(s.date)
    const dayOfWeek = d.getDay() // 0=일, 6=토

    // 파일명에서 시간 추출 시도 (녹음_xxx_YYYYMMDD_HHMMSS)
    const timeMatch = s.title.match(/(\d{2})(\d{2})(\d{2})(?:\.\w+)?$/)
    const hour = timeMatch ? parseInt(timeMatch[1], 10) : -1

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isBusinessHour = hour >= 9 && hour < 18
    const isNight = hour >= 19 || (hour >= 0 && hour < 7)

    if (!isWeekend && isBusinessHour) {
      weekdayBusinessCount++
    }
    if (isWeekend || isNight) {
      nightWeekendCount++
    }
  }

  return {
    callCount,
    avgDuration,
    totalDuration,
    weekdayBusinessRatio: callCount > 0 ? weekdayBusinessCount / callCount : 0,
    nightWeekendRatio: callCount > 0 ? nightWeekendCount / callCount : 0,
    latestDate: group.latestDate,
  }
}

// ── 배치 처리 메인 ──────────────────────────────────────────────────────

export async function batchAutoLabel(
  sessions: Session[],
  groupRels: Record<string, string>,
  onProgress: (p: BatchProgress) => void,
  cancelled: { current: boolean },
): Promise<{ results: Map<string, AutoLabelResult>; summary: BatchResult }> {
  const results = new Map<string, AutoLabelResult>()
  const summary: BatchResult = { auto: 0, recommended: 0, review: 0, locked: 0, total: 0 }

  // Phase 0: 트랜스크립트 캐시 로드 (STT 텍스트 → 키워드 매칭용)
  const transcripts = await loadAllTranscripts()

  // Phase 1: 그룹핑
  onProgress({ phase: 'grouping', done: 0, total: sessions.length })
  const groups = groupByContact(sessions)

  // 세션ID → 그룹 매핑
  const sessionGroupMap = new Map<string, { group: ContactGroup; stats: GroupStats }>()
  for (const group of groups) {
    const stats = calcGroupStats(group)
    for (const s of group.sessions) {
      sessionGroupMap.set(s.id, { group, stats })
    }
  }

  // Phase 2: 스코어링
  const total = sessions.length
  onProgress({ phase: 'scoring', done: 0, total })

  for (let i = 0; i < total; i++) {
    if (cancelled.current) break

    const session = sessions[i]
    const mapping = sessionGroupMap.get(session.id)
    const displayName = mapping?.group.name ?? '알 수 없음'
    const stats: GroupStats = mapping?.stats ?? {
      callCount: 1,
      avgDuration: session.duration,
      totalDuration: session.duration,
      weekdayBusinessRatio: 0,
      nightWeekendRatio: 0,
      latestDate: session.date,
    }
    const existingRel = groupRels[displayName] ?? null

    const result = scoreSession(session, displayName, stats, existingRel, transcripts[session.id])
    results.set(session.id, result)

    switch (result.labelStatus) {
      case 'AUTO': summary.auto++; break
      case 'RECOMMENDED': summary.recommended++; break
      case 'REVIEW': summary.review++; break
      case 'LOCKED': summary.locked++; break
    }
    summary.total++

    if (i % 100 === 0 || i === total - 1) {
      onProgress({ phase: 'scoring', done: i + 1, total })
    }
  }

  if (cancelled.current) {
    return { results, summary }
  }

  // Phase 3: IDB 저장
  onProgress({ phase: 'saving', done: 0, total: results.size })
  await saveAutoLabelResults(results)
  onProgress({ phase: 'done', done: results.size, total: results.size })

  return { results, summary }
}

// ── IDB 저장/로드 ───────────────────────────────────────────────────────

export async function saveAutoLabelResults(results: Map<string, AutoLabelResult>): Promise<void> {
  const obj: Record<string, AutoLabelResult> = {}
  for (const [k, v] of results) {
    obj[k] = v
  }
  await idbSet(IDB_KEY, obj)
}

export async function loadAutoLabelResults(): Promise<Map<string, AutoLabelResult>> {
  const obj = await idbGet<Record<string, AutoLabelResult>>(IDB_KEY)
  if (!obj) return new Map()
  return new Map(Object.entries(obj))
}

import { REL_EN_TO_KO, DOMAIN_EN_TO_KO } from '../labelOptions'
// normalizeLabel은 labelOptions.ts에서 제공 (barrel export via index.ts)

// ── 세션에 라벨 결과 적용 ───────────────────────────────────────────────

export function applyAutoLabelToSession(
  session: Session,
  result: AutoLabelResult,
): Session {
  // 이미 사용자가 확정한 세션은 자동 라벨로 덮어씌우지 않음
  if (session.labelStatus === 'CONFIRMED') return session

  const avgConf = Math.round(((result.relConfidence + result.domConfidence) / 2) * 100) / 100

  return {
    ...session,
    labelStatus: result.labelStatus === 'LOCKED' ? 'LOCKED' : result.labelStatus,
    labelSource: 'auto',
    labelConfidence: avgConf,
    // v2: labels에 자동 추론 결과 병합 (기존 수동 라벨 우선 유지)
    labels: {
      relationship: session.labels?.relationship ?? REL_EN_TO_KO[result.relationship] ?? null,
      domain: session.labels?.domain ?? DOMAIN_EN_TO_KO[result.domain] ?? null,
      purpose: session.labels?.purpose ?? result.purpose ?? null,
      tone: session.labels?.tone ?? result.tone ?? null,
      noise: session.labels?.noise ?? result.noise ?? null,
    },
  }
}
