// ── UUID 생성 유틸리티 ────────────────────────────────────────────────────────
// crypto.randomUUID polyfill for environments that don't support it
// (Android WebView, HTTP contexts, older browsers)

/**
 * UUID v4 생성 (crypto.randomUUID polyfill)
 *
 * @returns UUID v4 형식 문자열 (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
 */
export function generateUUID(): string {
  // Native crypto.randomUUID가 있으면 사용
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback: Math.random 기반 UUID v4 생성
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
