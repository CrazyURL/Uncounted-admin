// ── 관리자 수동 PII span 등록 패널 (PR-P2B-B) ───────────────────────────
// 자동 탐지기가 놓친 PII 를 관리자가 전사에서 직접 선택해 pii_annotations
// (source=admin_manual) 로 등록한다.
//
// 흐름: 마운트 시 raw transcript 1건 로드 → 원문 위에서 span 선택 → 유형 선택 →
//       char_start/char_end/pii_type 만 전송(선택 substring 원문은 미전송).
//
// 안전 계약(강제):
//   - 선택한 원문 substring 을 state/props/콜백/에러메시지/콘솔/analytics 어디에도 넣지 않는다.
//     화면에는 offset(구간 위치)과 길이만 표시한다.
//   - raw transcript 는 화면 렌더 + offset 계산에만 쓰고 localStorage/sessionStorage 에 저장하지 않는다.
//   - 토스트/성공 문구는 일반 문구만 사용한다.

import { useEffect, useRef, useState } from 'react'
import {
  extractSpanFromRange,
  PII_TYPE_OPTIONS,
  type PiiType,
  type SpanOffsets,
} from '../../lib/pii/manualSpan'
import {
  getRawTranscript,
  createManualPiiAnnotation,
  type PiiAnnotation,
} from '../../lib/api/piiAnnotations'

export interface ManualPiiSpanRegisterProps {
  utteranceId: string
  onClose: () => void
  /** 등록 성공 시 부모 통지(선택). 인자에 원문 없음 — offset/유형/상태만. */
  onRegistered?: (annotation: PiiAnnotation) => void
}

export function ManualPiiSpanRegister({
  utteranceId,
  onClose,
  onRegistered,
}: ManualPiiSpanRegisterProps) {
  const [rawText, setRawText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [piiType, setPiiType] = useState<PiiType>('name')
  const [span, setSpan] = useState<SpanOffsets | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [okFlash, setOkFlash] = useState(false)
  const [registered, setRegistered] = useState<PiiAnnotation[]>([])

  const textRef = useRef<HTMLDivElement>(null)

  // 단일 발화 raw transcript 로드 + offset 정합성 검증(length 불일치 시 차단).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getRawTranscript(utteranceId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.error || !res.data) {
        setLoadError(res.error ?? '원문 전사를 불러오지 못했습니다.')
        return
      }
      const { transcript_text, length } = res.data
      if (typeof transcript_text !== 'string' || transcript_text.length !== length) {
        // 서버가 보고한 길이와 실제 길이 불일치 → offset 기준이 어긋날 수 있어 차단.
        setLoadError('전사 길이 검증 실패 — 다시 시도해 주세요.')
        return
      }
      setRawText(transcript_text)
    })
    return () => {
      cancelled = true
    }
  }, [utteranceId])

  // 현재 DOM 선택에서 offset 추출(가드 통과 시에만 span 설정).
  function syncSelection() {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (!sel || sel.rangeCount === 0) {
      setSpan(null)
      return
    }
    const offsets = extractSpanFromRange(sel.getRangeAt(0), textRef.current)
    setSpan(offsets)
  }

  async function handleRegister() {
    if (!span || saving) return
    setSaving(true)
    setSaveError(null)
    const res = await createManualPiiAnnotation({
      utterance_id: utteranceId,
      char_start: span.charStart,
      char_end: span.charEnd,
      pii_type: piiType,
    })
    setSaving(false)
    if (res.error || !res.data) {
      // API 에러 문구는 일반적(원문 미포함). 중복은 안내 문구로 치환.
      setSaveError(res.error === 'annotation already exists for this span'
        ? '이미 등록된 구간입니다.'
        : (res.error ?? '등록에 실패했습니다.'))
      return
    }
    setRegistered((prev) => [res.data as PiiAnnotation, ...prev])
    onRegistered?.(res.data)
    setOkFlash(true)
    setTimeout(() => setOkFlash(false), 1200)
    // 선택 해제(같은 구간 재등록/혼동 방지). 원문은 어디에도 남기지 않는다.
    setSpan(null)
    window.getSelection()?.removeAllRanges()
  }

  const typeLabel = (value: string) =>
    PII_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value

  return (
    <div className="mt-2 ml-10 rounded border border-amber-300 bg-amber-50/60 p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-amber-800">수동 PII 등록</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-2 py-0.5 rounded border border-border-soft hover:bg-bg-hover text-txt-sub"
        >
          닫기
        </button>
      </div>

      {loading && <div className="text-xs text-txt-sub">원문 전사 불러오는 중…</div>}
      {loadError && <div className="text-xs text-red-600">{loadError}</div>}

      {!loading && !loadError && rawText !== null && (
        <>
          <p className="text-[11px] text-txt-sub mb-1">
            아래 원문에서 개인정보 구간을 드래그로 선택하고 유형을 고른 뒤 등록하세요.
          </p>
          {/* 원문 컨테이너 — 단일 텍스트 노드 유지(offset 정합). pre-wrap 으로 공백/줄바꿈 정확 선택. */}
          <div
            ref={textRef}
            onMouseUp={syncSelection}
            onKeyUp={syncSelection}
            className="rounded border border-border-soft bg-white p-2 leading-relaxed text-txt select-text"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {rawText}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-txt-sub">
              {span
                ? `선택 구간 ${span.charStart}–${span.charEnd} (${span.charEnd - span.charStart}자)`
                : '선택된 구간 없음'}
            </span>
            <label className="text-xs text-txt-sub ml-2">
              유형
              <select
                value={piiType}
                onChange={(e) => setPiiType(e.target.value as PiiType)}
                className="ml-1 text-xs rounded border border-border-soft bg-white px-1 py-0.5"
              >
                {PII_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleRegister}
              disabled={!span || saving}
              className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-40 font-medium"
            >
              {saving ? '등록 중…' : 'PII 등록'}
            </button>
            {okFlash && <span className="text-xs text-green-700">수동 PII 등록 완료</span>}
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
          </div>

          {registered.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {registered.map((a) => (
                <span
                  key={a.id}
                  className="text-[11px] px-1.5 py-0.5 rounded border border-amber-400 bg-amber-100 text-amber-800 whitespace-nowrap"
                  title="관리자 수동 등록"
                >
                  {typeLabel(a.pii_type)} 수동 등록됨
                  {a.char_start !== null && a.char_end !== null && (
                    <span className="ml-1 opacity-70">{a.char_start}–{a.char_end}</span>
                  )}
                  {a.action_status === 'pending_mask' && (
                    <span className="ml-1 opacity-70">· 마스킹 대기</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
