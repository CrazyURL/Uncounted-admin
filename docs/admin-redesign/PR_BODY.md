## 변경 요약

BM v10 (50:50 분배 / 연간 한도 ₩3,000,000 / 발화 단위 정산 / 비배타적 라이선스) 도입에 맞춰 admin UX를 전면 개편. uncounted-api 의 BM v10 마이그레이션 + 라우트 (commit 7076296) 와 짝지어 동작.

### 핵심 흐름 풀스택 구현
양측 동의 → 처리 흐름 5단계 → 검수 5단계 → 비배타적 납품 → 정산 끊김 없이 흐름.

### 신규 페이지 5개
- `/admin/review` — 검수 5단계 상태머신 + 처리 흐름 5도트
- `/admin/delivery/new` — 비배타적 라이선스 (동일 매수자 차단 / 다른 매수자 진행)
- `/admin/transactions` — 매수자별 deliveries 이력
- `/admin/balances` — 사용자별 한도 도달률 + 80% 임박 경고
- `/admin/utterances` — 발화 단위 정산 (BU 페이지 대체)

### 재작성 페이지 1개
- `AdminDashboardPage` `/admin` — 5탭 (양측 동의 / 처리 흐름 / 검수 / 납품 / 이상 신호)

### 디자인 시스템
- `src/lib/design-tokens.ts` — light/dark CSS var 노출 + spacing/radius/font/motion
- `src/lib/labels.ts` — 한국어 통일 매핑 (status/review/consent/grade/payout/pipeline/action/noun/empty/error/toast/confirm/warning)
- `src/components/ui/` — 12개 공용 컴포넌트 + 배럴 (Button/Badge/Card/EmptyState/Skeleton/ErrorState/Modal+ConfirmDialog/Toast 어댑터/Input/Select/DataTable/StatusBadge)

### 라우팅 + 네비
- `routes.tsx`: 4개 신규 라우트
- `AdminNav.tsx`: "검수" 그룹 신설 (대기열 / 납품 등록 / 거래 / 잔액)

## 자체 검증 결과

### TypeScript
`npx tsc -b --pretty false` → exit 0

### STAGE 0 루브릭 (25개 항목)
- 정량 7개: 5/7 PASS, 2/7 TBD (Lighthouse Perf / FCP / axe-core 측정 필요)
- 정성 8개: 모든 페이지 6~8/8 PASS (해당 N/A 제외)
- 일관성 4개: 4/4 PASS (디자인 토큰 / 액션 / 컴포넌트 / 한국어)
- BM v10 정합 6개: 6/6 PASS

상세: `docs/admin-redesign/07-final-review.md`

### E2E 시나리오 (수동 검증)
6개 시나리오 정의 — 자동화는 후속 작업 (`docs/admin-redesign/06-e2e-report.md`):
- A: 검수 → 납품 해피 패스
- B: 비배타적 — 같은 매수자 차단
- C: 비배타적 — 다른 매수자 진행
- D: 한도 도달 사용자 표시
- E: 종합 현황 5탭
- F: 발화 단위 정산

## 의존성

본 PR 은 uncounted-api 의 다음 변경에 의존:
- 마이그레이션 052 (sessions 처리 흐름 컬럼) — DB 적용 완료 ✅
- 마이그레이션 054 (deliveries 테이블) — DB 적용 완료 ✅
- 마이그레이션 055 (BU 폐기) — DB 적용 완료 ✅
- 신규 라우트 5개 (admin-reviews / deliveries / dashboard / balances / utterances-v2) — uncounted-api commit 7076296

uncounted-api 가 Render 에 배포되어야 본 admin 페이지 동작.

## 데이터 정리 결과 (cleanup_pre_2026_05_01.mjs --apply)

- 보존: 919 sessions (consent_status='both_agreed' AND consented_at >= 2026-05-01)
- 삭제: 7,086 sessions (88%)
- Storage: sanitized-audio 1 객체 삭제
- 자식 테이블 (utterances/transcripts 등): 모두 0건 (이미 비어있음)

## 작업 통계
- 신규 파일: 30+
- 변경 라인: ~6,200
- 신규 라우트: 5
- 신규 컴포넌트: 12

## 미해결 / 후속 작업

- Phase 0.6 — `packageBuilder.ts` (1125줄) utterance 단위 export 재작성 (별도 PR)
- STAGE 5 잔여 — B-rated 12개 페이지 한국어화 + 컴포넌트 통일 (별도 PR)
- Lighthouse + axe-core 자동 측정 (별도 작업)
- Playwright E2E 자동화 (별도 작업)

## 테스트 플랜

- [x] 마이그레이션 052/054/055 dev DB 적용
- [x] cleanup 스크립트 적용 (919 보존 / 7086 삭제)
- [ ] uncounted-api Render Manual Deploy
- [ ] STAGE 6 시나리오 A 수동 검증
- [ ] STAGE 6 시나리오 B 수동 검증 (중복 차단)
- [ ] STAGE 6 시나리오 C 수동 검증 (다른 매수자 진행)
- [ ] STAGE 6 시나리오 D 수동 검증 (한도 도달)
- [ ] STAGE 6 시나리오 E 수동 검증 (5탭)
- [ ] STAGE 6 시나리오 F 수동 검증 (발화 단위)
- [ ] 모바일 375px 시나리오 A 반복

🤖 Generated with [Claude Code](https://claude.com/claude-code)
