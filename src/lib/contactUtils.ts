/**
 * contactUtils.ts — 통화 파일명에서 연락처 이름 추출 & 세션 그룹화
 */

import { type Session } from '../types/session'

export type ContactGroup = {
  id: string             // 연락처 이름 기반 해시 (URL 경로용)
  name: string           // 추출된 연락처 이름
  sessions: Session[]    // 포함된 세션 목록 (최신순 정렬)
  latestDate: string     // 가장 최근 통화 날짜
  totalDuration: number  // 초 단위
  avgQaScore: number
}

/**
 * Samsung 파일명에서 연락처 식별자 추출
 *
 * 지원 패턴:
 *   녹음_김철수_20240629_143834      → "김철수"
 *   녹음_01012345678_20240629_143834 → "01012345678"
 *   녹음_20240629_143834             → "알 수 없음" (식별자 없음)
 *   음성 240629_143834               → "음성 메모"   (연락처 없는 음성메모)
 *   2024-06-29 14.38.34 홍길동       → "홍길동"      (일부 서드파티 앱)
 */
export function extractContactName(title: string): string {
  // 확장자 제거
  const t = title.replace(/\.(m4a|mp3|wav|ogg|3gp|aac|amr|flac)$/i, '')

  // ── 패턴 1: Samsung 통화 녹음 ──────────────────────────────────────────
  // 형식: [녹음|통화|call] [_공백] [식별자] [_공백] YYYYMMDD|YYMMDD [_공백] HHMMSS
  // 식별자 = 연락처명 또는 전화번호
  const callMatch = t.match(
    /^(?:녹음|통화|call)[_ ](.+?)[_ ](\d{6,8})(?:[_ ]\d{4,6})?$/i
  )
  if (callMatch) {
    const id = callMatch[1].replace(/[-_]+/g, ' ').trim()
    // 식별자 자체가 6-8자리 순수 숫자면 날짜/시간 → 연락처 없음
    if (/^\d{6,8}$/.test(id)) return '알 수 없음'
    return id
  }

  // ── 패턴 2: 음성 메모 (연락처 정보 없음) ───────────────────────────────
  // 형식: 음성 YYMMDD_HHMMSS  또는  음성_YYYYMMDD_HHMMSS
  if (/^(?:음성|voice)[_ ]\d{6,8}/i.test(t)) return '음성 메모'

  // ── 패턴 3: 서드파티 앱 / 기타 형식 ─────────────────────────────────────
  // YYYY-MM-DD HH.MM.SS 홍길동 처럼 날짜 뒤에 이름이 오는 경우
  const afterDate = t
    .replace(/\d{4}[-/.]\d{2}[-/.]\d{2}/g, '')   // YYYY-MM-DD
    .replace(/\d{2}[.:]\d{2}(?:[.:]\d{2})?/g, '') // HH:MM:SS
    .replace(/[_ ]\d{6,8}(?:[_ ]\d{4,6})?/g, '')  // _YYYYMMDD_HHMMSS
    .replace(/\d+년\s*\d+월\s*\d+일/g, '')
    .replace(/(오전|오후)\s*\d+시\s*\d+분/g, '')
    .replace(/^(?:음성|전화|통화|voice|call|recording|record|녹음)[_ ]/i, '')
    .replace(/[-_\s]+/g, ' ')
    .trim()

  if (!afterDate) return '알 수 없음'

  // 순수 숫자만 남았으면 전화번호 (7자리 이상이면 표시, 아니면 알 수 없음)
  if (/^[\d\s\-+()]+$/.test(afterDate)) {
    const digits = afterDate.replace(/\D/g, '')
    return digits.length >= 7 ? digits : '알 수 없음'
  }

  return afterDate
}

/** 연락처 이름 → URL-safe ID */
export function contactNameToId(name: string): string {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** 세션 목록을 연락처별로 그룹화 */
export function groupByContact(sessions: Session[]): ContactGroup[] {
  const map = new Map<string, Session[]>()

  for (const s of sessions) {
    const name = extractContactName(s.title)
    const arr = map.get(name) ?? []
    arr.push(s)
    map.set(name, arr)
  }

  return Array.from(map.entries()).map(([name, items]) => {
    const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date))
    const totalDuration = items.reduce((sum, s) => sum + s.duration, 0)
    const avgQaScore = Math.round(items.reduce((sum, s) => sum + (s.qaScore ?? 0), 0) / items.length)
    return {
      id: contactNameToId(name),
      name,
      sessions: sorted,
      latestDate: sorted[0]?.date ?? '',
      totalDuration,
      avgQaScore,
    }
  })
}

export type GroupSortKey = 'date' | 'duration' | 'qa' | 'count'

export function sortGroups(groups: ContactGroup[], key: GroupSortKey): ContactGroup[] {
  return [...groups].sort((a, b) => {
    if (key === 'date') return b.latestDate.localeCompare(a.latestDate)
    if (key === 'duration') return b.totalDuration - a.totalDuration
    if (key === 'qa') return b.avgQaScore - a.avgQaScore
    if (key === 'count') return b.sessions.length - a.sessions.length
    return 0
  })
}
