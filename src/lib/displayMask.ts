// ── displayMask — DEPRECATED (STAGE 6) ─────────────────────────────────────
//
// 휴리스틱 마스킹은 admin 보안에 구조적으로 부적합 — false-negative = PII leak.
// 사례:
//   - "녹음"의 "녹"이 한국 성씨 set 에 잘못 매칭 → "녹*" (false-positive)
//   - "종일이형"의 "종"이 set 에 없어 마스킹 누락 → 사용자 별명 노출 (false-negative)
//
// STAGE 6 에서 백엔드 display_title (`통화#000042 · 2026-05-02 · 30초`) 로 단일화.
// admin 의 모든 통화 표시는 이미 백엔드에서 합성된 라벨 → 추가 마스킹 불필요.
//
// 본 파일의 export 함수들은 호출처 코드가 깨지지 않도록 identity 함수로 보존.
// 향후 PR 에서 호출처 정리 후 완전 삭제 예정.

import { extractContactName } from './contactUtils'

/**
 * @deprecated STAGE 6 — 백엔드 display_title 가 책임. 입력 그대로 반환.
 */
export function maskContactName(name: string): string {
  if (!name) return name
  return name
}

/**
 * @deprecated STAGE 6 — 백엔드 display_title 가 책임. 입력 그대로 반환.
 */
export function maskFilePath(filePath: string | null): string | null {
  return filePath
}

/**
 * @deprecated STAGE 6 — 백엔드 display_title 가 책임. 입력 그대로 반환.
 * App 측 (uncounted_client) 의 maskSessionTitle 은 별도 — 본 함수와 무관.
 */
export function maskSessionTitle(title: string): string {
  return title
}

// extractContactName 은 contactUtils 에서 직접 import 권장 — 본 모듈은 deprecated.
export { extractContactName }
