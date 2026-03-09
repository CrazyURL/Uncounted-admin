// ── 범용 백그라운드 처리 서비스 브리지 ──────────────────────────────────
// 여러 태스크(STT, 검증, PII, 라벨링 등)가 동시에 Foreground Service를
// 사용할 수 있도록 참조 카운팅 방식으로 관리.
// 모든 태스크가 해제되어야 서비스 중지.


// ── 태스크 추적 ──────────────────────────────────────────────────────────

type TaskInfo = {
  title: string
  done: number
  total: number
  message?: string
  updatedAt: number
}

const activeTasks = new Map<string, TaskInfo>()
let serviceRunning = false


/** 서비스 시작 또는 알림 업데이트 (내부) */
async function syncService(): Promise<void> { }

/** 서비스 중지 (내부) */
async function stopService(): Promise<void> { }

// ── Public API ───────────────────────────────────────────────────────────

/**
 * 백그라운드 태스크 등록 → 서비스 시작 (이미 실행 중이면 알림만 업데이트)
 * @param taskId 고유 태스크 ID (e.g. 'stt', 'verification', 'pipeline')
 * @param title 알림에 표시할 제목 (e.g. '음성 확인 중')
 * @param total 전체 항목 수
 */
export async function registerProcessingTask(
  taskId: string,
  title: string,
  total: number,
): Promise<void> {
  activeTasks.set(taskId, { title, done: 0, total, updatedAt: Date.now() })
  await syncService()
}

/**
 * 태스크 진행률 업데이트 → 알림 업데이트
 */
export async function updateProcessingTask(
  taskId: string,
  done: number,
  total: number,
  message?: string,
): Promise<void> {
  const existing = activeTasks.get(taskId)
  if (!existing) return
  activeTasks.set(taskId, { ...existing, done, total, message, updatedAt: Date.now() })
  await syncService()
}

/**
 * 태스크 해제 → 모든 태스크 해제 시 서비스 중지
 */
export async function unregisterProcessingTask(taskId: string): Promise<void> {
  activeTasks.delete(taskId)
  if (activeTasks.size === 0) {
    await stopService()
  } else {
    // 남은 태스크의 알림으로 업데이트
    await syncService()
  }
}

/** 서비스 실행 상태 확인 */
export function isProcessingServiceRunning(): boolean {
  return serviceRunning
}

/** 활성 태스크 수 */
export function activeTaskCount(): number {
  return activeTasks.size
}
