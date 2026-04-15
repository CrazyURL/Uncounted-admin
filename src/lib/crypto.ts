// ── AES-256-GCM 암호화/복호화 유틸 ────────────────────────────────────────
// @noble/ciphers 사용 — HTTP 환경(비보안 컨텍스트)에서도 동작
// 응답 복호화 포맷: base64url( IV(12B) | AuthTag(16B) | Ciphertext ) + '@enc_uncounted'
// 요청 암호화 포맷: base64url( IV(12B) | AuthTag(16B) | Ciphertext )  (suffix 없음)

import { gcm } from '@noble/ciphers/aes.js'
import { hexToBytes } from '@noble/ciphers/utils.js'

const KEY_HEX = import.meta.env.VITE_ENCRYPTION_KEY as string

const ENC_SUFFIX = '@enc_uncounted'

export function isEncryptedId(value: string): boolean {
  return value.endsWith(ENC_SUFFIX)
}

/**
 * API 응답 전체를 재귀적으로 순회하며 암호화된 문자열을 복호화한다.
 * - string  → @enc_uncounted 접미사 확인 후 복호화
 * - Array   → 각 요소에 재귀 적용
 * - object  → 각 값에 재귀 적용
 * - 그 외    → 그대로 반환 (number, boolean, null 등)
 */
export function decryptResponse<T>(value: T): T {
  if (typeof value === 'string') {
    return (isEncryptedId(value) ? decryptId(value) : value) as T
  }
  if (Array.isArray(value)) {
    return value.map(decryptResponse) as T
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as object)) {
      result[key] = decryptResponse((value as Record<string, unknown>)[key])
    }
    return result as T
  }
  return value
}

/**
 * 요청 body 전체를 AES-256-GCM으로 암호화한다.
 * 포맷: base64url( IV(12B) | AuthTag(16B) | Ciphertext )  — suffix 없음
 * 서버 crypto.ts의 decryptData()와 대칭.
 */
export function encryptData(data: unknown): string {
  const keyBytes = hexToBytes(KEY_HEX)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(data))

  // noble/ciphers gcm.encrypt → ciphertext + authTag(16B at end)
  const encrypted = gcm(keyBytes, iv).encrypt(plaintext)
  const authTag   = encrypted.slice(-16)
  const ciphertext = encrypted.slice(0, -16)

  // 서버 포맷으로 재조합: IV | AuthTag | Ciphertext
  const combined = new Uint8Array(12 + 16 + ciphertext.length)
  combined.set(iv, 0)
  combined.set(authTag, 12)
  combined.set(ciphertext, 28)

  // 대용량 페이로드(수만 건 발화 검수 등)에서 안전하도록 청크 단위로 base64 변환.
  // 단일 for 루프는 cons-string 깊이가 N에 비례해 btoa 평탄화 시 스택 오버플로우가 발생한다.
  // String.fromCharCode.apply 는 인자 수 제한이 있어 32KB 청크로 나눠 호출한다.
  const CHUNK = 0x8000
  const parts: string[] = []
  for (let i = 0; i < combined.length; i += CHUNK) {
    const slice = combined.subarray(i, Math.min(i + CHUNK, combined.length))
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]))
  }
  return btoa(parts.join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function decryptId(encryptedId: string): string {
  const raw = encryptedId.slice(0, -ENC_SUFFIX.length)

  // base64url → Uint8Array
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0))

  const iv      = data.slice(0, 12)
  const authTag = data.slice(12, 28)
  const cipher  = data.slice(28)

  // noble/ciphers: authTag를 ciphertext 뒤에 붙여서 전달
  const cipherWithTag = new Uint8Array([...cipher, ...authTag])

  const keyBytes = hexToBytes(KEY_HEX)
  const aes = gcm(keyBytes, iv)
  const decrypted = aes.decrypt(cipherWithTag)
  return new TextDecoder().decode(decrypted)
}
