// 통화 단위 액션 패널 (화면 ④, 정본 §4.5)
// 정정 통계 + HOTWORDS 후보 (사람 게이트) + 3버튼 (승인/수정필요/거절).

import { useState } from 'react'
import type { CallActionContext, HotwordCandidate } from './types'

interface CallActionPanelProps {
  context: CallActionContext
  onApprove: () => void
  onNeedsRevision: (options: NeedsRevisionOptions) => void
  onReject: (reason: string) => void
  onHotwordsRegister: (selected: HotwordCandidate[]) => void
}

export interface NeedsRevisionOptions {
  apply_hotwords: boolean
  voice_profile_reupdate: boolean
  model_change: 'large-v3-int8' | 'large-v3' | 'turbo' | null
  pii_detector_rerun: boolean
  reason: string
}

export function CallActionPanel({ context, onApprove, onNeedsRevision, onReject, onHotwordsRegister }: CallActionPanelProps) {
  const [showRevisionPanel, setShowRevisionPanel] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [selectedHotwords, setSelectedHotwords] = useState<Set<string>>(new Set())
  const [revisionReason, setRevisionReason] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [applyHotwords, setApplyHotwords] = useState(true)
  const [voiceProfile, setVoiceProfile] = useState(false)
  const [modelChange, setModelChange] = useState<'large-v3-int8' | 'large-v3' | 'turbo' | null>(null)
  const [piiRerun, setPiiRerun] = useState(false)

  const toggleHotword = (token: string) => {
    setSelectedHotwords((prev) => {
      const next = new Set(prev)
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })
  }

  const handleHotwordsRegister = () => {
    const selected = context.hotword_candidates.filter((c) => selectedHotwords.has(c.token))
    onHotwordsRegister(selected)
  }

  return (
    <div className="border border-border-light rounded-lg p-4 space-y-4 bg-surface">
      {/* 헤더 + 통계 */}
      <div>
        <div className="font-medium text-base mb-2">
          통화 발화 검수 완료: {context.reviewed_red_count}/{context.reviewed_red_total} 빨강
        </div>
        <div className="grid grid-cols-2 gap-1 text-sm">
          <div>📊 정정 통계:</div>
          <div></div>
          <div className="text-txt-sub">텍스트 수정:</div>
          <div>{context.revision_stats.text_correction} 건</div>
          <div className="text-txt-sub">화자 변경:</div>
          <div>{context.revision_stats.speaker_relabel} 건</div>
          <div className="text-txt-sub">PII 추가:</div>
          <div>{context.revision_stats.pii_addition} 건</div>
          <div className="text-txt-sub">제외:</div>
          <div>{context.revision_stats.exclude} 건</div>
          {context.revision_stats.deferred_split > 0 && (
            <>
              <div className="text-txt-sub">  └ 화자혼재 (deferred_split):</div>
              <div className="text-blue-600">{context.revision_stats.deferred_split} 건</div>
            </>
          )}
        </div>
      </div>

      {/* HOTWORDS 후보 (사람 게이트) */}
      {context.hotword_candidates.length > 0 && (
        <div className="border border-amber-200 bg-amber-50/30 rounded p-3">
          <div className="text-sm font-medium mb-2">HOTWORDS 후보 (자동 추출, 사람 승인 필요):</div>
          <div className="space-y-1 mb-2">
            {context.hotword_candidates.map((c) => (
              <HotwordCandidateRow
                key={c.token}
                candidate={c}
                selected={selectedHotwords.has(c.token)}
                onToggle={() => toggleHotword(c.token)}
              />
            ))}
          </div>
          <button
            type="button"
            className="px-3 py-1 bg-amber-500 text-white rounded text-sm"
            onClick={handleHotwordsRegister}
            disabled={selectedHotwords.size === 0}
          >
            📌 선택한 {selectedHotwords.size}건을 HOTWORDS 등록
          </button>
        </div>
      )}

      {/* 3버튼 */}
      <div className="border-t border-border-light pt-3 space-y-3">
        <button
          type="button"
          className="w-full px-4 py-3 bg-emerald-500 text-white rounded font-medium text-sm"
          onClick={onApprove}
        >
          ✓ 승인
          <div className="text-xs opacity-80 mt-0.5">납품 정본으로 확정. R2 학습 입력.</div>
        </button>

        <div className="border border-amber-300 rounded p-3 bg-amber-50/20">
          <button
            type="button"
            className="w-full text-left px-2 py-1 font-medium text-sm text-amber-700"
            onClick={() => setShowRevisionPanel((v) => !v)}
          >
            🔄 수정 필요 {showRevisionPanel ? '▲' : '▼'}
          </button>
          {showRevisionPanel && (
            <div className="space-y-2 mt-2 text-sm">
              <div className="text-xs text-txt-sub">재처리 옵션 (P2 도입):</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={applyHotwords} onChange={(e) => setApplyHotwords(e.target.checked)} />
                위에서 등록한 HOTWORDS 적용
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={voiceProfile} onChange={(e) => setVoiceProfile(e.target.checked)} />
                본인 음성 프로파일 재등록
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={piiRerun}
                  onChange={(e) => setPiiRerun(e.target.checked)}
                />
                PII detector 재실행
              </label>
              <div className="flex items-center gap-2">
                <span className="text-txt-sub">모델 변경:</span>
                {(['large-v3-int8', 'large-v3', 'turbo'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="model"
                      value={m}
                      checked={modelChange === m}
                      onChange={() => setModelChange(m)}
                    />
                    {m}
                  </label>
                ))}
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="model" checked={modelChange === null} onChange={() => setModelChange(null)} />
                  유지 (권장)
                </label>
              </div>
              <textarea
                rows={2}
                placeholder="재처리 사유 (필수)"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                className="w-full text-sm p-2 border border-border-light rounded"
              />
              <button
                type="button"
                className="w-full px-3 py-2 bg-amber-500 text-white rounded text-sm disabled:opacity-40"
                disabled={!revisionReason.trim()}
                onClick={() =>
                  onNeedsRevision({
                    apply_hotwords: applyHotwords,
                    voice_profile_reupdate: voiceProfile,
                    model_change: modelChange,
                    pii_detector_rerun: piiRerun,
                    reason: revisionReason.trim(),
                  })
                }
              >
                🔄 통화 단위 재처리 시작
              </button>
            </div>
          )}
        </div>

        <div className="border border-red-300 rounded p-3 bg-red-50/20">
          <button
            type="button"
            className="w-full text-left px-2 py-1 font-medium text-sm text-red-700"
            onClick={() => setRejectMode((v) => !v)}
          >
            ✗ 거절 {rejectMode ? '▲' : '▼'}
          </button>
          {rejectMode && (
            <div className="space-y-2 mt-2">
              <textarea
                rows={2}
                placeholder="거절 사유 (필수)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full text-sm p-2 border border-border-light rounded"
              />
              <button
                type="button"
                className="w-full px-3 py-2 bg-red-500 text-white rounded text-sm disabled:opacity-40"
                disabled={!rejectReason.trim()}
                onClick={() => onReject(rejectReason.trim())}
              >
                ✗ 통화 거절 (납품 불가)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 정산 freeze 안내 (정본 §2.1 Option A) */}
      <div className="text-xs text-txt-sub border-t border-border-light pt-2">
        ⚠ 정산 발화 수 = {context.total_utterance_count}건 (STT 시점 freeze)
        <br />
        검수 후에도 불변 (인센티브 왜곡 방지).
      </div>
    </div>
  )
}

function HotwordCandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: HotwordCandidate
  selected: boolean
  onToggle: () => void
}) {
  const icon = candidate.is_recommended ? '✓' : '✗'
  const rejectionLabel = candidate.rejection_reason
    ? {
        len_1: '길이 1 — 검토 필요, 자동 ✗',
        kiwi_general_word: 'Kiwi 일반어 — 추천 안 함',
        particle: '조사/접속어 — 자동 제외',
      }[candidate.rejection_reason]
    : null
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={selected} onChange={onToggle} disabled={!candidate.is_recommended} />
      <span className={candidate.is_recommended ? 'text-emerald-700' : 'text-red-500'}>{icon}</span>
      <span className="font-mono">{candidate.token}</span>
      <span className="text-xs text-txt-sub">
        ({candidate.kiwi_pos}, 반복 {candidate.frequency}회{rejectionLabel ? `, ${rejectionLabel}` : ''})
      </span>
    </label>
  )
}
