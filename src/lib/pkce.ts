// ── PKCE (RFC 7636) — admin 웹 OAuth 클라이언트 PKCE ──────────────────────
// 서버는 이미 네이티브 플로우용으로 code_challenge(쿼리)·code_verifier(콜백 쿼리)
// 경로를 지원한다. admin 웹도 이 경로를 쓰면 서버가 pkce_flow_id 쿠키를 심지/읽지
// 않으므로, admin↔api 가 별도 사이트(*.onrender.com)일 때 발생하던 "서드파티 쿠키
// 차단(시크릿/모바일/Safari)"으로 인한 로그인 실패가 사라진다.
//
// 안전: verifier 는 admin 동일출처 sessionStorage 에만 잠깐 보관하고(콜백 후 즉시 삭제),
//       서버로는 challenge(단방향 해시)만 보낸다. verifier 는 1회용 auth_code 와만 유효.

const VERIFIER_BYTES = 32 // → base64url 43자 (RFC 7636 권장 43~128)

/** sessionStorage 보관 키 (admin 동일출처). */
export const PKCE_VERIFIER_KEY = 'uncounted_pkce_verifier'

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 랜덤 code_verifier 생성 (32바이트 → base64url 43자). */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(VERIFIER_BYTES)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** S256: code_challenge = base64url(SHA-256(verifier)). 서버는 method=s256 로 검증. */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}
