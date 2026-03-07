import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadAllSessions, invalidateSessionCache } from '../../lib/sessionMapper'
import { type Session } from '../../types/session'
import { resetAll } from '../../lib/resetAll'

type DataRow = { label: string; count: number; icon: string; color: string }

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    invalidateSessionCache()
    loadAllSessions({ skipUserFilter: true }).then(s => {
      setSessions(s)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminDashboard] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [])

  // ── 집계 ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const userIds = new Set(sessions.map(s => s.userId).filter(Boolean))
    const total = sessions.length
    const audioOnly = sessions.filter(s => !s.labels && !s.verifiedSpeaker && s.chunkCount === 0).length
    const hasTranscript = sessions.filter(s => s.chunkCount > 0).length
    const hasVerifiedSpeaker = sessions.filter(s => s.verifiedSpeaker).length
    const fullVersion = sessions.filter(s => s.labels && s.verifiedSpeaker && s.chunkCount > 0 && s.isPublic).length
    const publicCount = sessions.filter(s => s.isPublic).length
    const labeledCount = sessions.filter(s => s.labels !== null).length

    // 업로드 상태
    const uploadDist: Record<string, number> = { LOCAL: 0, QUEUED: 0, UPLOADING: 0, UPLOADED: 0, FAILED: 0 }
    for (const s of sessions) {
      const st = s.uploadStatus ?? 'LOCAL'
      if (st in uploadDist) uploadDist[st]++
      else uploadDist[st] = (uploadDist[st] ?? 0) + 1
    }

    // 품질 등급 (qualityFactor 0~1 → A/B/C)
    const gradeDist: Record<string, number> = { A: 0, B: 0, C: 0, '미측정': 0 }
    for (const s of sessions) {
      const q = s.audioMetrics?.qualityFactor
      if (q == null) { gradeDist['미측정']++; continue }
      if (q >= 0.8) gradeDist['A']++
      else if (q >= 0.6) gradeDist['B']++
      else gradeDist['C']++
    }

    // 최근 7일
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekStr = weekAgo.toISOString().slice(0, 10)
    const recentCount = sessions.filter(s => s.date >= weekStr).length

    // 최근 세션 5건
    const recentSessions = [...sessions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)

    // 총 시간
    const totalHours = sessions.reduce((sum, s) => sum + s.duration, 0) / 3600

    // 오디오 파일 디렉토리 경로 집계
    const audioDirs: [string, number][] = (() => {
      const dirs = new Map<string, number>()
      for (const s of sessions) {
        if (s.callRecordId) {
          const lastSlash = s.callRecordId.lastIndexOf('/')
          const dir = lastSlash > 0 ? s.callRecordId.slice(0, lastSlash) : '(root)'
          dirs.set(dir, (dirs.get(dir) ?? 0) + 1)
        }
      }
      return [...dirs.entries()].sort((a, b) => b[1] - a[1])
    })()

    return {
      userCount: userIds.size,
      total,
      audioOnly,
      hasTranscript,
      hasVerifiedSpeaker,
      fullVersion,
      publicCount,
      labeledCount,
      uploadDist,
      gradeDist,
      recentCount,
      recentSessions,
      totalHours,
      audioDirs,
    }
  }, [sessions])

  async function handleResetAll() {
    if (!confirm('모든 데이터(세션/데이터셋/로그)를 삭제합니다. 계속하시겠습니까?')) return
    if (!confirm('정말 전체 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    setResetting(true)
    try {
      const result = await resetAll()
      const supaRows = Object.entries(result.supabase)
        .map(([t, v]) => `${t}: ${v}`)
        .join('\n')
      alert(`초기화 완료\n\nlocalStorage: ${result.localStorage}개 키 삭제\nIndexedDB: ${result.indexedDB ? '삭제' : '실패'}\nPreferences: ${result.capacitorPreferences}개 삭제\nFiles: ${result.capacitorFiles}개 삭제\n\nSupabase:\n${supaRows}`)
      await new Promise(r => setTimeout(r, 200))
      location.reload()
    } catch (err) {
      alert(`초기화 오류: ${err}`)
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  const heroCards: { label: string; value: string; icon: string }[] = [
    { label: '사용자', value: `${stats.userCount}명`, icon: 'group' },
    { label: '전체 세션', value: `${stats.total.toLocaleString()}건`, icon: 'audio_file' },
    { label: '총 시간', value: `${stats.totalHours.toFixed(1)}h`, icon: 'schedule' },
    { label: '풀버전', value: `${stats.fullVersion.toLocaleString()}건`, icon: 'verified' },
  ]

  const dataRows: DataRow[] = [
    { label: '음성파일만', count: stats.audioOnly, icon: 'mic', color: 'rgba(255,255,255,0.5)' },
    { label: '전사 데이터', count: stats.hasTranscript, icon: 'subtitles', color: '#818cf8' },
    { label: '발화자 검증', count: stats.hasVerifiedSpeaker, icon: 'record_voice_over', color: '#34d399' },
    { label: '풀버전 (라벨+검증+전사+동의)', count: stats.fullVersion, icon: 'verified', color: '#1337ec' },
  ]

  const uploadRows = Object.entries(stats.uploadDist).filter(([, v]) => v > 0)
  const gradeColors: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#ef4444', '미측정': 'rgba(255,255,255,0.3)' }

  return (
    <div className="pb-10">
      {/* ── 핵심 지표 카드 ── */}
      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        {heroCards.map(c => (
          <div
            key={c.label}
            className="rounded-xl p-3.5"
            style={{ backgroundColor: '#1b1e2e' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="material-symbols-outlined text-base" style={{ color: '#1337ec' }}>{c.icon}</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{c.label}</span>
            </div>
            <p className="text-xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── 데이터 완성도 테이블 ── */}
      <section className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-white mb-2">데이터 완성도</h2>
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
          {dataRows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-lg" style={{ color: row.color }}>{row.icon}</span>
                <span className="text-sm text-white">{row.label}</span>
              </div>
              <span className="text-sm font-bold text-white">{row.count.toLocaleString()}건</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 동의/라벨 현황 ── */}
      <section className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-white mb-2">동의 / 라벨</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="공개 동의"
            value={stats.publicCount}
            total={stats.total}
            icon="lock_open"
            color="#22c55e"
          />
          <StatCard
            label="라벨 완료"
            value={stats.labeledCount}
            total={stats.total}
            icon="label"
            color="#818cf8"
          />
        </div>
      </section>

      {/* ── 업로드 상태 ── */}
      <section className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-white mb-2">업로드 상태</h2>
        <div className="rounded-xl p-3.5 flex flex-wrap gap-2" style={{ backgroundColor: '#1b1e2e' }}>
          {uploadRows.length === 0 ? (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>데이터 없음</span>
          ) : (
            uploadRows.map(([status, count]) => (
              <span
                key={status}
                className="text-xs font-medium px-2.5 py-1 rounded-lg"
                style={{
                  backgroundColor: status === 'UPLOADED' ? 'rgba(34,197,94,0.12)' : status === 'FAILED' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                  color: status === 'UPLOADED' ? '#22c55e' : status === 'FAILED' ? '#ef4444' : 'rgba(255,255,255,0.6)',
                }}
              >
                {status} {count.toLocaleString()}
              </span>
            ))
          )}
        </div>
      </section>

      {/* ── 품질 등급 분포 ── */}
      <section className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-white mb-2">품질 등급</h2>
        <div className="rounded-xl p-3.5 flex items-center gap-3" style={{ backgroundColor: '#1b1e2e' }}>
          {Object.entries(stats.gradeDist).map(([grade, count]) => (
            <div key={grade} className="flex items-center gap-1.5">
              <span
                className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded"
                style={{ backgroundColor: `${gradeColors[grade]}20`, color: gradeColors[grade] }}
              >
                {grade}
              </span>
              <span className="text-sm text-white font-medium">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 최근 활동 ── */}
      <section className="px-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">최근 활동</h2>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            최근 7일: {stats.recentCount}건
          </span>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
          {stats.recentSessions.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>세션 없음</span>
            </div>
          ) : (
            stats.recentSessions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => navigate(`/admin/calls`)}
                className="flex items-center justify-between w-full px-4 py-2.5 text-left"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{s.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {s.date} · {Math.round(s.duration / 60)}분
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                  {s.isPublic && (
                    <span className="material-symbols-outlined text-xs" style={{ color: '#22c55e' }}>visibility</span>
                  )}
                  {s.verifiedSpeaker && (
                    <span className="material-symbols-outlined text-xs" style={{ color: '#34d399' }}>record_voice_over</span>
                  )}
                  {s.labels && (
                    <span className="material-symbols-outlined text-xs" style={{ color: '#818cf8' }}>label</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* ── 오디오 파일 위치 ── */}
      {stats.audioDirs.length > 0 && (
      <section className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-white mb-2">오디오 파일 위치</h2>
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1e2e' }}>
          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Android ExternalStorage 기준 경로
            </span>
          </div>
          {stats.audioDirs.map(([dir, count], i) => {
            const fullPath = `/storage/emulated/0/${dir}`
            return (
              <div
                key={dir}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
              >
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-xs text-white font-mono truncate">{fullPath}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {count.toLocaleString()}건
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(fullPath)}
                    className="p-1 rounded"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                  >
                    <span className="material-symbols-outlined text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>content_copy</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      )}

      {/* ── 바로가기 ── */}
      <section className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-white mb-2">바로가기</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '통화 목록', icon: 'call', path: '/admin/calls' },
            { label: 'SKU 스튜디오', icon: 'movie_edit', path: '/admin/studio' },
            { label: '빌드 위자드', icon: 'play_circle', path: '/admin/build' },
            { label: '데이터셋', icon: 'inventory_2', path: '/admin/datasets' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="rounded-xl p-3 flex items-center gap-2.5 text-left transition-colors"
              style={{ backgroundColor: '#1b1e2e' }}
            >
              <span className="material-symbols-outlined text-lg" style={{ color: '#1337ec' }}>{item.icon}</span>
              <span className="text-sm text-white font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 전체 초기화 ── */}
      <div className="px-4 pt-6 pb-4">
        <button
          onClick={handleResetAll}
          disabled={resetting}
          className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <span className="material-symbols-outlined text-base">delete_forever</span>
          {resetting ? '초기화 중...' : '전체 데이터 초기화'}
        </button>
      </div>
    </div>
  )
}

// ── 비율 카드 ────────────────────────────────────────────────────────────────
function StatCard({ label, value, total, icon, color }: {
  label: string; value: number; total: number; icon: string; color: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="rounded-xl p-3.5" style={{ backgroundColor: '#1b1e2e' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-base" style={{ color }}>{icon}</span>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-lg font-bold text-white">{value.toLocaleString()}</p>
        <p className="text-xs font-medium" style={{ color }}>{pct}%</p>
      </div>
      <div className="w-full h-1 rounded-full mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
