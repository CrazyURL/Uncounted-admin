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
├── app/            # App.tsx (루트), routes.tsx (라우트 정의)
├── pages/
│   ├── AuthPage.tsx          # 로그인 (Google OAuth)
│   └── admin/                # 관리자 페이지 (/admin/*)
├── components/
│   ├── layout/               # AdminShell, AdminNav, TopBar, BottomNav
│   ├── common/               # 공통 UI
│   ├── domain/               # 도메인 특화
│   └── motion/               # Framer Motion 래퍼
├── lib/
│   ├── api/                  # client.ts, admin.ts, auth.ts, sessions.ts
│   ├── auth.ts / AuthContext.tsx
│   ├── adminStore.ts
│   └── crypto.ts             # AES-256-GCM
└── types/
```

## 핵심 규칙

- 모든 관리자 페이지는 `AdminShell` 레이아웃 안에서 렌더링
- 비인증 접근 시 `/auth`로 리다이렉트
- API 호출은 반드시 `lib/api/` 레이어를 통해서만 수행
- 컴포넌트 스타일은 Tailwind CSS 유틸리티 클래스 사용

## 상세 규칙 참조

| 파일 | 내용 |
|------|------|
| `.claude/rules/routes.md` | 관리자 라우트 전체 목록 |
| `.claude/rules/auth-api.md` | 인증 구조, API 클라이언트 패턴, 환경 변수 |