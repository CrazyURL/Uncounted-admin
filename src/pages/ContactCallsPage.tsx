import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { type Session } from '../types/session'
import { type VisibilityStatus } from '../types/consent'
import { loadAllSessions, saveAllSessions } from '../lib/sessionMapper'
import { buildConsentVersion } from '../lib/globalConsent'
import { extractContactName } from '../lib/contactUtils'
import { maskContactName } from '../lib/displayMask'
import SessionCard from '../components/domain/SessionCard'

type SortKey = 'date' | 'duration' | 'qa'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date', label: '최신순' },
  { key: 'duration', label: '시간순' },
  { key: 'qa', label: '품질순' },
]

import { RELATIONSHIP_OPTIONS } from '../lib/labelOptions'

const GROUP_RELS_KEY = 'uncounted_group_rels'

function loadGroupRels(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(GROUP_RELS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveGroupRel(contactName: string, rel: string | null) {
  const existing = loadGroupRels()
  if (rel === null) {
    delete existing[contactName]
  } else {
    existing[contactName] = rel
  }
  localStorage.setItem(GROUP_RELS_KEY, JSON.stringify(existing))
}

function sortSessions(sessions: Session[], key: SortKey): Session[] {
  return [...sessions].sort((a, b) => {
    if (key === 'date') return b.date.localeCompare(a.date)
    if (key === 'duration') return b.duration - a.duration
    if (key === 'qa') return (b.qaScore ?? 0) - (a.qaScore ?? 0)
    return 0
  })
}

export default function ContactCallsPage() {
  const { contactName: encodedName } = useParams<{ contactName: string }>()
  const contactName = decodeURIComponent(encodedName ?? '알 수 없음')

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [groupRel, setGroupRel] = useState<string | null>(null)
  const [batchToast, setBatchToast] = useState<string | null>(null)

  // 토스트 자동 닫기
  useEffect(() => {
    if (!batchToast) return
    const t = setTimeout(() => setBatchToast(null), 3000)
    return () => clearTimeout(t)
  }, [batchToast])

  useEffect(() => {
    const rels = loadGroupRels()
    setGroupRel(rels[contactName] ?? null)

    loadAllSessions().then((all) => {
      const filtered = all.filter((s) => extractContactName(s.title) === contactName)
      setSessions(filtered)
      setLoading(false)
    })
  }, [contactName])

  async function handleRelSelect(rel: string) {
    const next = groupRel === rel ? null : rel
    setGroupRel(next)
    saveGroupRel(contactName, next)

    // 해당 연락처의 모든 세션 labels.relationship에 전파
    const all = await loadAllSessions()
    let changed = false
    const updated = all.map((s) => {
      if (extractContactName(s.title) === contactName) {
        changed = true
        return {
          ...s,
          labels: { ...(s.labels ?? {}), relationship: next } as Session['labels'],
        }
      }
      return s
    })
    if (changed) {
      await saveAllSessions(updated)
      // 로컬 세션 목록도 갱신
      setSessions(updated.filter((s) => extractContactName(s.title) === contactName))
    }
  }

  async function handleGroupConsent(enable: boolean) {
    const today = new Date().toISOString().slice(0, 10)
    const consentVer = buildConsentVersion()
    const newStatus: VisibilityStatus = enable ? 'PUBLIC_CONSENTED' : 'PRIVATE'

    const updated = sessions.map((s) => ({
      ...s,
      isPublic: enable,
      visibilityStatus: newStatus,
      visibilitySource: 'GLOBAL_DEFAULT' as const,
      visibilityConsentVersion: enable ? consentVer : null,
      visibilityChangedAt: today,
    }))

    setSessions(updated)
    await saveAllSessions(updated)
    setBatchToast(`${contactName} ${enable ? '공개' : '비공개'} 전환: ${updated.length.toLocaleString()}건`)
  }

  const sorted = sortSessions(sessions, sortKey)
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0)
  const avgQa = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + (s.qaScore ?? 0), 0) / sessions.length)
    : 0
  const publicOnCount = sessions.filter((s) => s.isPublic).length
  const isUnknown = contactName === '알 수 없음'

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 min-h-full" style={{ backgroundColor: 'var(--color-bg)' }}>
        <span className="material-symbols-outlined text-4xl animate-spin" style={{ color: 'var(--color-accent)' }}>autorenew</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>통화 이력 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-full px-5 py-5 flex flex-col gap-5" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 연락처 요약 카드 */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>{maskContactName(contactName)}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{sessions.length.toLocaleString()}건의 통화</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>총 시간</p>
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>{Math.round(totalDuration / 60).toLocaleString()}분</p>
          </div>
          <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>평균 품질</p>
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>{avgQa}</p>
          </div>
          <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>공개 ON</p>
            <p className="font-bold" style={{ color: 'var(--color-accent)' }}>{publicOnCount.toLocaleString()}건</p>
          </div>
        </div>

        {/* 관계 라벨 */}
        {!isUnknown && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>label</span>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>관계 라벨</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>— 전체 통화 공통</p>
              {groupRel && (
                <span
                  className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                >
                  {groupRel}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIP_OPTIONS.map((rel) => {
                const selected = groupRel === rel
                return (
                  <button
                    key={rel}
                    onClick={() => handleRelSelect(rel)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                    style={selected
                      ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                      : { backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text-sub)' }
                    }
                  >
                    {rel}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {groupRel
                ? `"${groupRel}" 선택됨 -- 라벨링 시 자동 입력 -- 세션별 변경 가능`
                : '탭하여 선택 -- 이 연락처의 모든 통화 라벨에 자동 적용됩니다'}
            </p>
          </div>
        )}
      </div>

      {/* 그룹 공개 설정 */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>verified_user</span>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>그룹 공개 설정</p>
          <p className="text-[10px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
            {sessions.filter((s) => s.isPublic).length.toLocaleString()}/{sessions.length.toLocaleString()}건 공개
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleGroupConsent(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs font-semibold transition-colors"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            <span className="material-symbols-outlined text-sm">check_circle</span>
            전체 공개
          </button>
          <button
            onClick={() => handleGroupConsent(false)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs font-semibold transition-colors"
            style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}
          >
            <span className="material-symbols-outlined text-sm">lock</span>
            전체 비공개
          </button>
        </div>
      </div>

      {/* 정렬 + 목록 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>통화 이력</p>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-xs px-3 py-1.5 rounded-lg border focus:outline-none"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-sub)',
            borderColor: 'var(--color-border)',
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 세션 목록 */}
      {sorted.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>통화 기록이 없습니다</p>
      ) : (
        sorted.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))
      )}
      {/* 토스트 */}
      {batchToast && (
        <div
          className="fixed left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-center"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-sub)' }}
        >
          {batchToast}
        </div>
      )}
    </div>
  )
}
