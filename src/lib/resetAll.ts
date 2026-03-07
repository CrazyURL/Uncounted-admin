// ── 전체 데이터 초기화 유틸 ──────────────────────────────────────────────────
// localStorage + IndexedDB + Capacitor Preferences/Filesystem + Backend API 일괄 삭제.

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { invalidateIdbHandle } from './idb'
import { invalidateSessionCache } from './sessionMapper'
import { resetProfile } from './embeddingEngine'
import { VOICE_PROFILE_KEY, VERIFICATION_CACHE_KEY } from '../types/voiceBiometrics'
import { resetAllApi } from './api/admin'


/** Capacitor Preferences 키 목록 (SharedPreferences) */
const CAPACITOR_PREF_KEYS = [
  VOICE_PROFILE_KEY,                  // uncounted_voice_profile
  VERIFICATION_CACHE_KEY,             // uncounted_verification_cache
  'uncounted_device_install_id',
  'uncounted_device_password',
]

/** Capacitor Filesystem 파일 목록 (Directory.Data) */
const CAPACITOR_FILES = [
  'voice_profile.json',
  'verification_cache.json',
  'consent_flag.json',
]

export type ResetLocalResult = {
  localStorage: number
  indexedDB: boolean
  capacitorPreferences: number
  capacitorFiles: number
}

export type ResetResult = ResetLocalResult & {
  supabase: Record<string, number | string>
}

/** 로컬 데이터만 초기화 — Supabase 제외, 인메모리 + localStorage + IDB + Capacitor */
export async function resetLocal(): Promise<ResetLocalResult> {
  const result: ResetLocalResult = {
    localStorage: 0,
    indexedDB: false,
    capacitorPreferences: 0,
    capacitorFiles: 0,
  }

  // 1. 인메모리 싱글톤 초기화
  invalidateSessionCache()
  resetProfile()

  // 2. localStorage — uncounted_ 키 전부 삭제
  const keysToRemove = Object.keys(localStorage).filter(
    k => k.startsWith('uncounted_') || k === 'scanPending' || k === 'stt_mode' || k === 'stt_transcripts',
  )
  for (const k of keysToRemove) localStorage.removeItem(k)
  result.localStorage = keysToRemove.length

  // 3. IndexedDB 삭제 + stale 핸들 초기화
  try {
    indexedDB.deleteDatabase('uncounted')
    invalidateIdbHandle()
    result.indexedDB = true
  } catch {
    result.indexedDB = false
  }

  // 4. Capacitor Preferences (SharedPreferences) 삭제
  if (Capacitor.isNativePlatform()) {
    for (const key of CAPACITOR_PREF_KEYS) {
      try {
        await Preferences.remove({ key })
        result.capacitorPreferences++
      } catch { /* ignore */ }
    }

    // 5. Capacitor Filesystem 파일 삭제
    for (const path of CAPACITOR_FILES) {
      try {
        await Filesystem.deleteFile({ path, directory: Directory.Data })
        result.capacitorFiles++
      } catch { /* 파일 미존재 시 무시 */ }
    }
  }

  return result
}

/** 전체 데이터 초기화 — 로컬 + Backend API */
export async function resetAll(): Promise<ResetResult> {
  const localResult = await resetLocal()

  const result: ResetResult = {
    ...localResult,
    supabase: {},
  }

  // Backend API를 통한 테이블 초기화
  if (import.meta.env.VITE_API_URL) {
    try {
      const { data, error } = await resetAllApi()
      if (error) {
        result.supabase = { error: `Backend API error: ${error}` }
      } else if (data?.tables) {
        result.supabase = data.tables
      }
    } catch (err: any) {
      result.supabase = { error: `Backend API exception: ${err.message}` }
    }
  } else {
    result.supabase = { error: 'Backend API URL not configured' }
  }

  return result
}
