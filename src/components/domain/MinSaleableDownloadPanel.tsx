import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardBody } from '../ui/Card'

type DownloadOptions = { includeRestricted: boolean }

type MinSaleableDownloadPanelProps = {
  sellableCount: number
  restrictedCount: number
  lockedCount: number
  includedUtteranceCount: number
  totalDurationLabel: string
  estimatedRevenueLabel: string
  selectedCount: number
  isDownloading?: boolean
  onDownloadSelected: (options: DownloadOptions) => void
  onDownloadAllSellable: (options: DownloadOptions) => void
}

const INCLUDED_FILES = [
  'manifest.json',
  'utterances.jsonl',
  'calls.json',
  'quality_report.json',
  'consent_report.json',
  'txt 전사본',
]

export function MinSaleableDownloadPanel({
  sellableCount,
  restrictedCount,
  lockedCount,
  includedUtteranceCount,
  totalDurationLabel,
  estimatedRevenueLabel,
  selectedCount,
  isDownloading = false,
  onDownloadSelected,
  onDownloadAllSellable,
}: MinSaleableDownloadPanelProps) {
  const [showOptions, setShowOptions] = useState(false)
  const [includeRestricted, setIncludeRestricted] = useState(false)

  const options: DownloadOptions = { includeRestricted }

  return (
    <Card variant="default" padding="none" className="p-5">
      <CardHeader title="판매 데이터셋 내보내기 · 메타데이터 ZIP (오디오 미포함)" />

      <CardBody className="mt-3 space-y-4">
        <p className="text-xs text-txt-sub">
          이 버튼은 메타데이터·전사·라벨만 담은 빠른 ZIP을 만듭니다. 음성(WAV)은 포함되지 않습니다.
          전사·라벨·메타데이터 전체 구조가 필요하면 각 통화 행의 “풀 패키지”를 사용하세요.
          음성(WAV) 동봉은 준비 중입니다.
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <StatRow label="판매 가능 통화" value={`${sellableCount.toLocaleString()}건`} tone="success" />
          <StatRow label="포함 가능 발화" value={`${includedUtteranceCount.toLocaleString()}개`} />
          <StatRow label="제한 통화" value={`${restrictedCount.toLocaleString()}건`} tone="warning" />
          <StatRow label="총 유효 시간" value={totalDurationLabel} />
          <StatRow label="잠금 통화" value={`${lockedCount.toLocaleString()}건`} tone="muted" />
          <StatRow label="예상 매출" value={estimatedRevenueLabel} />
        </div>

        {/* Divider */}
        <div className="border-t border-border-light" />

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={selectedCount === 0 || isDownloading}
            loading={isDownloading}
            onClick={() => onDownloadSelected(options)}
          >
            선택 다운로드
            {selectedCount > 0 && (
              <span className="ml-1 text-xs opacity-75">({selectedCount}건)</span>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isDownloading}
            loading={isDownloading}
            onClick={() => onDownloadAllSellable(options)}
          >
            판매가능 전체 다운로드
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOptions((prev) => !prev)}
          >
            다운로드 옵션 {showOptions ? '▲' : '▼'}
          </Button>
        </div>

        {/* Options panel — inline collapsible */}
        {showOptions && (
          <div
            className="rounded-lg p-4 space-y-4 text-sm"
            style={{ backgroundColor: 'var(--color-surface-alt, #f9f9f9)', border: '1px solid var(--color-border-light)' }}
          >
            {/* 포함 범위 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-txt-sub uppercase tracking-wide">포함 범위</p>

              <CheckRow
                label="판매 가능"
                checked
                disabled
                hint="항상 포함"
              />

              <CheckRow
                label="제한"
                checked={includeRestricted}
                onChange={(v) => setIncludeRestricted(v)}
                hint="동의 완료, 일부 PII 잔존"
              />

              <CheckRow
                label="잠금"
                checked={false}
                disabled
                hint="포함 불가"
                hintTone="danger"
              />
            </div>

            {/* 파일 구성 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-txt-sub uppercase tracking-wide">파일 구성</p>
              <div className="grid grid-cols-2 gap-1">
                {INCLUDED_FILES.map((file) => (
                  <div key={file} className="flex items-center gap-1.5 text-txt">
                    <span className="text-green-500">✓</span>
                    <span>{file}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-txt-sub">
                  <span className="opacity-40">○</span>
                  <span>
                    음성(WAV) 파일{' '}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--color-surface-dim, #e5e5e5)' }}
                    >
                      미포함 · 풀 패키지에서 제공
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

/* ── helpers ── */

type Tone = 'success' | 'warning' | 'muted' | undefined

function toneColor(tone: Tone): string {
  if (tone === 'success') return '#22c55e'
  if (tone === 'warning') return '#eab308'
  if (tone === 'muted') return 'var(--color-txt-sub, #888)'
  return 'var(--color-txt, inherit)'
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: Tone
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-txt-sub shrink-0">{label}</span>
      <span
        className="text-sm font-semibold tabular-nums"
        style={{ color: toneColor(tone) }}
      >
        {value}
      </span>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  disabled = false,
  onChange,
  hint,
  hintTone,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
  hint?: string
  hintTone?: 'danger'
}) {
  return (
    <label
      className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="rounded"
      />
      <span className="text-txt">{label}</span>
      {hint && (
        <span
          className="text-xs"
          style={{ color: hintTone === 'danger' ? '#ef4444' : 'var(--color-txt-sub, #888)' }}
        >
          {hint}
        </span>
      )}
    </label>
  )
}
