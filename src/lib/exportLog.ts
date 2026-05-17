// TODO: DB 연동 시 이 파일을 API 호출 기반으로 교체
import type { ExportLog } from '../types/admin'

const EXPORT_LOG_KEY = 'uncounted_export_logs'
const MAX_LOGS = 100

export function createExportLog(params: Omit<ExportLog, 'id' | 'exported_at'>): ExportLog {
  return {
    ...params,
    id: crypto.randomUUID(),
    exported_at: new Date().toISOString(),
  }
}

export function saveExportLog(log: ExportLog): void {
  const logs = getExportLogs()
  localStorage.setItem(EXPORT_LOG_KEY, JSON.stringify([log, ...logs].slice(0, MAX_LOGS)))
}

export function getExportLogs(): ExportLog[] {
  try {
    const raw = localStorage.getItem(EXPORT_LOG_KEY)
    return raw ? (JSON.parse(raw) as ExportLog[]) : []
  } catch {
    return []
  }
}
