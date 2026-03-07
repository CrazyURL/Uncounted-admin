import { useEffect, useState, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session, type ConsentStatus } from '../types/session'
import { loadAllSessions, saveAllSessions, getCachedSessions } from '../lib/sessionMapper'
import { scanDeviceAudio, scanWebAudio, formatBytes } from '../lib/scanEngine'
import {
  type ContactGroup,
  type GroupSortKey,
  groupByContact,
  sortGroups,
} from '../lib/contactUtils'
import { loadUserSettings } from '../lib/globalConsent'
import { staggerContainerVariants, fadeSlideVariants } from '../lib/motionTokens'
import { useSttGlobal } from '../lib/sttEngine'
import { useToast } from '../lib/toastContext'
import Illust3D from '../components/domain/Illust3D'

import { maskContactName } from '../lib/displayMask'
import { RELATIONSHIP_OPTIONS } from '../lib/labelOptions'
import { sanitizeAndUpload } from '../lib/audioSanitizer'
import { summarizeConsent, consentStatusIcon, consentStatusLabel } from '../lib/consentEngine'
import { trackFunnel } from '../lib/funnelLogger'
import { useVerificationProgress } from '../lib/verificationEngine'
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

type ScanState = 'loading' | 'empty' | 'scanning' | 'completed'

type ScanInfo = {
  audioCount: number
  totalBytes: number
}

const SORT_OPTIONS: { key: GroupSortKey; label: string }[] = [
  { key: 'date', label: '최신순' },
  { key: 'count', label: '건수순' },
  { key: 'duration', label: '시간순' },
  { key: 'qa', label: '품질순' },
]

// 스캔 유틸리티는 scanEngine.ts에서 import

export default function AssetsPage() {
  const navigate = useNavigate()
  // 캐시 히트 시 즉시 렌더 (탭 전환 딜레이 제거)
  const cached = getCachedSessions()
  const fromCache = !!(cached && cached.length > 0)
  const [scanState, setScanState] = useState<ScanState>(fromCache ? 'completed' : 'loading')
  const [sessions, setSessions] = useState<Session[]>(cached ?? [])
  const [sortKey, setSortKey] = useState<GroupSortKey>('date')
  const [scanInfo, setScanInfo] = useState<ScanInfo | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const settings = loadUserSettings()
  const { showToast } = useToast()
  const [groupRels, setGroupRels] = useState<Record<string, string>>(() => loadGroupRels())
  const [editingRel, setEditingRel] = useState<string | null>(null)
  const sttGlobal = useSttGlobal()
  const [consentFilter, setConsentFilter] = useState<ConsentStatus | null>(null)
  const verifyProgress = useVerificationProgress()

  // 캐시 미스 시에만 비동기 로드 (첫 진입 or 캐시 무효화 후)
  useEffect(() => {
    if (fromCache) return // 이미 캐시에서 초기화됨
    async function init() {
      if (localStorage.getItem('scanPending') === 'true') {
        localStorage.removeItem('scanPending')
      }
      const loaded = await loadAllSessions()
      if (loaded.length > 0) {
        setSessions(loaded)
        setScanState('completed')
      } else {
        setScanState('empty')
      }
    }
    init()
  }, [])

  // 백그라운드 검증 진행 시 세션 목록 갱신
  // verificationEngine이 saveAllSessions()로 _cachedSessions를 이미 업데이트하므로
  // 여기서는 getCachedSessions()에서 최신 데이터를 가져옴
  // verified 카운트 또는 lastVerifiedId 변경 시 갱신 (캐시 복원 포함)
  useEffect(() => {
    if (!verifyProgress.lastVerifiedId && verifyProgress.verified === 0) return
    const cached = getCachedSessions()
    if (cached && cached.length > 0) {
      setSessions(cached)
    }
  }, [verifyProgress.lastVerifiedId, verifyProgress.verified])

  // 관계 라벨 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!editingRel) return
    function handleClick() { setEditingRel(null) }
    const t = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', handleClick) }
  }, [editingRel])

  async function handleScan() {
    if (scanState === 'scanning') return
    setScanError(null)
    setScanInfo(null)
    setScanState('scanning')
    trackFunnel('scan_start')

    try {
      const scanFn = Capacitor.isNativePlatform() ? scanDeviceAudio : scanWebAudio
      const result = await scanFn((p) => {
        setScanInfo({ audioCount: p.found, totalBytes: 0 })
      })

      setScanInfo({ audioCount: result.sessions.length, totalBytes: result.totalBytes })
      setSessions(result.sessions)
      setScanState('completed')
      trackFunnel('scan_complete', { count: result.sessions.length, bytes: result.totalBytes })

      // 백그라운드 Storage 업로드 (UI 비차단)
      uploadToStorageBackground(result.sessions)
    } catch {
      setScanError('스캔 중 오류가 발생했습니다.')
      setScanState('completed')
    }
  }

  async function uploadToStorageBackground(sessions: Session[]) {
    const pending = sessions.filter(s => s.callRecordId && !s.audioUrl)
    if (pending.length === 0) return
    trackFunnel('upload_start', { count: pending.length })

    let uploaded = 0
    for (const s of pending) {
      try {
        const { storagePath } = await sanitizeAndUpload(
          { callRecordId: s.callRecordId, sessionId: s.id },
        )
        if (storagePath) {
          s.audioUrl = storagePath
          uploaded++
        }
      } catch {
        // 개별 실패 무시 — 다음 세션 계속
      }
    }

    if (uploaded > 0) {
      await saveAllSessions(sessions)
      setSessions([...sessions])
      trackFunnel('upload_complete', { uploaded })
      showToast({ message: `${uploaded.toLocaleString()}건 오디오 Storage 업로드 완료`, icon: 'cloud_done' })
    }
  }

  function handleRelChange(contactName: string, rel: string | null) {
    saveGroupRel(contactName, rel)
    setGroupRels(loadGroupRels())
    setEditingRel(null)
  }

  // 동의 필터 적용된 세션 목록
  const filteredSessions = useMemo(() => {
    if (!consentFilter) return sessions
    return sessions.filter((s) => {
      const cs = s.consentStatus ?? 'locked'
      if (consentFilter === 'user_only') return cs === 'user_only' || cs === 'both_agreed'
      if (consentFilter === 'both_agreed') return cs === 'both_agreed'
      return cs === consentFilter
    })
  }, [sessions, consentFilter])

  const orderedGroups = useMemo(() => {
    const groups = sortGroups(groupByContact(filteredSessions), sortKey)
    if (sortKey !== 'date') return groups
    const unknownGroup = groups.find((g) => g.name === '알 수 없음')
    const knownGroups = groups.filter((g) => g.name !== '알 수 없음')
    return [...knownGroups, ...(unknownGroup ? [unknownGroup] : [])]
  }, [filteredSessions, sortKey])

  const publicCount = useMemo(() => sessions.filter((s) => s.isPublic).length, [sessions])
  const privateCount = sessions.length - publicCount
  const [bulkLoading, setBulkLoading] = useState(false)

  async function handleBulkPublic() {
    if (bulkLoading || privateCount === 0) return
    setBulkLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const all = await loadAllSessions()
      let changed = 0
      const patched = all.map((s) => {
        if (s.isPublic) return s
        changed++
        return {
          ...s,
          isPublic: true,
          visibilityStatus: 'PUBLIC_CONSENTED' as Session['visibilityStatus'],
          visibilitySource: 'MANUAL' as Session['visibilitySource'],
          visibilityChangedAt: today,
        }
      })
      if (changed > 0) {
        await saveAllSessions(patched)
        setSessions(patched)
        showToast({ message: `${changed.toLocaleString()}건 일괄 공개 완료`, icon: 'lock_open' })
        trackFunnel('bulk_public', { count: changed })
      }
    } catch {
      showToast({ message: '일괄 공개 중 오류가 발생했습니다', icon: 'error' })
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="min-h-full px-5 py-5" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          {scanState === 'completed'
            ? consentFilter
              ? `${filteredSessions.length.toLocaleString()}개 음성 (필터 적용)`
              : `${orderedGroups.length.toLocaleString()}개 연락처 · ${sessions.length.toLocaleString()}개 음성`
            : scanState === 'loading'
            ? '불러오는 중...'
            : '기기 음성 파일 관리'}
        </p>
        {scanState === 'completed' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
            >
              <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-sub)' }}>refresh</span>
            </button>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as GroupSortKey)}
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
        )}
      </div>

      {/* 로딩 */}
      {scanState === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Illust3D fallback="autorenew" src="/assets/3d/A-4.png" size={72} />
          <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>자산 불러오는 중...</p>
        </div>
      )}

      {/* 빈 상태 */}
      {scanState === 'empty' && (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <Illust3D fallback="shield" src="/assets/3d/D-1.png" size={96} />
          <div className="text-center">
            <p className="font-bold text-2xl font-display" style={{ color: 'var(--color-text)' }}>아직 음성 파일이 없어요</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>녹음 폴더를 스캔하면 오디오 파일을 분석해요</p>
            {scanError && <p className="text-sm mt-3" style={{ color: 'var(--color-danger)' }}>{scanError}</p>}
          </div>
          <button
            onClick={handleScan}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
          >
            <span className="material-symbols-outlined text-xl">folder_open</span>
            {Capacitor.isNativePlatform() ? '기기 오디오 스캔' : '녹음 폴더 선택'}
          </button>
        </div>
      )}

      {/* 스캔 중 */}
      {scanState === 'scanning' && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center overflow-hidden"
            style={{ border: '2px solid var(--color-accent)' }}
          >
            <span className="material-symbols-outlined text-4xl animate-pulse" style={{ color: 'var(--color-accent)' }}>graphic_eq</span>
          </div>
          <div className="text-center">
            <p className="font-bold text-2xl font-display" style={{ color: 'var(--color-text)' }}>스캔 중...</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>오디오 파일을 분석하고 있어요</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: 'var(--color-accent)', animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 완료 — 일괄 동의 + 연락처 그룹 목록 */}
      {scanState === 'completed' && (
        <div className="flex flex-col gap-5">
          {scanError && (
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{scanError}</p>
            </div>
          )}

          {/* 스캔 결과 요약 */}
          {scanInfo && (
            <div className="rounded-2xl px-5 py-5" style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>folder_open</span>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
                  스캔 결과 · {formatBytes(scanInfo.totalBytes)}
                </p>
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="font-extrabold text-[2rem] font-display" style={{ color: 'var(--color-text)' }}>{scanInfo.audioCount.toLocaleString()}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-sub)' }}>녹음 파일</p>
                </div>
                <div className="w-px" style={{ backgroundColor: 'var(--color-border)' }} />
                <div>
                  <p className="font-extrabold text-[2rem] font-display" style={{ color: 'var(--color-text)' }}>{formatBytes(scanInfo.totalBytes)}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-sub)' }}>총 용량</p>
                </div>
              </div>
            </div>
          )}

          {/* ── 동의 유도 CTA (비공개 모드일 때만) ── */}
          {!settings.globalShareConsentEnabled && sessions.length > 0 && (
            <button
              onClick={() => navigate('/profile')}
              className="rounded-xl px-4 py-3 flex items-center gap-3 w-full text-left transition-colors"
              style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }}
            >
              <span
                className="material-symbols-outlined text-xl flex-shrink-0"
                style={{ color: 'var(--color-accent)' }}
              >
                lock_open
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  데이터 공개를 활성화하세요
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                  {sessions.length.toLocaleString()}개 음성 파일을 수익화할 수 있습니다
                </p>
              </div>
              <span
                className="material-symbols-outlined text-base flex-shrink-0"
                style={{ color: 'var(--color-accent)' }}
              >
                chevron_right
              </span>
            </button>
          )}

          {/* 백그라운드 STT 진행 상태 */}
          {sttGlobal.isProcessing && sttGlobal.totalEnqueued > 0 && (
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <span className="material-symbols-outlined text-base animate-spin" style={{ color: 'var(--color-accent)' }}>
                autorenew
              </span>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                  텍스트 추출 중 ({sttGlobal.completedCount.toLocaleString()}/{sttGlobal.totalEnqueued.toLocaleString()})
                </p>
                <div className="mt-1.5 h-1 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${sttGlobal.totalEnqueued > 0 ? Math.round((sttGlobal.completedCount / sttGlobal.totalEnqueued) * 100) : 0}%`,
                      backgroundColor: 'var(--color-accent)',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── 공개 상태 뱃지 + 일괄 공개 ── */}
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={{ color: settings.globalShareConsentEnabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
            >
              {settings.globalShareConsentEnabled ? 'lock_open' : 'lock'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {settings.globalShareConsentEnabled
                  ? `공개 활성 중 — ${publicCount.toLocaleString()}/${sessions.length.toLocaleString()}건`
                  : '비공개 모드'}
              </p>
              {privateCount > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  비공개 {privateCount.toLocaleString()}건 남음
                </p>
              )}
              {privateCount === 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  변경: 내정보 &gt; 데이터 설정
                </p>
              )}
            </div>
            {privateCount > 0 && (
              <button
                onClick={handleBulkPublic}
                disabled={bulkLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors"
                style={
                  bulkLoading
                    ? { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
                    : { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                }
              >
                {bulkLoading && (
                  <span className="material-symbols-outlined text-sm animate-spin">autorenew</span>
                )}
                {bulkLoading ? '처리 중...' : '일괄 공개'}
              </button>
            )}
          </div>

          {/* ── 동의 상태 요약 (음성 판매 가능 여부) — 클릭 시 필터 ── */}
          {(() => {
            const cs = summarizeConsent(sessions)
            return (
              <div
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>gavel</span>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-sub)' }}>음성 데이터 판매 동의</p>
                  {consentFilter && (
                    <button
                      onClick={() => setConsentFilter(null)}
                      className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                    >
                      필터 해제
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <ConsentChip icon="lock" label="메타만" count={cs.locked} total={cs.total} active={consentFilter === 'locked'} onClick={() => setConsentFilter(consentFilter === 'locked' ? null : 'locked')} />
                  <ConsentChip icon="person" label="본인 음성" count={cs.userOnly} total={cs.total} active={consentFilter === 'user_only'} onClick={() => setConsentFilter(consentFilter === 'user_only' ? null : 'user_only')} />
                  <ConsentChip icon="group" label="전체" count={cs.bothAgreed} total={cs.total} active={consentFilter === 'both_agreed'} onClick={() => setConsentFilter(consentFilter === 'both_agreed' ? null : 'both_agreed')} />
                </div>
              </div>
            )
          })()}

          {/* ── 연락처 그룹 목록 ── */}
          <motion.div
            variants={staggerContainerVariants}
            initial={fromCache ? false : 'hidden'}
            animate="visible"
            className="flex flex-col gap-2"
          >
            {orderedGroups.map((group) => (
              <ContactGroupCard
                key={group.id}
                group={group}
                groupRel={groupRels[group.name] ?? null}
                isEditingRel={editingRel === group.name}
                onRelBadgeClick={() => setEditingRel(editingRel === group.name ? null : group.name)}
                onRelChange={(rel) => handleRelChange(group.name, rel)}
                onPress={() => {
                  if (editingRel) {
                    setEditingRel(null)
                  } else {
                    navigate(`/assets/contact/${encodeURIComponent(group.name)}`)
                  }
                }}
              />
            ))}
          </motion.div>

          <button
            onClick={handleScan}
            className="mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm transition-colors"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-sub)', backgroundColor: 'var(--color-surface)' }}
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            다시 스캔
          </button>
        </div>
      )}

    </div>
  )
}

function ConsentChip({ icon, label, count, total, active: isSelected, onClick }: {
  icon: string; label: string; count: number; total: number
  active?: boolean; onClick?: () => void
}) {
  const hasData = count > 0
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 flex-1 min-w-0 rounded-lg px-2 py-1.5 transition-all"
      style={isSelected
        ? { backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }
        : { backgroundColor: 'transparent', border: '1px solid transparent' }
      }
    >
      <span
        className="material-symbols-outlined text-sm"
        style={{ color: hasData ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
      >{icon}</span>
      <div className="min-w-0 text-left">
        <p className="text-[10px] font-medium truncate" style={{ color: hasData ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
          {label}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {count.toLocaleString()}/{total.toLocaleString()}
        </p>
      </div>
    </button>
  )
}

/** 연락처 그룹 내 대표 동의 상태 (가장 낮은 수준) */
function groupConsentStatus(sessions: Session[]): ConsentStatus {
  let hasLocked = false
  let hasUserOnly = false
  for (const s of sessions) {
    const cs = s.consentStatus ?? 'locked'
    if (cs === 'locked') hasLocked = true
    else if (cs === 'user_only') hasUserOnly = true
  }
  if (hasLocked) return 'locked'
  if (hasUserOnly) return 'user_only'
  return 'both_agreed'
}

function deriveGrade(avgQa: number): 'A' | 'B' | 'C' {
  if (avgQa >= 80) return 'A'
  if (avgQa >= 60) return 'B'
  return 'C'
}

function ContactGroupCard({
  group,
  groupRel,
  isEditingRel,
  onRelBadgeClick,
  onRelChange,
  onPress,
}: {
  group: ContactGroup
  groupRel: string | null
  isEditingRel: boolean
  onRelBadgeClick: () => void
  onRelChange: (rel: string | null) => void
  onPress: () => void
}) {
  const isUnknown = group.name === '알 수 없음'
  const grade = deriveGrade(group.avgQaScore)
  const durationMin = Math.round(group.totalDuration / 60)

  return (
    <motion.div variants={fadeSlideVariants} className="relative">
      <button
        onClick={onPress}
        className="flex items-center gap-3 rounded-xl p-4 text-left w-full"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* 관계 라벨 배지 */}
        <div
          role="button"
          onClick={(e) => {
            e.stopPropagation()
            if (!isUnknown) onRelBadgeClick()
          }}
          className="flex-shrink-0 rounded-lg px-2 py-2 text-center min-w-[3rem]"
          style={
            groupRel
              ? { backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)' }
              : isUnknown
                ? { backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-tertiary)' }
                : { backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border)' }
          }
        >
          <span className="text-[10px] font-semibold whitespace-nowrap">
            {groupRel ?? (isUnknown ? '미상' : '미라벨')}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>{maskContactName(group.name)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            {group.sessions.length.toLocaleString()}건 · {group.latestDate}
          </p>
        </div>

        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 mr-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-sub)' }}>
            {durationMin.toLocaleString()}분 · {grade}
          </span>
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {consentStatusIcon(groupConsentStatus(group.sessions))}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {consentStatusLabel(groupConsentStatus(group.sessions))}
            </span>
          </div>
        </div>

        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>chevron_right</span>
      </button>

      {/* 인라인 관계 라벨 선택 드롭다운 */}
      {isEditingRel && !isUnknown && (
        <div
          className="absolute left-0 top-full mt-1 z-30 rounded-xl p-2 flex flex-wrap gap-1.5"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)' }}
        >
          {RELATIONSHIP_OPTIONS.map((rel) => (
            <button
              key={rel}
              onClick={() => onRelChange(groupRel === rel ? null : rel)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                groupRel === rel
                  ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                  : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }
              }
            >
              {rel}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
