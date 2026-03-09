// ── scanEngine — 기기 오디오 스캔 로직 (AssetsPage에서 추출) ──────────────────
// GuidedOnboardingPage + AssetsPage 양쪽에서 재사용

import { type Session, type SessionStatus } from '../types/session'
import { loadAllSessions, saveAllSessions, invalidateSessionCache } from './sessionMapper'
import { refreshDerivedMetadata } from './metadataExportResolver'

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type ScannedFile = {
  name: string
  path: string
  size: number
  mtime: number
}

export type ScanProgress = {
  found: number
  currentDir: string
  phase: 'scanning' | 'converting' | 'saving' | 'done'
}

export type ScanResult = {
  sessions: Session[]
  filePaths: Record<string, string>
  totalBytes: number
}

// ── 상수 ──────────────────────────────────────────────────────────────────────

export const AUDIO_EXTENSIONS = new Set([
  'm4a', 'mp3', 'wav', 'ogg', '3gp', 'aac', 'amr', 'flac',
])

export const SCAN_ROOTS = ['Recordings', 'Call', 'MIUI/sound_recorder', 'Music']

// ── 유틸리티 ──────────────────────────────────────────────────────────────────

export function makeSessionId(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36).padStart(8, '0')
}

export function extractDate(name: string, mtime: number): string {
  if (mtime > 0) {
    const d = new Date(mtime)
    const yr = d.getFullYear()
    if (yr >= 2000 && yr <= new Date().getFullYear() + 1) {
      return d.toISOString().slice(0, 10)
    }
  }
  const m8 = name.match(/_(\d{4})(\d{2})(\d{2})_\d{4,6}/)
  if (m8) {
    const [, y, mo, d] = m8
    if (parseInt(y) >= 2000 && parseInt(y) <= 2099 && parseInt(mo) >= 1 && parseInt(mo) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
      return `${y}-${mo}-${d}`
    }
  }
  const m6 = name.match(/_(\d{2})(\d{2})(\d{2})_\d{4,6}/)
  if (m6) {
    const [, yy, mo, d] = m6
    if (parseInt(mo) >= 1 && parseInt(mo) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
      const year = parseInt(yy) >= 90 ? `19${yy}` : `20${yy}`
      return `${year}-${mo}-${d}`
    }
  }
  return '1970-01-01'
}

export function fileMetaToSession(file: ScannedFile): Session {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const title = file.name.replace(/\.[^.]+$/, '')
  const estimatedDuration = Math.max(30, Math.min(7200, Math.round(file.size / (16 * 1024))))
  const qaScore = ext === 'wav' || ext === 'flac' ? 88 : ext === 'm4a' ? 82 : 70
  return {
    id: makeSessionId(file.path),
    title,
    date: extractDate(file.name, file.mtime),
    duration: estimatedDuration,
    qaScore,
    labels: null,
    audioMetrics: null,
    isPublic: false,
    visibilityStatus: 'PRIVATE',
    visibilitySource: 'SKU_DEFAULT',
    visibilityConsentVersion: null,
    visibilityChangedAt: null,
    status: 'uploaded' as SessionStatus,
    isPiiCleaned: false,
    chunkCount: 0,
    callRecordId: file.path,
    consentStatus: 'locked',
    verifiedSpeaker: false,
  }
}

export function saveFilePaths(sessions: Session[]) {
  const existing: Record<string, string> = JSON.parse(
    localStorage.getItem('uncounted_file_paths') ?? '{}',
  )
  const added: Record<string, string> = {}
  for (const s of sessions) {
    if (s.callRecordId) added[s.id] = s.callRecordId
  }
  localStorage.setItem('uncounted_file_paths', JSON.stringify({ ...existing, ...added }))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ── 병합 ──────────────────────────────────────────────────────────────────────

export async function mergeWithExisting(scanned: Session[]): Promise<Session[]> {
  const existing = await loadAllSessions()
  const existingByPath = new Map<string, Session>()
  for (const s of existing) {
    if (s.callRecordId) existingByPath.set(s.callRecordId, s)
  }
  return scanned.map((ns) => {
    const ex = existingByPath.get(ns.callRecordId!)
    if (!ex) return ns
    return { ...ex, id: ns.id, callRecordId: ns.callRecordId, date: ns.date, duration: ns.duration }
  })
}

// ── 웹 스캔 ──────────────────────────────────────────────────────────────────

export async function scanWebAudio(
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  if (!('showDirectoryPicker' in window)) {
    // API 미지원 → 빈 결과
    return { sessions: [], filePaths: {}, totalBytes: 0 }
  }

  const dirHandle = await (window as any).showDirectoryPicker()
  invalidateSessionCache()

  const scannedFiles: ScannedFile[] = []

  async function scanDir(dh: any, currentPath: string) {
    onProgress?.({ found: scannedFiles.length, currentDir: currentPath, phase: 'scanning' })
    for await (const handle of dh.values()) {
      const childPath = `${currentPath}/${handle.name}`
      if (handle.kind === 'file') {
        const ext = handle.name.split('.').pop()?.toLowerCase() ?? ''
        if (AUDIO_EXTENSIONS.has(ext)) {
          const file = await handle.getFile()
          scannedFiles.push({
            name: handle.name,
            path: childPath,
            size: file.size,
            mtime: file.lastModified ?? 0,
          })
          onProgress?.({ found: scannedFiles.length, currentDir: currentPath, phase: 'scanning' })
        }
      } else if (handle.kind === 'directory') {
        await scanDir(handle, childPath)
      }
    }
  }

  await scanDir(dirHandle, dirHandle.name)

  onProgress?.({ found: scannedFiles.length, currentDir: '', phase: 'converting' })
  const scanned = scannedFiles.map(fileMetaToSession)
  const merged = await mergeWithExisting(scanned)

  onProgress?.({ found: merged.length, currentDir: '', phase: 'saving' })
  saveFilePaths(merged)
  await saveAllSessions(merged)

  // 메타데이터 파생 (U-M06 음성 환경 + U-M07 통화 패턴)
  try { refreshDerivedMetadata(merged) } catch { /* non-critical */ }

  const totalBytes = scannedFiles.reduce((sum, f) => sum + f.size, 0)
  const filePaths: Record<string, string> = {}
  for (const s of merged) {
    if (s.callRecordId) filePaths[s.id] = s.callRecordId
  }

  onProgress?.({ found: merged.length, currentDir: '', phase: 'done' })
  return { sessions: merged, filePaths, totalBytes }
}

// ── 통합 스캔 (플랫폼 자동 감지) ─────────────────────────────────────────────

export async function scanAudio(
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  return scanWebAudio(onProgress)
}
