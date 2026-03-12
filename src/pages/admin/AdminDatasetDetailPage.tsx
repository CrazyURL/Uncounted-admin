import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type Session } from '../../types/session'
import { type Dataset, type DatasetStatus, type ExportFieldSelection } from '../../types/dataset'
import { loadAllSessions, invalidateSessionCache, saveAllSessions } from '../../lib/sessionMapper'
import { maskSessionTitle } from '../../lib/displayMask'
import { getDatasetById, saveDataset, deleteDataset } from '../../lib/datasetStore'
import {
  calcDatasetSummary,
  calcSkuBreakdown,
  calcLabelCoverage,
  qualityGradeFromScore,
  isSessionPublic,
  exportAsJson,
  exportAsJsonl,
  exportAudioManifest,
  exportAsCsv,
  downloadBlob,
  exportSanitizedWavs,
  exportTranscriptJsonl,
  exportWavWithTranscript,
  type WavExportProgress,
} from '../../lib/adminHelpers'
import { formatDuration } from '../../lib/earnings'
import { useToast } from '../../lib/toastContext'
import ExportOptionsPanel from '../../components/domain/ExportOptionsPanel'

const STATUS_FLOW: DatasetStatus[] = ['draft', 'finalized', 'exported']
const STATUS_LABELS: Record<DatasetStatus, string> = {
  draft: '초안',
  finalized: '확정',
  exported: '추출됨',
}
const STATUS_COLORS: Record<DatasetStatus, { color: string; bg: string }> = {
  draft: { color: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.08)' },
  finalized: { color: '#1337ec', bg: 'rgba(19,55,236,0.15)' },
  exported: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
}

export default function AdminDatasetDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [wavProgress, setWavProgress] = useState<WavExportProgress | null>(null)
  const wavCancelledRef = useState(() => ({ current: false }))[0]

  useEffect(() => {
    if (!datasetId) return
    const ds = getDatasetById(datasetId)
    setDataset(ds)
    if (ds) {
      setEditName(ds.name)
      setEditDesc(ds.description)
    }
    invalidateSessionCache()
    loadAllSessions({ skipUserFilter: true }).then(sessions => {
      setAllSessions(sessions)
      setLoading(false)
    }).catch(err => {
      console.error('[AdminDatasetDetail] loadAllSessions failed:', err)
      setLoading(false)
    })
  }, [datasetId])

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>()
    for (const s of allSessions) map.set(s.id, s)
    return map
  }, [allSessions])

  const datasetSessions = useMemo(() => {
    if (!dataset) return []
    return dataset.sessionIds
      .map(id => sessionMap.get(id))
      .filter((s): s is Session => s !== undefined)
  }, [dataset, sessionMap])

  const summary = useMemo(() => calcDatasetSummary(datasetSessions), [datasetSessions])
  const skuBreakdown = useMemo(() => calcSkuBreakdown(datasetSessions), [datasetSessions])
  const publicCount = useMemo(() => datasetSessions.filter(isSessionPublic).length, [datasetSessions])
  const labelCoverage = useMemo(() => calcLabelCoverage(datasetSessions), [datasetSessions])

  const missingCount = dataset
    ? dataset.sessionIds.length - datasetSessions.length
    : 0

  function updateDataset(patch: Partial<Dataset>) {
    if (!dataset) return
    const updated = { ...dataset, ...patch, updatedAt: new Date().toISOString() }
    saveDataset(updated)
    setDataset(updated)
  }

  function handleRemoveSession(sessionId: string) {
    if (!dataset) return
    updateDataset({ sessionIds: dataset.sessionIds.filter(id => id !== sessionId) })
  }

  function handleStatusAdvance() {
    if (!dataset) return
    const idx = STATUS_FLOW.indexOf(dataset.status)
    if (idx < STATUS_FLOW.length - 1) {
      const next = STATUS_FLOW[idx + 1]
      const patch: Partial<Dataset> = { status: next }
      if (next === 'exported') patch.exportedAt = new Date().toISOString()
      updateDataset(patch)
    }
  }

  function handleSaveEdit() {
    updateDataset({ name: editName.trim(), description: editDesc.trim() })
    setEditing(false)
  }

  async function handleExport(type: string, fieldSelection: ExportFieldSelection) {
    if (!dataset) return
    const name = dataset.name
    switch (type) {
      case 'json':
        downloadBlob(exportAsJson(dataset, datasetSessions, fieldSelection), `${name}.json`, 'application/json')
        break
      case 'jsonl':
        downloadBlob(exportAsJsonl(datasetSessions, fieldSelection), `${name}.jsonl`, 'application/x-ndjson')
        break
      case 'csv':
        downloadBlob(exportAsCsv(datasetSessions, fieldSelection), `${name}.csv`, 'text/csv;charset=utf-8')
        break
      case 'audio':
        downloadBlob(exportAudioManifest(datasetSessions, fieldSelection), `${name}_audio.csv`, 'text/csv;charset=utf-8')
        break
      case 'wav':
        handleWavExport()
        break
      case 'transcript': {
        const { jsonl, count, error } = await exportTranscriptJsonl(datasetSessions)
        if (error) {
          showToast({ message: `자막 내보내기 오류: ${error}` })
        } else if (count === 0) {
          showToast({ message: '자막이 있는 세션이 없습니다' })
        } else {
          downloadBlob(jsonl, `${name}_transcript.jsonl`, 'application/x-ndjson')
          showToast({ message: `${count}건 자막 내보내기 완료` })
        }
        break
      }
      case 'wav+transcript': {
        const cancelRef = { current: false }
        const result = await exportWavWithTranscript(
          datasetSessions,
          (done, total) => console.log(`[wav+transcript] ${done}/${total}`),
          cancelRef,
        )
        showToast({ message: `WAV+자막 ZIP: ${result.processed}건 처리 (음성없음: ${result.noAudio}, 자막없음: ${result.noTranscript})` })
        break
      }
    }
    setShowExport(false)
  }

  async function handleWavExport() {
    wavCancelledRef.current = false
    setWavProgress({ done: 0, total: datasetSessions.length, phase: 'starting', currentSessionId: null })
    try {
      const r = await exportSanitizedWavs(datasetSessions, setWavProgress, wavCancelledRef)

      // Storage 업로드로 audioUrl이 갱신된 세션 저장
      if (r.processed > 0) {
        await saveAllSessions(allSessions)
      }

      if (wavCancelledRef.current) {
        showToast({ message: 'WAV 추출이 취소되었습니다', icon: 'cancel' })
      } else if (r.processed > 0) {
        const extra = r.failed > 0 ? ` · ${r.failed}건 실패` : ''
        showToast({ message: `${r.processed}건 저장 완료 (Download/uncounted_wav)${extra}`, icon: 'check_circle' })
      } else if (r.eligible === 0) {
        showToast({ message: `오디오 경로 없음 (callRecordId·audioUrl 모두 없는 세션 ${r.noAudio}건)`, icon: 'warning', duration: 5000 })
      } else {
        showToast({ message: `${r.eligible}건 모두 실패: ${r.firstError ?? '알 수 없는 오류'}`, icon: 'error', duration: 5000 })
      }
    } catch (err) {
      showToast({ message: `WAV 추출 오류: ${err instanceof Error ? err.message : String(err)}`, icon: 'error', duration: 5000 })
    }
    setWavProgress(null)
  }

  function handleDelete() {
    if (!dataset) return
    deleteDataset(dataset.id)
    navigate('/admin/datasets')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1337ec', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <span className="material-symbols-outlined text-4xl mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          error_outline
        </span>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          데이터셋을 찾을 수 없습니다
        </p>
        <button
          onClick={() => navigate('/admin/datasets')}
          className="mt-4 text-sm"
          style={{ color: '#1337ec' }}
        >
          목록으로 돌아가기
        </button>
      </div>
    )
  }

  const statusConf = STATUS_COLORS[dataset.status]
  const canAdvance = STATUS_FLOW.indexOf(dataset.status) < STATUS_FLOW.length - 1

  return (
    <div className="pb-28">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4 space-y-4">
        {/* 헤더 */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
          {editing ? (
            <div className="space-y-2">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none"
                style={{ backgroundColor: '#101322', borderColor: 'rgba(255,255,255,0.1)' }}
              />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none resize-none"
                style={{ backgroundColor: '#101322', borderColor: 'rgba(255,255,255,0.1)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ backgroundColor: '#1337ec' }}
                >
                  저장
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs px-3 py-1.5"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 mr-2">
                  <h2 className="text-base font-bold text-white">{dataset.name}</h2>
                  {dataset.description && (
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {dataset.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: statusConf.bg, color: statusConf.color }}
                >
                  {STATUS_LABELS[dataset.status]}
                </span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  생성: {dataset.createdAt.slice(0, 10)}
                </span>
                {dataset.exportedAt && (
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    추출: {dataset.exportedAt.slice(0, 10)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '세션', value: `${summary.sessionCount}` },
            { label: '총 시간', value: `${summary.totalDurationHours.toFixed(1)}h` },
            { label: '품질', value: `${summary.avgQaScore}점` },
            { label: '공개동의', value: `${publicCount}` },
          ].map(item => (
            <div
              key={item.label}
              className="rounded-lg p-2.5 text-center"
              style={{ backgroundColor: '#1b1e2e' }}
            >
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</p>
              <p className="text-sm font-bold text-white mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>

        {/* SKU 분류 */}
        {skuBreakdown.length > 0 && (
          <div className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>SKU 적합성</p>
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

        {/* 등급 + 라벨 분포 */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>품질 분포</p>
            <div className="flex gap-3">
              {(['A', 'B', 'C'] as const).map(g => {
                const count = summary.qualityDistribution[g] ?? 0
                const color = g === 'A' ? '#22c55e' : g === 'B' ? '#f59e0b' : '#ef4444'
                return (
                  <div key={g} className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color }}>{g}</span>
                    <span className="text-sm text-white font-medium">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: '#1b1e2e' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              라벨 현황 ({summary.labeledCount}/{summary.sessionCount})
            </p>
            <div className="space-y-1.5">
              {labelCoverage.fields.map(f => (
                <div key={f.field} className="flex items-center gap-2">
                  <span className="text-[10px] w-8 text-right" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {f.labelKo}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(f.fillRate * 100)}%`,
                        backgroundColor: f.fillRate >= 0.8 ? '#22c55e' : f.fillRate >= 0.5 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-[10px] w-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {Math.round(f.fillRate * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 경고 */}
        {missingCount > 0 && (
          <div className="rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
            <span className="material-symbols-outlined text-base" style={{ color: '#f59e0b' }}>warning</span>
            <p className="text-xs" style={{ color: '#f59e0b' }}>
              {missingCount}건의 세션이 삭제되었거나 비공개로 전환되었습니다
            </p>
          </div>
        )}

        {/* 세션 목록 */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
            세션 ({datasetSessions.length})
          </p>
          <div className="space-y-1">
            {datasetSessions.map(session => {
              const grade = qualityGradeFromScore(session.qaScore ?? 0)
              const gradeColor = grade === 'A' ? '#22c55e' : grade === 'B' ? '#f59e0b' : '#ef4444'
              const hasAudio = !!(session.callRecordId || session.audioUrl || session.localSanitizedWavPath)
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ backgroundColor: '#1b1e2e' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{maskSessionTitle(session.title)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {session.date}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {formatDuration(session.duration)}
                      </span>
                      {hasAudio && (
                        <span className="material-symbols-outlined text-xs" style={{ color: '#60a5fa' }} title="WAV">
                          audio_file
                        </span>
                      )}
                      {session.labels && (
                        <span className="material-symbols-outlined text-xs" style={{ color: '#22c55e' }} title="라벨">
                          label
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
                  >
                    {grade}
                  </span>
                  <button
                    onClick={() => handleRemoveSession(session.id)}
                    className="flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* 내보내기 패널 */}
      <ExportOptionsPanel
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={handleExport}
        sessionCount={datasetSessions.length}
      />

      {/* WAV 추출 진행률 오버레이 */}
      {wavProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div
            className="w-80 rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: '#1b1e2e' }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl" style={{ color: '#1337ec' }}>graphic_eq</span>
              <p className="text-sm font-semibold text-white">정제 WAV 추출 중</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <span>{wavProgress.done.toLocaleString()} / {wavProgress.total.toLocaleString()}건</span>
                <span>{wavProgress.total > 0 ? Math.round((wavProgress.done / wavProgress.total) * 100) : 0}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: '#1337ec',
                    width: `${wavProgress.total > 0 ? (wavProgress.done / wavProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {wavProgress.phase === 'starting' && '준비 중...'}
                {wavProgress.phase === 'loading' && '파일 로드 중...'}
                {wavProgress.phase === 'resampling' && '리샘플링 중...'}
                {wavProgress.phase === 'silence_removal' && '무음 제거 중...'}
                {wavProgress.phase === 'encoding' && 'WAV 인코딩 중...'}
                {wavProgress.phase === 'downloading' && '다운로드 중...'}
                {wavProgress.phase === 'done' && '완료'}
              </p>
            </div>

            <button
              onClick={() => { wavCancelledRef.current = true }}
              className="w-full py-2 rounded-lg text-xs font-medium border"
              style={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.12)' }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 하단 액션 바 */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 py-3 border-t space-y-2"
        style={{
          backgroundColor: '#1b1e2e',
          borderColor: 'rgba(255,255,255,0.08)',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex gap-2">
          <button
            onClick={() => setShowExport(true)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5"
            style={{ backgroundColor: '#1337ec' }}
          >
            <span className="material-symbols-outlined text-base">download</span>
            내보내기
          </button>
          {canAdvance && (
            <button
              onClick={handleStatusAdvance}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 border"
              style={{ borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'transparent' }}
            >
              <span className="material-symbols-outlined text-base">arrow_forward</span>
              {STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(dataset.status) + 1]]}
            </button>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="w-full py-2 text-xs"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          데이터셋 삭제
        </button>
      </div>
    </div>
  )
}
