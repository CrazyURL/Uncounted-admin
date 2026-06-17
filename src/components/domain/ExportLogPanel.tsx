import { useState } from 'react'
import { getExportLogs } from '../../lib/exportLog'
import type { ExportLog } from '../../types/admin'

interface Props {
  onRegisterDelivery: (log: ExportLog) => void
}

const EXPORT_TYPE_LABEL: Record<ExportLog['export_type'], string> = {
  single: '단일',
  selected: '선택',
  all_filtered: '전체',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ExportLogPanel({ onRegisterDelivery }: Props) {
  const [open, setOpen] = useState(false)
  const allLogs = getExportLogs()
  const logs = open ? allLogs.slice(0, 10) : []

  if (allLogs.length === 0) return null

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-surface-alt text-txt-sub text-[13px] hover:text-txt focus:outline-none"
      >
        <span>최근 다운로드 로그</span>
        <span className="text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3.5 pb-3 overflow-x-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-txt-tertiary my-2.5">
              다운로드 이력이 없습니다
            </p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-txt-tertiary text-left">
                  <th className="font-medium pr-2 pt-1.5 pb-1">일시</th>
                  <th className="font-medium pr-2 pt-1.5 pb-1">유형</th>
                  <th className="font-medium pr-2 pt-1.5 pb-1 text-right">건수</th>
                  <th className="font-medium pr-2 pt-1.5 pb-1 text-right">발화수</th>
                  <th className="font-medium pr-2 pt-1.5 pb-1">제한포함</th>
                  <th className="font-medium pr-2 pt-1.5 pb-1">결과</th>
                  <th className="font-medium pr-2 pt-1.5 pb-1"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border-light">
                    <td className="py-1.5 pr-2 text-txt-sub">
                      {formatDate(log.exported_at)}
                    </td>
                    <td className="py-1.5 pr-2 text-txt-sub">
                      {EXPORT_TYPE_LABEL[log.export_type]}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-txt-sub tabular-nums">
                      {log.call_count}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-txt-sub tabular-nums">
                      {log.utterance_count}
                    </td>
                    <td className="py-1.5 pr-2 text-txt-tertiary">
                      {log.include_restricted ? '포함' : '-'}
                    </td>
                    <td className="py-1.5 pr-2">
                      {log.result_status === 'success' ? (
                        <span className="text-success">완료</span>
                      ) : (
                        <span className="text-danger" title={log.error_message}>
                          실패
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pl-2">
                      {log.result_status === 'success' && (log.session_ids?.length ?? 0) > 0 && (
                        <button
                          onClick={() => onRegisterDelivery(log)}
                          className="px-2 py-0.5 text-[11px] rounded border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 whitespace-nowrap focus:outline-none"
                        >
                          납품 등록
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
