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
  const logs = open ? getExportLogs().slice(0, 10) : []

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.04)',
          border: 'none',
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <span>최근 다운로드 로그</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px', overflowX: 'auto' }}>
          {logs.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '10px 0' }}>
              다운로드 이력이 없습니다
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500 }}>일시</th>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500 }}>유형</th>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500, textAlign: 'right' }}>건수</th>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500, textAlign: 'right' }}>발화수</th>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500 }}>제한포함</th>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500 }}>결과</th>
                  <th style={{ padding: '6px 8px 4px 0', fontWeight: 500 }}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '5px 8px 5px 0', color: 'rgba(255,255,255,0.6)' }}>
                      {formatDate(log.exported_at)}
                    </td>
                    <td style={{ padding: '5px 8px 5px 0', color: 'rgba(255,255,255,0.7)' }}>
                      {EXPORT_TYPE_LABEL[log.export_type]}
                    </td>
                    <td style={{ padding: '5px 8px 5px 0', textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
                      {log.call_count}
                    </td>
                    <td style={{ padding: '5px 8px 5px 0', textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
                      {log.utterance_count}
                    </td>
                    <td style={{ padding: '5px 8px 5px 0', color: 'rgba(255,255,255,0.5)' }}>
                      {log.include_restricted ? '포함' : '-'}
                    </td>
                    <td style={{ padding: '5px 8px 5px 0' }}>
                      {log.result_status === 'success' ? (
                        <span style={{ color: '#22c55e' }}>완료</span>
                      ) : (
                        <span style={{ color: '#ef4444' }} title={log.error_message}>
                          실패
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '5px 0 5px 8px' }}>
                      {log.result_status === 'success' && (log.session_ids?.length ?? 0) > 0 && (
                        <button
                          onClick={() => onRegisterDelivery(log)}
                          style={{
                            padding: '2px 8px',
                            fontSize: 11,
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.4)',
                            borderRadius: 4,
                            color: 'rgba(165,180,252,0.9)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
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
