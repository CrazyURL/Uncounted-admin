import { type ExportJobLog } from '../../types/admin'

const LEVEL_CONFIG: Record<string, { color: string; icon: string }> = {
  info: { color: '#3b82f6', icon: 'info' },
  warn: { color: '#f59e0b', icon: 'warning' },
  error: { color: '#ef4444', icon: 'error' },
}

type Props = {
  logs: ExportJobLog[]
}

export default function JobLogTimeline({ logs }: Props) {
  return (
    <div className="space-y-2">
      {logs.map((log, i) => {
        const cfg = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info
        return (
          <div key={i} className="flex items-start gap-2">
            <span
              className="material-symbols-outlined text-sm mt-0.5 flex-shrink-0"
              style={{ color: cfg.color }}
            >
              {cfg.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white">{log.message}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {log.timestamp}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
