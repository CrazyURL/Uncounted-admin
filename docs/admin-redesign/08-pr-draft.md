# STAGE 8 — PR 초안

본 문서는 다음 세션에서 PR 생성 시 그대로 사용 가능한 본문이다.

**브랜치**: `feat/admin-ux-overhaul`
**대상**: `main`
**제목**: `feat(admin): BM v10 UX 전면 개편 — 검수·납품·정산 풀스택`

---

## PR 본문

```markdown
## 변경 요약

BM v10 (50:50 분배 / 연간 한도 ₩3,000,000 / 발화 단위 정산 / 비배타적 라이선스) 도입에 맞춰 admin UX를 전면 개편.

### 핵심 흐름 풀스택 구현
- **양측 동의 → 처리 흐름 5단계 → 검수 5단계 → 비배타적 납품 → 정산** 끊김 없이 흐름
- 6개 신규/재작성 페이지 + 5개 백엔드 라우트 + 12개 공용 컴포넌트
- 한국어 라벨 통일 (`labels.ts` 단일 출처)
- 디자인 토큰 정의 (`design-tokens.ts` — light/dark 자동)

### 신규 페이지 (5개)
- `AdminReviewQueuePage` `/admin/review` — 검수 5단계 상태머신 + 처리 흐름 5도트
- `AdminDeliveryCreatePage` `/admin/delivery/new` — 비배타적 라이선스 (동일 매수자 차단 / 다른 매수자 진행)
- `AdminTransactionsPage` `/admin/transactions` — 매수자별 deliveries 이력
- `AdminBalancesPage` `/admin/balances` — 사용자별 한도 도달률 + 80% 임박 경고
- `AdminUtterancesPage` `/admin/utterances` — 발화 단위 정산 (BU 페이지 대체)

### 재작성 페이지 (1개)
- `AdminDashboardPage` `/admin` — 5탭 (양측 동의 / 처리 흐름 / 검수 / 납품 / 이상 신호)

### 신규 백엔드 라우트 (5개)
- `/api/admin/reviews/*` — 검수 대기열 + 전이 검증
- `/api/admin/deliveries/*` — 비배타적 라이선스 핵심 (`/check` 중복 검증)
- `/api/admin/dashboard-stats` — 5탭 카운트 일괄
- `/api/admin/balances` — 사용자별 정산 + 한도 도달률 (utterance 우선, sessions.duration fallback)
- `/api/admin/utterances-v2/*` — 발화 단위 정산

### 인프라 변경
- 마이그레이션 052 — `sessions` 처리 흐름 + 검수 컬럼 11개 추가
- 마이그레이션 053 폐기 메모 (delivery_records UNIQUE 안 → deliveries 테이블로 대체)
- 마이그레이션 054 — `deliveries` 테이블 신설 (UNIQUE(session_id, client_id))
- 마이그레이션 055 — `billable_units` / `bu_quality_metrics` / `session_chunks` 폐기 + utterances 정산 컬럼

### 약관 v1.3
- `legal/terms_of_service_draft_ko.md` 제19조 — "1 통화 = 1회 판매" → 비배타적 라이선스 (동일 매수자 1회 + 다른 매수자 추가 가능)

### 정리 스크립트
- `scripts/analysis/cleanup_pre_2026_05_01.mjs` — 2026-05-01 cutoff 기반 storage 정리 (dry-run 기본)

## 자체 검증 결과

### TypeScript
- ✅ Admin: `npx tsc -b --pretty false` → exit 0
- ✅ API: `npx tsc --noEmit --pretty false` → exit 0

### STAGE 0 루브릭 (25개 항목)
- 정량 7개: 5/7 PASS, 2/7 TBD (Lighthouse Perf / FCP / axe-core 측정 필요)
- 정성 8개: 모든 페이지 6~8/8 PASS (해당 N/A 제외)
- 일관성 4개: 4/4 PASS (디자인 토큰 / 액션 / 컴포넌트 / 한국어)
- BM v10 정합 6개: 6/6 PASS

상세: `uncounted-admin/docs/admin-redesign/07-final-review.md`

### E2E 시나리오 (수동 검증)
6개 시나리오 정의 — 자동화는 후속 작업
- A: 검수 → 납품 해피 패스
- B: 비배타적 — 같은 매수자 차단
- C: 비배타적 — 다른 매수자 진행
- D: 한도 도달 사용자 표시
- E: 종합 현황 5탭
- F: 발화 단위 정산

상세: `uncounted-admin/docs/admin-redesign/06-e2e-report.md`

## 작업 통계

| 카테고리 | 파일 수 | 줄수 |
|---|---|---|
| SQL 마이그레이션 | 4 | ~120 |
| 정리 스크립트 | 1 | ~450 |
| 약관 개정 | 1 | ~10 |
| 문서 (rubric/discovery/gap/e2e/review/PR/progress) | 7 | ~2,000 |
| 라벨 + 디자인 토큰 | 2 | ~390 |
| 공용 UI 컴포넌트 | 13 | ~1,200 |
| 신규/재작성 프론트 페이지 | 6 | ~1,800 |
| API 클라이언트 | 5 | ~250 |
| 백엔드 라우트 | 5 | ~700 |
| 타입 + 라우트/네비 | 3 | ~100 |
| **합계** | **47** | **~7,020** |

## 미해결 / 후속 작업

### Phase 0.6 utterance 단위 정산 백엔드 (별도 PR 권장)
- `packageBuilder.ts` (1125줄) utterance 단위 export 재작성
- `admin-exports.ts` (1176줄) BU select → utterance select
- `distributeVRevenue.ts` + `yearlyReward.ts` 재계산
- balances 백엔드는 본 PR 에서 utterance 우선 + fallback 으로 마이그레이션 완료

### STAGE 5 잔여 21개 페이지 점진 개편 (별도 PR)
- B-rated 12개 — 한국어화 + 컴포넌트 통일
- C-rated 6개 (SessionList, BuildWizard, ExportJobs, ExportJobDetail, Settlement) — Phase 0.6 의존
- D-rated 3개 (Calls / BU / Settlement) — 시드 운영 검증 후 라우트 제거

### 측정 보강
- Lighthouse Performance / Accessibility (모든 신규 페이지)
- axe-core CLI (모든 신규 페이지)
- Playwright E2E 자동화 (시나리오 A~F)

## 마이그레이션 적용 가이드

> **주의**: 본 PR 머지 전 dev DB 에 마이그레이션 적용 필수.

```sh
# 1. CASCADE 사전 영향 검증 (마이그레이션 055)
psql $DATABASE_URL << 'SQL'
SELECT table_schema, table_name, view_definition
FROM information_schema.views
WHERE view_definition ILIKE '%billable_units%' OR view_definition ILIKE '%session_chunks%';

SELECT conname, conrelid::regclass FROM pg_constraint
WHERE confrelid IN ('billable_units'::regclass, 'session_chunks'::regclass);
SQL

# 2. 마이그레이션 적용
cd uncounted-api
psql $DATABASE_URL -f supabase/migrations/052_sessions_pipeline_status.sql
psql $DATABASE_URL -f supabase/migrations/054_deliveries_nonexclusive.sql
psql $DATABASE_URL -f supabase/migrations/055_drop_billable_units.sql

# 3. 정리 스크립트 (선택)
node scripts/analysis/cleanup_pre_2026_05_01.mjs           # dry-run
# node scripts/analysis/cleanup_pre_2026_05_01.mjs --apply  # 실제 정리
```

## 테스트 플랜

- [ ] 마이그레이션 052/054/055 dev DB 적용
- [ ] CASCADE 사전 영향 검증 (055)
- [ ] cleanup 스크립트 dry-run 출력 검토
- [ ] STAGE 6 시나리오 A 수동 검증
- [ ] STAGE 6 시나리오 B 수동 검증 (중복 차단)
- [ ] STAGE 6 시나리오 C 수동 검증 (다른 매수자 진행)
- [ ] STAGE 6 시나리오 D 수동 검증 (한도 도달)
- [ ] STAGE 6 시나리오 E 수동 검증 (5탭)
- [ ] STAGE 6 시나리오 F 수동 검증 (발화 단위)
- [ ] 모바일 375px 시나리오 A 반복

## 스크린샷

(빌드 후 추가 — Dashboard 5탭 / ReviewQueue / DeliveryCreate / Transactions / Balances / Utterances)
```

---

## PR 생성 명령

```sh
cd c:/Users/user/Documents/project/uncounted-root/uncounted-admin
git checkout -b feat/admin-ux-overhaul
git add src/ docs/ ../uncounted-api/src/ ../uncounted-api/supabase/ ../scripts/ ../legal/
git commit -m "feat(admin): BM v10 UX 전면 개편 — 검수·납품·정산 풀스택"
git push -u origin feat/admin-ux-overhaul

# uncounted-admin 단독 PR
gh pr create --title "feat(admin): BM v10 UX 전면 개편 — 검수·납품·정산 풀스택" --body-file docs/admin-redesign/08-pr-draft.md
```

> ⚠️ **저장소 분리 주의**: uncounted-admin / uncounted-api / 루트(legal, scripts) 는 각각 독립 git repo. 본 작업은 3개 repo 에 걸쳐 있으므로 **3개 PR 분리** 권장:
> 1. `uncounted-admin` — 프론트엔드 (페이지 + 컴포넌트 + 라우트 + 문서)
> 2. `uncounted-api` — 백엔드 (라우트 + 마이그레이션)
> 3. 루트 — `legal/terms` + `scripts/analysis/cleanup_pre_2026_05_01.mjs`

각 PR 본문은 위 본문에서 해당 부분만 발췌 사용.
