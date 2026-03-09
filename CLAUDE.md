# uncounted-admin — CLAUDE.md

## 프로젝트 개요

Uncounted 데이터 수집 플랫폼의 **관리자 전용 웹 앱**.
세션 목록, 데이터셋, SKU 카탈로그, 클라이언트 관리, 정산, 내보내기 작업 등을 운영한다.

## 기술 스택

| 항목 | 값 |
|------|-----|
| 프레임워크 | React 19 + Vite 6 |
| 라우팅 | React Router DOM 7 |
| 스타일 | Tailwind CSS 3 |
| 애니메이션 | Framer Motion 12 |
| AI/ML | @huggingface/transformers 3 |
| 암호화 | @noble/ciphers (AES-256-GCM) |
| 언어 | TypeScript 5.7 |

## 개발 명령어

```bash
yarn dev      # http://0.0.0.0:15173 (개발 서버)
yarn build    # tsc -b && vite build
yarn lint     # ESLint
```

## 디렉토리 구조

```
src/
├── app/
│   ├── App.tsx          # AuthProvider + RouterProvider 루트
│   └── routes.tsx       # 전체 라우트 정의
├── pages/
│   ├── AuthPage.tsx     # 로그인 페이지 (Google OAuth)
│   └── admin/           # 관리자 페이지 (모두 /admin/* 경로)
├── components/
│   ├── layout/          # AdminShell, AdminNav, TopBar, BottomNav
│   ├── common/          # 공통 UI 컴포넌트
│   ├── domain/          # 도메인 특화 컴포넌트
│   └── motion/          # Framer Motion 래퍼
├── lib/
│   ├── api/             # 백엔드 API 클라이언트
│   │   ├── client.ts    # fetch 래퍼 (암호화, 토큰 갱신)
│   │   ├── admin.ts     # Admin API 엔드포인트
│   │   ├── auth.ts      # 인증 API
│   │   └── sessions.ts  # 세션 API
│   ├── auth.ts          # 인증 상태 관리
│   ├── AuthContext.tsx   # React 인증 컨텍스트
│   ├── adminStore.ts    # 관리자 전역 상태
│   ├── crypto.ts        # AES-256-GCM 암호화/복호화
│   └── ...              # 각종 엔진/유틸리티
└── types/               # TypeScript 타입 정의
```

## 관리자 라우트 목록

| 경로 | 페이지 |
|------|--------|
| `/admin` | 대시보드 |
| `/admin/sessions` | 세션 목록 |
| `/admin/studio` | SKU 스튜디오 |
| `/admin/calls` | 통화 목록 |
| `/admin/units` | 과금 단위 |
| `/admin/labels` | 레이블 카탈로그 |
| `/admin/consents` | 동의 목록 |
| `/admin/sku-catalog` | SKU 카탈로그 |
| `/admin/sku-components` | SKU 구성 요소 |
| `/admin/quality-tiers` | 품질 등급 |
| `/admin/clients` | 클라이언트 |
| `/admin/delivery-profiles` | 납품 프로파일 |
| `/admin/sku-rules` | 클라이언트-SKU 규칙 |
| `/admin/build` | 빌드 위자드 |
| `/admin/jobs` | 내보내기 작업 |
| `/admin/settlement` | 정산 |
| `/admin/datasets` | 데이터셋 목록/상세 |
| `/admin/users/:userId` | 사용자 상세 |

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

## 주요 규칙

- 모든 관리자 페이지는 `AdminShell` 레이아웃 안에서 렌더링
- 비인증 접근 시 `/auth`로 리다이렉트
- API 호출은 반드시 `lib/api/` 레이어를 통해서만 수행
- 컴포넌트 스타일은 Tailwind CSS 유틸리티 클래스 사용
