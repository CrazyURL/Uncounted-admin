// B형 저신뢰 소프트플래그 — 화자별 발화 하이라이트 + Dismiss + 임계 캘리브레이션.
// 설계: uncounted-voice-api/docs/design_review_panel_redesign_20260603.md §4
// 목적: '저신뢰 구간 통과 가속기'(웅얼거림 우선검토). 오역 적출기 아님. 자동수정 없음.
// 화자/발화 단위로 끊어 렌더 → 플래그가 "어느 구간"인지 즉시 식별.
import { useMemo, useState, type CSSProperties } from 'react'

import type { FlagUtterance } from '../../lib/confidenceFlagMock'
import {
  countFlags,
  flagWords,
  DEFAULT_FLAG_CONFIG,
  type FlagSeverity,
} from '../../lib/confidenceFlag'

const SEVERITY_STYLE: Record<Exclude<FlagSeverity, 'none'>, CSSProperties> = {
  // low = 옅은 앰버(주의), high = 진한 오렌지(집중) — '오류'가 아닌 '확인' 신호.
  low: { backgroundColor: 'rgba(234,179,8,0.18)', borderBottom: '2px solid rgba(234,179,8,0.55)' },
  high: { backgroundColor: 'rgba(249,115,22,0.22)', borderBottom: '2px solid rgba(249,115,22,0.7)' },
}

const SPEAKER_STYLE: Record<string, CSSProperties> = {
  본인: { backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  상대: { backgroundColor: 'rgba(148,163,184,0.16)', color: 'var(--color-text-sub)' },
}

interface Props {
  utterances: readonly FlagUtterance[]
}

/** 화자별 발화 행으로 렌더. 단어 클릭 = 플래그 해제(확인 완료). 임계 슬라이더로 시각 캘리브레이션. */
export default function ConfidenceFlaggedTranscript({ utterances }: Props) {
  const [threshold, setThreshold] = useState(DEFAULT_FLAG_CONFIG.threshold)
  const [minWordLength, setMinWordLength] = useState(DEFAULT_FLAG_CONFIG.minWordLength)
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set<number>())

  const config = useMemo(
    () => ({ ...DEFAULT_FLAG_CONFIG, threshold, minWordLength }),
    [threshold, minWordLength],
  )
  // 전역 단어 index 유지(발화 가로질러 dismiss/카운트 정합).
  const allWords = useMemo(() => utterances.flatMap(u => u.words), [utterances])
  const allFlagged = useMemo(() => flagWords(allWords, config, dismissed), [allWords, config, dismissed])
  const counts = useMemo(() => countFlags(allFlagged), [allFlagged])
  const groups = useMemo(() => {
    let cursor = 0
    return utterances.map(u => {
      const flagged = allFlagged.slice(cursor, cursor + u.words.length)
      cursor += u.words.length
      return { speaker: u.speaker, overlap: u.overlap, flagged }
    })
  }, [utterances, allFlagged])

  const dismiss = (index: number) => setDismissed(prev => new Set(prev).add(index))
  const resetDismissed = () => setDismissed(new Set<number>())

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.2)' }}
    >
      {/* 헤더 + 캘리브레이션 */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm" style={{ color: '#eab308' }}>flag</span>
          <span className="text-xs font-medium text-txt">저신뢰 구간 플래그</span>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--color-text-sub)' }}>
          플래그 {counts.flagged} (high {counts.high} · low {counts.low}) / {counts.total}단어
        </span>

        <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-sub)' }}>
          임계 {threshold.toFixed(2)}
          <input
            type="range" min={0} max={1} step={0.01}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            aria-label="플래그 임계값"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-sub)' }}>
          최소길이 {minWordLength}
          <input
            type="range" min={1} max={4} step={1}
            value={minWordLength}
            onChange={e => setMinWordLength(Number(e.target.value))}
            aria-label="플래그 최소 글자수"
          />
        </label>

        {dismissed.size > 0 && (
          <button
            onClick={resetDismissed}
            className="text-[11px] underline"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            해제 복원 ({dismissed.size})
          </button>
        )}
      </div>

      {/* 화자별 발화 행 — 단어 하이라이트, 클릭 시 dismiss */}
      <div className="px-4 pb-4 space-y-2">
        {groups.map((g, gi) => (
          <div key={gi} className="flex gap-2 items-start">
            <span
              className="text-[10px] font-medium rounded px-1.5 py-0.5 mt-0.5 shrink-0"
              style={SPEAKER_STYLE[g.speaker] ?? SPEAKER_STYLE['상대']}
            >
              {g.speaker}{g.overlap ? ' ·겹침' : ''}
            </span>
            <div className="leading-7 text-sm" style={{ color: 'var(--color-text-sub)' }}>
              {g.flagged.map(fw => {
                const flagStyle = fw.severity === 'none' ? undefined : SEVERITY_STYLE[fw.severity]
                const isFlagged = flagStyle !== undefined
                return (
                  <span
                    key={fw.index}
                    onClick={isFlagged ? () => dismiss(fw.index) : undefined}
                    title={isFlagged ? `확률 ${fw.probability.toFixed(3)} · 클릭하여 확인처리` : `확률 ${fw.probability.toFixed(3)}`}
                    role={isFlagged ? 'button' : undefined}
                    className={isFlagged ? 'cursor-pointer rounded px-0.5' : 'px-0.5'}
                    style={flagStyle}
                  >
                    {fw.word}{' '}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 한계 고지 */}
      <div className="px-4 pb-3 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        ※ 저신뢰(웅얼거림) 구간 가속용. 확신에 찬 오역(예: 수석님→선생님)은 못 잡습니다 — 청취 검수로 보완.
      </div>
    </div>
  )
}
