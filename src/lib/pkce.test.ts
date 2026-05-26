import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, codeChallengeS256, PKCE_VERIFIER_KEY } from './pkce'

describe('pkce', () => {
  it('codeChallengeS256 matches the RFC 7636 Appendix B test vector', async () => {
    // RFC 7636 §B: verifier → S256 challenge
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(await codeChallengeS256(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('generateCodeVerifier returns a 43-char base64url string and is unique', () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('challenge is base64url without padding', async () => {
    const c = await codeChallengeS256(generateCodeVerifier())
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(c).not.toContain('=')
  })

  it('exposes a stable sessionStorage key', () => {
    expect(PKCE_VERIFIER_KEY).toBe('uncounted_pkce_verifier')
  })
})
