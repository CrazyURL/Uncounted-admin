// ── 네트워크 상태 감지 유틸 ─────────────────────────────────────────────────
// navigator.onLine + online/offline 이벤트 기반
// 업로드/동기화 전 isOnline() 체크, 복구 시 자동 재시도

type NetworkListener = (online: boolean) => void

const listeners = new Set<NetworkListener>()
let initialized = false

function handleOnline() {
  for (const cb of listeners) cb(true)
}

function handleOffline() {
  for (const cb of listeners) cb(false)
}

function ensureListeners() {
  if (initialized) return
  initialized = true
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
}

/** 현재 네트워크 연결 상태 */
export function isOnline(): boolean {
  return navigator.onLine
}

/** 네트워크 상태 변경 구독. 해제 함수 반환 */
export function onNetworkChange(cb: NetworkListener): () => void {
  ensureListeners()
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
