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
- `VITE_API_URL` 환경 변수로 백엔드 URL 설정
  - **fallback 연산자는 `??` (nullish 전용)** — `client.ts:6` 참조
  - 미정의(`undefined`) 시에만 `http://localhost:3001`로 fallback
  - **빈 문자열(`""`) 설정 시 상대경로 모드** — `${API_BASE}${endpoint}` → `/api/...`
  - 동일 출처 리버스 프록시(예: nginx, Cloudflare Tunnel) 환경에서 사용

## 환경 변수

```
# .env (개발용) — 직접 백엔드 호출
VITE_API_URL=http://localhost:3001

# .env.production (프로덕션 빌드용) — 상대경로 모드
VITE_API_URL=
```

> `.env.production`은 빌드 시에만 적용되며, `serve -s dist`로 띄운 PM2 admin 프로세스가 사용한다.
> 터널/프록시 호스트가 변경되어도 admin 재빌드 불필요.

## 외부 노출 (Cloudflare Tunnel)

- `deploy/nginx-tunnel.conf` — 8080에서 `/api/*`→3001, `/*`→5000 리버스 프록시
- `deploy/setup-tunnel.sh` — nginx 설치/설정/cloudflared 재기동 자동화 (`sudo bash deploy/setup-tunnel.sh [--tunnel]`)
- 터널 호스트 변경 시: `uncounted-api/.env`의 `CORS_ORIGIN` 갱신 + `pm2 reload uncounted-api`
