import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { type QualityGrade } from '../../types/dataset'
import { loadProfile, type UserProfile } from '../../types/userProfile'
import { loadAllSessions, invalidateSessionCache } from '../../lib/sessionMapper'
import { getEffectiveUserId } from '../../lib/auth'
import { formatWonShort } from '../../lib/earnings'
import { calcValueBreakdown } from '../../lib/valueEngine'
import { deriveUnitsWithAccumulation, summarizeUnits } from '../../lib/billableUnitEngine'
import {
  calcDatasetSummary,
  calcSkuBreakdown,
  isSessionPublic,
} from '../../lib/adminHelpers'
import { saveDataset } from '../../lib/datasetStore'
import { generateUUID } from '../../lib/uuid'
import AdminSessionRow from '../../components/domain/AdminSessionRow'
import DatasetCreateModal from '../../components/domain/DatasetCreateModal'

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#f59e0b',
  C: '#ef4444',
}

export default function AdminUserDetailPage() {
  const { userId: rawUserId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)

  const userId = rawUserId === '__null__' ? null : rawUserId ?? null

  useEffect(() => {
    invalidateSessionCache()
    loadAllSessions({ skipUserFilter: true }).then(sessions => {
      setAllSessions(sessions)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminUserDetail] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  const userSessions = useMemo(
    () => allSessions.filter(s => (s.userId ?? null) === userId),
    [allSessions, userId],
  )

  const summary = useMemo(() => calcDatasetSummary(userSessions), [userSessions])
  const skuBreakdown = useMemo(() => calcSkuBreakdown(userSessions), [userSessions])

  // 정산 관련 계산
  const publicSessions = useMemo(() => userSessions.filter(isSessionPublic), [userSessions])
  const publicHours = useMemo(
    () => publicSessions.reduce((sum, s) => sum + s.duration, 0) / 3600,
    [publicSessions],
  )

  // BU 산정
  const buResult = useMemo(
    () => deriveUnitsWithAccumulation(userSessions),
    [userSessions],
  )
  const buSummary = useMemo(
    () => summarizeUnits(buResult.units),
    [buResult.units],
  )

  // 판매 적격: 공개 + 라벨 완료 + 품질 B 이상
  const eligibleSessions = useMemo(
    () => publicSessions.filter(s =>
      s.labels !== null && (s.qaScore ?? 0) >= 60,
    ),
    [publicSessions],
  )
  const eligibleHours = useMemo(
    () => eligibleSessions.reduce((sum, s) => sum + s.duration, 0) / 3600,
    [eligibleSessions],
  )

  // valueEngine으로 정산 예상 범위 (BU 기반)
  const valuation = useMemo(
    () => calcValueBreakdown(publicSessions, 0.8, publicSessions.length > 0, {
      buEffectiveHours: buSummary.totalEffectiveHours,
      buCount: buSummary.total,
      pendingSeconds: buResult.pendingBalance.pendingSeconds,
    }),
    [publicSessions, buSummary, buResult.pendingBalance.pendingSeconds],
  )

  const isLocalUser = userId !== null && userId === getEffectiveUserId()
  const localProfile: UserProfile | null = isLocalUser ? loadProfile() : null

  const dateRange = useMemo(() => {
    if (userSessions.length === 0) return null
    const dates = userSessions.map(s => s.date).sort()
    return { first: dates[0], last: dates[dates.length - 1] }
  }, [userSessions])

  const displayId = userId
    ? userId.length > 12 ? `${userId.slice(0, 8)}...${userId.slice(-4)}` : userId
    : '미인증 사용자'

  const selectedSessions = useMemo(
    () => userSessions.filter(s => selectedIds.has(s.id)),
    [userSessions, selectedIds],
  )

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === userSessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(userSessions.map(s => s.id)))
    }
  }

  function handleCreate(name: string, description: string) {
    const now = new Date().toISOString()
    const dataset = {
      id: generateUUID(),
      name,
      description,
      sessionIds: [...selectedIds],
      status: 'draft' as const,
      filters: {
        domains: [],
        qualityGrades: [] as QualityGrade[],
        labelStatus: 'all' as const,
        publicStatus: 'all' as const,
        piiCleanedOnly: false,
        hasAudioUrl: false,
        diarizationStatus: 'all' as const,
        transcriptStatus: 'all' as const,
        dateRange: null,
        uploadStatuses: [],
      },
      createdAt: now,
      updatedAt: now,
      exportedAt: null,
    }
    saveDataset(dataset)
    setShowCreate(false)
    setSelectedIds(new Set())
    navigate(`/admin/datasets/${dataset.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="pb-28">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4 space-y-4">
        {/* 사용자 정보 헤더 */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(19,55,236,0.15)' }}
            >
              <span className="material-symbols-outlined text-xl" style={{ color: '#1337ec' }}>
                person
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{displayId}</p>
              {userId && (
                <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {userId}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>{userSessions.length}건 세션</span>
            {dateRange && (
              <>
                <span>첫: {dateRange.first}</span>
                <span>최근: {dateRange.last}</span>
              </>
            )}
          </div>

          {isLocalUser && (
            <div
              className="mt-2 px-2 py-1 rounded text-[10px] inline-flex items-center gap-1"
              style={{ backgroundColor: 'rgba(19,55,236,0.1)', color: '#1337ec' }}
            >
              <span className="material-symbols-outlined text-xs">smartphone</span>
              로컬 사용자 (이 디바이스)
            </div>
          )}
        </div>

        {/* 프로필 정보 (로컬 사용자만) */}
        {localProfile && (
          <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-2.5" style={{ color: 'rgba(255,255,255,0.5)' }}>화자 프로필</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                { label: '연령대', value: localProfile.age_band },
                { label: '성별', value: localProfile.gender },
                { label: '지역', value: localProfile.region_group },
                { label: '억양', value: localProfile.accent_group },
                { label: '화법', value: localProfile.speech_style },
                { label: '언어', value: localProfile.primary_language },
                { label: '환경', value: localProfile.common_env },
                { label: '기기 모드', value: localProfile.common_device_mode },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.label}</span>
                  <span className="text-xs text-white">{item.value ?? '-'}</span>
                </div>
              ))}
            </div>
            {localProfile.domain_mix.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {localProfile.domain_mix.map(d => (
                  <span
                    key={d}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!isLocalUser && userId !== null && (
          <div className="rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
            <span className="material-symbols-outlined text-base" style={{ color: 'rgba(255,255,255,0.25)' }}>info</span>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              프로필 정보 없음 (로컬 전용 데이터)
            </p>
          </div>
        )}

        {/* ── 정산 예상 범위 ── */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-base" style={{ color: '#1337ec' }}>payments</span>
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>정산 예상 (조건부)</p>
          </div>

          {publicSessions.length > 0 ? (
            <>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-xl font-bold text-white">
                  {formatWonShort(valuation.range.low)}
                </span>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>~</span>
                <span className="text-xl font-bold text-white">
                  {formatWonShort(valuation.range.high)}
                </span>
                <span className="text-xs ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>원</span>
              </div>

              <div className="flex items-center gap-3 text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span>{valuation.buCount > 0 ? `${valuation.buCount.toLocaleString()} BU` : `유효 ${valuation.usableHours}h`}</span>
                <span>품질 {valuation.qualityGrade} (x{valuation.qualityMultiplier})</span>
                <span>라벨 x{valuation.labelMultiplierRange.min}~{valuation.labelMultiplierRange.max}</span>
              </div>

              {valuation.conditions.length > 0 && (
                <div className="space-y-1">
                  {valuation.conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-xs mt-0.5" style={{ color: '#f59e0b' }}>warning</span>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              공개 동의 세션 없음 — 정산 대상 없음
            </p>
          )}
        </div>

        {/* ── 기여 요약 (정산 핵심) ── */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: '총 기여',
              main: `${summary.totalDurationHours.toFixed(1)}h`,
              sub: `${summary.sessionCount}건`,
              icon: 'schedule',
            },
            {
              label: '공개 동의',
              main: `${publicSessions.length}건`,
              sub: `${publicHours.toFixed(1)}h`,
              icon: 'visibility',
              color: publicSessions.length > 0 ? '#22c55e' : undefined,
            },
            {
              label: '판매 적격',
              main: `${eligibleSessions.length}건`,
              sub: `${eligibleHours.toFixed(1)}h`,
              icon: 'verified',
              color: eligibleSessions.length > 0 ? '#1337ec' : undefined,
            },
            {
              label: '라벨 완성',
              main: `${Math.round(summary.labeledRatio * 100)}%`,
              sub: `${summary.labeledCount}/${summary.sessionCount}`,
              icon: 'label',
            },
          ].map(item => (
            <div
              key={item.label}
              className="rounded-xl p-3"
              style={{ backgroundColor: '#1b1e2e' }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ color: item.color ?? 'rgba(255,255,255,0.3)' }}
                >
                  {item.icon}
                </span>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</p>
              </div>
              <p className="text-base font-bold text-white">{item.main}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.sub}</p>
            </div>
          ))}
        </div>

        {/* ── 정산 조건 체크리스트 ── */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>정산 조건 충족 현황</p>
          <div className="space-y-2">
            {[
              {
                label: '공개 동의 완료',
                ok: publicSessions.length > 0,
                detail: publicSessions.length > 0
                  ? `${publicSessions.length}건 공개`
                  : '공개 동의 세션 없음',
              },
              {
                label: '라벨링 완료 (50% 이상)',
                ok: summary.labeledRatio >= 0.5,
                detail: `${Math.round(summary.labeledRatio * 100)}% 완료`,
              },
              {
                label: '품질 등급 B 이상',
                ok: (summary.avgQaScore ?? 0) >= 60,
                detail: `평균 ${summary.avgQaScore}점 (${valuation.qualityGrade}등급)`,
              },
              {
                label: 'PII 비식별 처리',
                ok: userSessions.some(s => s.isPiiCleaned),
                detail: `${userSessions.filter(s => s.isPiiCleaned).length}건 처리됨`,
              },
              {
                label: '오디오 파일 업로드',
                ok: userSessions.some(s => s.uploadStatus === 'UPLOADED'),
                detail: `${userSessions.filter(s => s.uploadStatus === 'UPLOADED').length}건 업로드`,
              },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2.5">
                <span
                  className="material-symbols-outlined text-base"
                  style={{ color: item.ok ? '#22c55e' : 'rgba(255,255,255,0.15)' }}
                >
                  {item.ok ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white">{item.label}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SKU 기여 현황 ── */}
        {skuBreakdown.length > 0 && (
          <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>SKU별 기여</p>
            <div className="space-y-2">
              {skuBreakdown.map(sku => (
                <div key={sku.skuId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-mono font-medium"
                      style={{
                        backgroundColor: sku.category === 'voice' ? 'rgba(19,55,236,0.15)' : 'rgba(245,158,11,0.15)',
                        color: sku.category === 'voice' ? '#1337ec' : '#f59e0b',
                      }}
                    >
                      {sku.skuId}
                    </span>
                    <span className="text-xs text-white">{sku.nameKo}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {sku.count}건
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {sku.totalHours.toFixed(1)}h
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 품질 분포 ── */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>품질 분포</p>
            <div className="flex gap-3">
              {(['A', 'B', 'C'] as const).map(g => {
                const count = summary.qualityDistribution[g] ?? 0
                return (
                  <div key={g} className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: GRADE_COLORS[g] }}>{g}</span>
                    <span className="text-sm text-white font-medium">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>동의 비율</p>
            <div className="flex items-end gap-1">
              <span className="text-lg font-bold text-white">
                {userSessions.length > 0 ? Math.round(publicSessions.length / userSessions.length * 100) : 0}%
              </span>
              <span className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                공개 {publicSessions.length}/{userSessions.length}
              </span>
            </div>
          </div>
        </div>

        {/* ── 세션 목록 ── */}
        <div>
          <div
            className="flex items-center justify-between py-2 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center border"
                style={{
                  borderColor: selectedIds.size === userSessions.length && userSessions.length > 0 ? '#1337ec' : 'rgba(255,255,255,0.2)',
                  backgroundColor: selectedIds.size === userSessions.length && userSessions.length > 0 ? '#1337ec' : 'transparent',
                }}
              >
                {selectedIds.size === userSessions.length && userSessions.length > 0 && (
                  <span className="material-symbols-outlined text-white text-xs">check</span>
                )}
              </div>
              전체 선택
            </button>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {userSessions.length}건
            </span>
          </div>

          {userSessions.map(session => (
            <AdminSessionRow
              key={session.id}
              session={session}
              selected={selectedIds.has(session.id)}
              onToggle={toggleSelect}
            />
          ))}

          {userSessions.length === 0 && (
            <div className="flex flex-col items-center py-12">
              <span className="material-symbols-outlined text-3xl mb-2" style={{ color: 'rgba(255,255,255,0.15)' }}>
                search_off
              </span>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                이 사용자의 세션이 없습니다
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* 플로팅 액션 바 */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between border-t"
          style={{
            backgroundColor: '#1b1e2e',
            borderColor: 'rgba(255,255,255,0.08)',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <span className="text-sm text-white font-medium">
            {selectedIds.size}건 선택됨
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5"
            style={{ backgroundColor: '#1337ec' }}
          >
            <span className="material-symbols-outlined text-base">add_box</span>
            데이터셋 생성
          </button>
        </div>
      )}

      {/* 생성 모달 */}
      <DatasetCreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        sessions={selectedSessions}
        filters={{
          domains: [],
          qualityGrades: [],
          labelStatus: 'all',
          publicStatus: 'all',
          piiCleanedOnly: false,
          hasAudioUrl: false,
          diarizationStatus: 'all',
          transcriptStatus: 'all',
          dateRange: null,
          uploadStatuses: [],
        }}
        onCreate={handleCreate}
      />
    </div>
  )
}
