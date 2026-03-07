// ── Metadata Export Resolver ─────────────────────────────────────────────────
// 각 메타데이터 collector의 localStorage 레코드를 통합 로드
// Export pipeline이 SKU별로 적합한 레코드를 가져올 수 있는 단일 진입점
//
// U-M05: audioScanner.calcDeviceBucket() 기반 (스캔 시 생성 → AudioScanRecord에 포함)
// U-M06: audioEnvironmentCollector 파생 (세션 스캔 후 배치 생성)
// U-M07: callTimePatternCollector 파생 (세션 목록에서 월별 집계)
// U-M08: screenSessionCollector 실시간 수집 (App.tsx에서 시작)
// U-M09: batteryCollector 실시간 수집 (App.tsx에서 시작)
// U-M10: networkCollector 실시간 수집 (App.tsx에서 시작)

import { type SkuId } from '../types/sku'
import { type Session } from '../types/session'
import {
  type AudioEnvironmentRecord,
  type CallTimePatternRecord,
  type ScreenSessionPatternRecord,
  type BatteryChargingRecord,
  type NetworkTransitionRecord,
  type DeviceContextRecord,
  type ActivityStateRecord,
  type AmbientLightRecord,
  type DeviceMotionRecord,
  type AppLifecycleRecord,
  type MediaPlaybackRecord,
} from '../types/metadata'
import { loadAudioEnvironmentRecords, deriveAudioEnvironmentBatch, appendAudioEnvironmentRecords } from './audioEnvironmentCollector'
import { loadCallTimePatterns, refreshCallTimePatterns } from './callTimePatternCollector'
import { getScreenSessionRecords } from './screenSessionCollector'
import { getBatteryRecords } from './batteryCollector'
import { getNetworkRecords } from './networkCollector'
import { getActivityStateRecords } from './activityStateCollector'
import { getAmbientLightRecords } from './ambientLightCollector'
import { getDeviceMotionRecords } from './deviceMotionCollector'
import { getAppLifecycleRecords } from './appLifecycleCollector'
import { getMediaPlaybackRecords } from './mediaPlaybackCollector'

// ── 타입 ────────────────────────────────────────────────────────────────────

export type MetadataRecordSet = {
  'm05': DeviceContextRecord[]
  'm06': AudioEnvironmentRecord[]
  'm07': CallTimePatternRecord[]
  'm08': ScreenSessionPatternRecord[]
  'm09': BatteryChargingRecord[]
  'm10': NetworkTransitionRecord[]
  'm11': ActivityStateRecord[]
  'm13': AmbientLightRecord[]
  'm14': DeviceMotionRecord[]
  'm16': AppLifecycleRecord[]
  'm18': MediaPlaybackRecord[]
}

type MetadataSkuKey = keyof MetadataRecordSet

const SKU_TO_META_KEY: Partial<Record<SkuId, MetadataSkuKey>> = {
  'U-M05': 'm05',
  'U-M06': 'm06',
  'U-M07': 'm07',
  'U-M08': 'm08',
  'U-M09': 'm09',
  'U-M10': 'm10',
  'U-M11': 'm11',
  'U-M13': 'm13',
  'U-M14': 'm14',
  'U-M16': 'm16',
  'U-M18': 'm18',
}

// ── U-M05 로드: DeviceContextRecord는 audioScanner에서 별도 생성 ────────────
// audioScanner.buildAudioScanRecord()가 DeviceBucket을 산출하지만
// DeviceContextRecord는 별도 저장 없음 → 실시간 collector 필요
// 현재는 M09(battery) + M10(network) + M08(screen) 조합으로 재구성

const M05_KEY = 'uncounted_device_context_records'

function loadDeviceContextRecords(): DeviceContextRecord[] {
  try {
    const raw = localStorage.getItem(M05_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveDeviceContextRecords(records: DeviceContextRecord[]): void {
  localStorage.setItem(M05_KEY, JSON.stringify(records))
}

export function appendDeviceContextRecords(newRecords: DeviceContextRecord[]): void {
  const existing = loadDeviceContextRecords()
  const existingKeys = new Set(existing.map(r => `${r.dateBucket}|${r.timeBucket}`))
  const merged = [
    ...existing,
    ...newRecords.filter(r => !existingKeys.has(`${r.dateBucket}|${r.timeBucket}`)),
  ]
  // 최근 2000건만 유지
  if (merged.length > 2000) merged.splice(0, merged.length - 2000)
  saveDeviceContextRecords(merged)
}

// ── 통합 로드 ───────────────────────────────────────────────────────────────

/** 특정 메타데이터 SKU의 레코드 로드 */
export function loadMetadataForSku(skuId: SkuId): unknown[] {
  const key = SKU_TO_META_KEY[skuId]
  if (!key) return []

  switch (key) {
    case 'm05': return loadDeviceContextRecords()
    case 'm06': return loadAudioEnvironmentRecords()
    case 'm07': return loadCallTimePatterns()
    case 'm08': return getScreenSessionRecords()
    case 'm09': return getBatteryRecords()
    case 'm10': return getNetworkRecords()
    case 'm11': return getActivityStateRecords()
    case 'm13': return getAmbientLightRecords()
    case 'm14': return getDeviceMotionRecords()
    case 'm16': return getAppLifecycleRecords()
    case 'm18': return getMediaPlaybackRecords()
  }
}

/** 모든 메타데이터 레코드 로드 */
export function loadAllMetadataRecords(): MetadataRecordSet {
  return {
    m05: loadDeviceContextRecords(),
    m06: loadAudioEnvironmentRecords(),
    m07: loadCallTimePatterns(),
    m08: getScreenSessionRecords(),
    m09: getBatteryRecords(),
    m10: getNetworkRecords(),
    m11: getActivityStateRecords(),
    m13: getAmbientLightRecords(),
    m14: getDeviceMotionRecords(),
    m16: getAppLifecycleRecords(),
    m18: getMediaPlaybackRecords(),
  }
}

/** 메타데이터 레코드 수 요약 */
export function getMetadataRecordCounts(): Record<string, number> {
  const all = loadAllMetadataRecords()
  return {
    'U-M05': all.m05.length,
    'U-M06': all.m06.length,
    'U-M07': all.m07.length,
    'U-M08': all.m08.length,
    'U-M09': all.m09.length,
    'U-M10': all.m10.length,
    'U-M11': all.m11.length,
    'U-M13': all.m13.length,
    'U-M14': all.m14.length,
    'U-M16': all.m16.length,
    'U-M18': all.m18.length,
  }
}

// ── 파생 메타데이터 갱신 ─────────────────────────────────────────────────────
// 오디오 스캔 후 또는 세션 목록 변경 시 호출

/**
 * U-M06 + U-M07 파생 데이터 갱신.
 * - U-M06: 세션의 audioMetrics로부터 음성 환경 레코드 파생
 * - U-M07: 세션 목록에서 통화 시간 패턴 재계산
 *
 * @returns 갱신된 레코드 수
 */
export function refreshDerivedMetadata(sessions: Session[]): {
  m06Count: number
  m07Count: number
} {
  // U-M06: AudioMetrics가 있는 세션만 처리
  const sessionsWithMetrics = sessions.filter(s => s.audioMetrics !== null)
  if (sessionsWithMetrics.length > 0) {
    const newRecords = deriveAudioEnvironmentBatch(
      sessionsWithMetrics.map(s => ({
        id: s.id,
        audioMetrics: s.audioMetrics,
        duration: s.duration,
        date: s.date,
      })),
    )
    appendAudioEnvironmentRecords(newRecords)
  }

  // U-M07: 전체 세션에서 통화 패턴 재계산
  const patterns = refreshCallTimePatterns(sessions)

  return {
    m06Count: loadAudioEnvironmentRecords().length,
    m07Count: patterns.length,
  }
}

/** 특정 SKU가 메타데이터 SKU인지 확인 */
export function isMetadataSku(skuId: SkuId): boolean {
  return skuId in SKU_TO_META_KEY
}

/** JSONL 형식으로 메타데이터 레코드 직렬화 */
export function metadataRecordsToJsonl(skuId: SkuId): string {
  const records = loadMetadataForSku(skuId)
  return records.map(r => JSON.stringify(r)).join('\n')
}
