// ── 기기 조건 — 배터리/네트워크 상태 체크 ──────────────────────────────────
// Web API 기반 (Capacitor 플러그인 없이 동작)
// 조건에 따라 업로드 속도 조절

export type DeviceCondition = {
  isWifi: boolean
  isCharging: boolean
  batteryLevel: number    // 0~1 (알 수 없으면 1.0)
}

// ── 조건 체크 ───────────────────────────────────────────────────────────────

export async function checkDeviceCondition(): Promise<DeviceCondition> {
  let isWifi = true
  let isCharging = true
  let batteryLevel = 1.0

  // Network Information API
  try {
    const conn = (navigator as unknown as { connection?: { type?: string; effectiveType?: string } }).connection
    if (conn?.type) {
      isWifi = conn.type === 'wifi' || conn.type === 'ethernet'
    } else if (conn?.effectiveType) {
      // effectiveType만 있으면 4g 이상을 wifi급으로 간주
      isWifi = conn.effectiveType === '4g'
    }
  } catch {
    // API 미지원 — wifi로 가정
  }

  // Battery Status API
  try {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ charging: boolean; level: number }> }
    if (nav.getBattery) {
      const battery = await nav.getBattery()
      isCharging = battery.charging
      batteryLevel = battery.level
    }
  } catch {
    // API 미지원 — 충전 중으로 가정
  }

  return { isWifi, isCharging, batteryLevel }
}

// ── 스로틀 판정 ─────────────────────────────────────────────────────────────

export type ThrottleLevel = 'full' | 'medium' | 'slow' | 'pause'

export function getThrottleLevel(condition: DeviceCondition): ThrottleLevel {
  // 배터리 10% 미만 + 비충전 → 일시정지
  if (!condition.isCharging && condition.batteryLevel < 0.1) return 'pause'
  // WiFi + 충전 → 풀 스피드
  if (condition.isWifi && condition.isCharging) return 'full'
  // WiFi만 → 중간 속도
  if (condition.isWifi) return 'medium'
  // 모바일 → 저속
  return 'slow'
}

// ── 배치 간 딜레이 (ms) ─────────────────────────────────────────────────────

export function getThrottleDelayMs(level: ThrottleLevel): number {
  switch (level) {
    case 'full': return 0
    case 'medium': return 500
    case 'slow': return 1500
    case 'pause': return -1   // -1 = 처리 중단
  }
}

// ── 권장 동시 처리 수 ───────────────────────────────────────────────────────

export function getRecommendedConcurrency(condition: DeviceCondition): number {
  if (condition.isWifi && condition.isCharging) return 3
  if (condition.isWifi) return 2
  return 1
}
