// ── STT Foreground Service 브리지 (하위 호환 래퍼) ───────────────────────
// 기존 sttEngine.ts 등에서 사용하는 API를 유지하면서
// 내부적으로 processingServiceBridge에 위임.

import {
  registerProcessingTask,
  updateProcessingTask,
  unregisterProcessingTask,
  isProcessingServiceRunning,
} from './processingServiceBridge'

const TASK_ID = 'stt'
const TASK_TITLE = '텍스트 추출 중'

/** Foreground Service 시작 (네이티브에서만 동작) */
export async function startSttService(total: number, completed: number): Promise<void> {
  await registerProcessingTask(TASK_ID, TASK_TITLE, total)
  await updateProcessingTask(TASK_ID, completed, total)
}

/** Foreground Service 중지 */
export async function stopSttService(): Promise<void> {
  await unregisterProcessingTask(TASK_ID)
}

/** 알림 진행률 업데이트 */
export async function updateSttProgress(
  completed: number,
  total: number,
  message?: string,
): Promise<void> {
  await updateProcessingTask(TASK_ID, completed, total, message)
}

/** 서비스 실행 상태 확인 */
export function isSttServiceRunning(): boolean {
  return isProcessingServiceRunning()
}
