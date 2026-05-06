# Admin 개편 진행 상황

본 파일은 plan(`~/.claude/plans/declarative-stargazing-flurry.md`) 의 실행 상태를 기록한다.

## 완료 (2026-05-05 세션)

### Phase 0.1 — Storage 정리 스크립트
- ✅ `scripts/analysis/cleanup_pre_2026_05_01.mjs` (450줄)
- 보존 기준: `consent_status='both_agreed' AND consented_at >= '2026-05-01T00:00:00Z'`
- 삭제 대상: 비보존 sessions + 자식 테이블 + S3 storage objects
- 안전장치: dry-run 기본, 보존 0건 시 자동 중단, 사후 검증
- **상태**: 작성 완료, 적용 미실행. 운영자가 dry-run 후 `--apply` 결정.

### Phase 0.2 — 마이그레이션 052
- ✅ `uncounted-api/supabase/migrations/052_sessions_pipeline_status.sql`
- sessions 에 11개 컬럼 추가 (upload/stt/diarize/pii/quality_status + *_at + review_status)
- CHECK 제약 + 인덱스 + COMMENT
- **상태**: 작성 완료, 적용 미실행.

### Phase 0.3 — 053 폐기 메모
- ✅ `uncounted-api/supabase/migrations/053_DEPRECATED.md`
- 마이그레이션 053 (delivery_records UNIQUE) 폐기 사유 기록

### Phase 0.4 — 마이그레이션 054
- ✅ `uncounted-api/supabase/migrations/054_deliveries_nonexclusive.sql`
- `deliveries` 테이블 신설 (옵션 A: calls 미사용, sessions 직접 참조)
- `UNIQUE(session_id, client_id)` — 비배타적 라이선스 핵심 제약
- 049 v5 적용 여부 사전 확인 SQL 주석 포함
- **상태**: 작성 완료, 적용 미실행.

### Phase 0.5 — 마이그레이션 055
- ✅ `uncounted-api/supabase/migrations/055_drop_billable_units.sql`
- `billable_units` / `bu_quality_metrics` / `session_chunks` 폐기 (CASCADE)
- `utterances` 에 정산 컬럼 추가 (duration_seconds, unit_price_krw, settled_at)
- CASCADE 사전 영향 검증 SQL 3개 주석 포함
- **상태**: 작성 완료, 적용 미실행.

### Phase 0.6 — 백엔드 재작성 (DEFERRED)
- ❌ **별도 세션으로 분리**
- 사유: plan 추정 ~480줄, 실제 발견 ~2700줄 (6배 규모)
  - `packageBuilder.ts` 1125줄 (ZIP 빌드 + S3 multipart + quality grade)
  - `admin-exports.ts` 1176줄
  - `distributeVRevenue.ts` + `yearlyReward.ts` 362줄
- plan은 client-side `valueEngine.ts` 를 API에 있다고 가정했으나, 실제론 client-only
- API 정산 로직은 `lib/rewards/` + `lib/export/packageBuilder.ts` 분산 구조
- **권장**: 별도 작업 세션으로 단계별 재작성 — packageBuilder utterance 단위 → exports 라우트 → rewards 분배 순

### 약관 v1.3 — 비배타적 라이선스 개정
- ✅ `legal/terms_of_service_draft_ko.md` 제19조 (1 통화 = 1회 판매 → 비배타적 라이선스)
- 주의: plan 은 "제18조"로 표기했으나 실제 해당 조항은 제19조 (제18조는 운영비 정의)
- 6항 "개정 사유" 추가하여 v1.2 → v1.3 변경 근거 박음

### STAGE 0 — 자체 검증 루브릭
- ✅ `docs/admin-redesign/00-rubric.md`
- 25개 합격 항목 정의 (정량 7 + 정성 8 + 일관성 4 + BM v10 6)
- 100% 통과가 작업 완료의 정의

### STAGE 1 — Discovery
- ✅ `docs/admin-redesign/01-current-state.md`
- 21개 페이지 평가: A 1개 / B 12개 / C 6개 / D 2개
- 신규 5개 페이지 (transactions, balances, delivery/new, review, utterances) 식별
- 기술 스택 + 컴포넌트 재사용 후보 정리

### STAGE 3 — labels.ts (선행)
- ✅ `uncounted-admin/src/lib/labels.ts`
- 한국어 라벨 매핑 (status, review, consent, grade, payout, pipeline, action, noun, empty, error, toast, confirm, warning)
- 유틸 함수: `getStatusLabel`, `getReviewLabel`, `getConsentLabel`, `getGradeLabel`, `getCapacityWarning`
- STAGE 4 컴포넌트 + STAGE 5 페이지 작업의 기반

## 추가 완료 (2차 세션, 2026-05-06)

### STAGE 3 — design-tokens.ts
- ✅ `uncounted-admin/src/lib/design-tokens.ts`
- 기존 CSS 커스텀 프로퍼티 시스템 (라이트/다크 자동 전환) 위에서 TypeScript 토큰 노출
- color (CSS var 참조) + spacing + radius + shadow + font + motion + zIndex + breakpoint
- semantic 매핑 헬퍼: `statusColor`, `reviewColor`, `capacityColor`

### STAGE 4 — 공용 컴포넌트 12개 (`src/components/ui/`)
- ✅ Button (4 variants × 3 sizes + loading)
- ✅ Badge (5 tones × 2 sizes)
- ✅ Card + CardHeader + CardBody + CardFooter
- ✅ EmptyState + EmptyIcon
- ✅ Skeleton + SkeletonTableRow + SkeletonCard
- ✅ ErrorState + ErrorBanner
- ✅ Modal + ConfirmDialog (포커스 트랩 + ESC + body scroll lock)
- ✅ Toast 어댑터 (기존 `lib/toastContext.tsx` 위에 success/error/warning API)
- ✅ Input (label + hint + error + icons)
- ✅ Select (`SelectOption[]` props)
- ✅ DataTable (sortable / selectable / loading skeleton / empty fallback)
- ✅ StatusBadge (status / review / consent / grade 4종 통합)
- ✅ `index.ts` 배럴 export
- 모두 forwardRef + ARIA + 키보드 네비 + labels.ts 경유

### STAGE 5 — 핵심 신규 페이지 2개 + 라우트 결합

#### AdminReviewQueuePage (`/admin/review`)
- ✅ `src/pages/admin/AdminReviewQueuePage.tsx` (~330줄)
- 양측 동의 + 검수 상태 + 저품질 우선 필터 (URL 반영)
- 5단계 검수 카운트 카드 (pending/in_review/approved/rejected/needs_revision)
- 처리 흐름 5단계 도트 표시 (upload→stt→diarize→pii→quality) + 진행률%
- 행별 액션: 승인 / 수정 요청 / 거절 (확인 모달 + 토스트)
- 처리 흐름 미완 시 액션 자동 비활성

#### AdminDeliveryCreatePage (`/admin/delivery/new`)
- ✅ `src/pages/admin/AdminDeliveryCreatePage.tsx` (~270줄)
- 검수 승인된 통화 → 매수자 → 매출 입력 3단계 카드
- **비배타적 라이선스 핵심 검증**:
  - `(session_id, client_id)` 중복 시 빨간 박스 + 차단
  - 다른 매수자에 납품된 경우 노란 박스 + 진행 가능 (확인 모달에 별도 문구)
  - 첫 매수자인 경우 초록 박스
- 매출 ₩ 자동 포맷 + 50:50 분배 안내

#### API 클라이언트
- ✅ `src/lib/api/reviews.ts` — fetchReviewQueue / updateReviewStatus / fetchSessionDetail
- ✅ `src/lib/api/deliveries.ts` — fetchClients / checkDeliveryDuplicate / createDelivery / fetchApprovedSessions
- 백엔드 미구현 (Phase 0.6 deferred 와 함께 별도 세션) — 인터페이스만 정의

#### 타입
- ✅ `src/types/adminSession.ts` — SessionPipeline / AdminSession + 헬퍼 (isPipelineComplete, pipelineProgress, firstFailedStep)

#### 라우트 + 네비게이션
- ✅ `src/app/routes.tsx` — `/admin/review` + `/admin/delivery/new` 등록
- ✅ `src/components/layout/AdminNav.tsx` — 신규 "검수" 그룹 추가 (대기열·납품 등록)

### TypeScript 컴파일 검증
- ✅ `npx tsc -b --pretty false` → exit 0
- 신규 코드 ~1,800줄 모두 타입 안전

## 추가 완료 (3차 세션, 2026-05-06 후속)

### 백엔드 신규 라우트 4개

#### `uncounted-api/src/routes/admin-reviews.ts` (~210줄)
- `GET  /api/admin/reviews` — 검수 대기열 + 5단계 상태 카운트 + 필터 (review_status / consent_status / quality_low / search)
- `POST /api/admin/reviews/:sessionId` — review_status 전이 (전이 규칙 검증 — pending → in_review 는 파이프라인 완료 시만)
- `GET  /api/admin/sessions/:sessionId` — 단일 세션 상세
- `GET  /api/admin/sessions` — 검수 승인된 통화 목록 (납품 페이지용)

#### `uncounted-api/src/routes/admin-deliveries.ts` (~135줄)
- `GET  /api/admin/deliveries` — 납품 이력 + 페이지네이션 + client/session 필터
- `GET  /api/admin/deliveries/check` — **비배타적 라이선스 핵심 검증**
  - `duplicate=true` → 동일 매수자에 이미 납품 (UNIQUE 위반 예정)
  - `alreadyDeliveredToOthers=true` → 다른 매수자 납품 이력 (진행 가능)
- `POST /api/admin/deliveries` — INSERT (review_status=approved 사전 검증 + 23505 → 409 변환)

#### `uncounted-api/src/routes/admin-dashboard.ts` (~150줄)
- `GET /api/admin/dashboard-stats` — 5탭 카운트 일괄 반환
  - consent (양측 동의 카운트 + 24h 추이 + 통화시간 합산)
  - pipeline (5단계 × 4상태 분포)
  - review (5단계 카운트)
  - delivery (총 건수 + 30일 매출 + 최근 10건)
  - alerts (파이프라인 실패 + 거절 카운트)

#### `uncounted-api/src/routes/admin-balances.ts` (~95줄)
- `GET /api/admin/balances` — 사용자별 발화 시간 합산 + 정산금 계산 + 연간 한도 도달률
- 시드 단가: 30,000원/시간 × 0.5 share = 15,000원/시간
- 한도: ₩3,000,000 (소득세법 분리과세)

### 프론트엔드 신규 페이지 3개 + 재작성 1개

#### AdminDashboardPage (재작성, ~300줄)
- 기존 390줄 폐기 → BM v10 5탭 재작성
- 탭: 양측 동의 / 처리 흐름 / 검수 / 납품 / 이상 신호
- 처리 흐름 단계별 진행률 바 + 4상태 뱃지
- 카드 클릭 시 해당 페이지로 직접 이동

#### AdminBalancesPage (`/admin/balances`, ~200줄)
- 사용자별 발화 시간 / 총액 / 정산금(50%) / 연간 한도 도달률
- 4개 요약 카드 (총 사용자 / 한도 도달 / 80% 임박 / 합산 정산금)
- 한도 도달률 시각화 — 색상 자동 (녹색 < 80% / 노란 ≥ 80% / 빨간 ≥ 100%)
- 한도 도달 사용자 별도 뱃지 표시

#### AdminTransactionsPage (`/admin/transactions`, ~180줄)
- deliveries 테이블 기반 매수자별 납품 이력
- 매수자 필터 (URL 반영)
- 합산 매출 + 매수자 수 요약
- 비배타적 라이선스로 같은 통화가 여러 row 가능 — 중복 X (다른 client_id)
- 우상단 "납품 등록" 버튼 → /admin/delivery/new

### 라우팅 + 네비
- routes.tsx: 4개 신규 라우트 추가 (/admin/review, /admin/delivery/new, /admin/transactions, /admin/balances)
- AdminNav.tsx: 신규 "검수" 그룹 (대기열 / 납품 등록 / 거래 / 잔액)

### TypeScript 검증
- ✅ Admin: `npx tsc -b --pretty false` → exit 0
- ✅ API: `npx tsc --noEmit --pretty false` → exit 0
- 양쪽 모든 신규 코드 타입 안전

## 추가 완료 (4차 세션, 2026-05-06 후속)

### AdminUtterancesPage `/admin/utterances` — BU 대체
- ✅ `uncounted-api/src/routes/admin-utterances-v2.ts` (~110줄)
  - `GET /api/admin/utterances-v2` — 발화 목록 + 필터 (settled / sessionId / search)
  - `GET /api/admin/utterances-v2/stats` — 정산 합계 + 미정산 카운트 + 예상 매출
  - 단가 산정: `duration_seconds × 30,000원/h / 3600`
- ✅ `uncounted-admin/src/lib/api/utterances.ts` — API 클라이언트
- ✅ `uncounted-admin/src/pages/admin/AdminUtterancesPage.tsx` (~210줄)
  - 발화 목록 + 정산 상태 (정산 완료 / 미정산)
  - 4개 요약 카드 (총 발화 / 정산 완료 / 미정산 / 예상 매출)
  - URL 반영 필터 (정산 상태 / 세션 ID / 발화 검색)
- ✅ 라우트 등록 + AdminNav inventory 그룹에 "발화" 추가, "유닛"은 "유닛(레거시)" 표기

### STAGE 2 — 갭 분석
- ✅ `docs/admin-redesign/02-gap-analysis.md`
- 21개 페이지 5관점 점검 + 6개 그룹별 분류
- 우선순위 + 폐기 대상 명시
- 일관성 갭 정리 (디자인 토큰 / 한국어 / 컴포넌트 / 모바일 / URL 상태)
- 완료 기준 명시

### Phase 0.6 부분 — admin-balances utterance 우선화
- ✅ `admin-balances.ts` 재작성: utterances duration_seconds 합산 우선, sessions.duration fallback
- 응답에 `durationSource` 필드 추가 ('utterance' / 'session' / 'mixed')
- packageBuilder/admin-exports/distributeVRevenue 재작성은 별도 세션

### STAGE 6 — E2E 시나리오
- ✅ `docs/admin-redesign/06-e2e-report.md`
- 6개 수동 검증 시나리오 (A~F)
  - A: 검수 → 납품 해피 패스
  - B: 비배타적 — 같은 매수자 차단
  - C: 비배타적 — 다른 매수자 진행
  - D: 한도 도달 사용자 표시
  - E: 종합 현황 5탭
  - F: 발화 단위 정산 (BU 폐기)
- 사전 환경 + 시드 데이터 SQL + 디버깅 체크리스트 + 결과 기록 표
- Playwright 자동화는 후속 작업으로 분리

### STAGE 7 — 최종 자체 평가
- ✅ `docs/admin-redesign/07-final-review.md`
- 25개 루브릭 항목으로 6개 페이지 점검
- 코드 검토 기준 6/6 PASS (조건부 — Lighthouse / FCP / axe-core 측정 보강 필요)
- TBD 5개 항목 다음 세션 측정

### STAGE 8 — PR 초안
- ✅ `docs/admin-redesign/08-pr-draft.md`
- 그대로 사용 가능한 PR 본문
- 마이그레이션 적용 가이드 + 테스트 플랜 + 작업 통계
- 저장소 분리 주의 (uncounted-admin / uncounted-api / 루트 — 3개 PR 분리 권장)

## 미완료 — 다음 세션

### 가장 시급
1. **Phase 0.6 백엔드 재작성** (별도 세션 권장)
   - utterance 단위 정산 로직 — `packageBuilder.ts` 발화 단위 export
   - rewards 모듈 utterance 단위 재계산
   - admin-exports 라우트 정정

2. **STAGE 2 — 갭 분석** (`02-gap-analysis.md`)
   - 21개 페이지 5관점 점검

3. **STAGE 3 (남은 부분) — design-tokens.ts**
   - 디자인 토큰 정의 (color/spacing/radius/shadow/font/motion)
   - WCAG AA 검증

### 본격 작업
4. **STAGE 4 — 공용 컴포넌트 25개**
   - 기본 (Button, Input, Select 등) + 레이아웃 (Card, Modal, Drawer 등) + 데이터 (DataTable, EmptyState 등) + 피드백 (Toast, ConfirmDialog 등)
   - 모두 labels.ts 경유, axe-core 0건

5. **STAGE 5 — 페이지별 개편 (우선순위 1~8)**
   - AdminExportPage → 발화 검수 → PII 마스킹 → 사용자 관리 → 거래/정산 → 동의 모니터링 → 종합 현황 → 설정·로그

6. **STAGE 6 — E2E 시나리오 6개**
   - A~E + F (비배타적 납품)

7. **STAGE 7 — 최종 자체 평가**
   - 25개 루브릭 항목 100% 통과 검증

8. **STAGE 8 — `feat/admin-ux-overhaul` PR 생성**

## 작업 통계 (1차 + 2차 + 3차 + 4차 + 5차 세션 누적)

| 카테고리 | 파일 수 | 줄수 |
|---|---|---|
| SQL 마이그레이션 | 3 + 1 폐기 메모 | ~120 |
| 정리 스크립트 | 1 | ~450 |
| 약관 개정 | 1 | ~10 (수정) |
| 문서 (rubric/discovery/gap/e2e/review/PR/progress) | 7 | ~2,000 |
| 라벨 + 디자인 토큰 | 2 | ~390 |
| 공용 UI 컴포넌트 (12개 + 배럴) | 13 | ~1,200 |
| 신규 프론트 페이지 (5개) | 5 | ~1,500 |
| 재작성 프론트 페이지 (Dashboard) | 1 | ~300 |
| API 클라이언트 (5개) | 5 | ~250 |
| 백엔드 라우트 (5개, balances utterance 우선화 포함) | 5 | ~700 |
| 타입 (adminSession) | 1 | ~70 |
| 라우트 + 네비 | 2 | ~30 (수정) |
| **합계** | **47** | **~7,020** |

TypeScript 검증:
- Admin: `npx tsc -b` exit 0
- API: `npx tsc --noEmit` exit 0
- 양쪽 모든 신규 코드 타입 안전

## 주요 결정 기록

- **옵션 A 채택**: 049 v5 calls 테이블 미도입. sessions 가 통화 단위 겸함. fingerprint·ambiguous_matches·call_clusters 모두 M3+ 보류
- **review_status 5단계 상태머신**: pending → in_review → approved | rejected | needs_revision (needs_revision → in_review 재전환)
- **CASCADE 사전 검증 의무화**: 마이그레이션 055 적용 전 의존 객체 3개 쿼리로 확인
- **약관 versioning**: v1.2 → v1.3 (비배타적 라이선스 명시)
- **labels.ts 강제 경유**: 모든 UI 텍스트는 labels.ts 만 참조, 하드코딩 한국어/영어 0건
