---
paths: src/lib/**
---

## 인증 구조

- **방식**: Google OAuth → API 서버 중계 (Supabase SDK 미사용)
- **세션**: httpOnly 쿠키 (`uncounted_session`, `uncounted_refresh`) + 인메모리 `access_token`
- **토큰**: localStorage에 `uncounted_access_token` 저장, `Authorization: Bearer` 헤더 전송
- **만료 처리**: 401 수신 → `/api/auth/refresh` 1회 재시도 → 실패 시 `SIGNED_OUT` 이벤트 발행

## API 클라이언트 패턴

- 모든 요청/응답 AES-256-GCM 암호화 (`lib/crypto.ts`)
- `apiFetch<T>(endpoint, options)` 래퍼 사용 → `{ data?, error?, count? }` 반환
- `VITE_API_URL` 환경 변수로 백엔드 URL 설정 (기본값: `http://localhost:3001`)

## 환경 변수

```
VITE_API_URL=http://localhost:3001   # 백엔드 API 서버 주소
```
