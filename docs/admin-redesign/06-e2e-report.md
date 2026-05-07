# STAGE 6 — 통합 E2E 시나리오

본 문서는 BM v10 admin 흐름의 6개 핵심 시나리오를 정의한다. Playwright 자동화는 추후 작업, 본 단계는 **수동 검증**을 우선한다.

각 시나리오는:
- 사전 조건 (필요한 시드 데이터)
- 단계별 액션 + 기대 결과
- 합격 시간 기준
- 실패 시 디버깅 체크리스트

---

## 시나리오 A: 검수 → 납품 (해피 패스)

**목적**: 양측 동의 통화가 GPU 처리 → 검수 승인 → 납품 등록까지 끊김 없이 흐르는지 검증.

**합격 시간**: 5분 (검수 1건 + 납품 1건)

### 사전 조건
- DB: 양측 동의(`consent_status='both_agreed'`) sessions 1건 이상
- DB: 모든 처리 흐름 완료 (`upload_status=stt_status=diarize_status=pii_status=quality_status='done'`)
- DB: 매수자(`clients` 테이블) 1건 이상

### 단계
1. `/admin` 접속 → "검수" 탭 클릭 → `pending` 카운트 ≥ 1 확인
2. "검수 대기열 열기" 버튼 → `/admin/review` 진입
3. 첫 번째 행 → 처리 흐름 5개 도트 모두 초록(✅ done) 확인
4. "수정 요청" 버튼 → 모달 → "확인" → 토스트 "수정 요청 처리되었습니다"
5. 검수 상태 필터 → "수정 필요" 선택 → 해당 통화가 표시되는지 확인
6. 행 → "승인" 버튼 (※ pending → in_review 가 안 됐다면 수동으로 SQL: `UPDATE sessions SET review_status='in_review' WHERE id='...'`)
   - 실제 흐름은 `pending` → `in_review` (자동 또는 트리거) → `approved`
7. 승인 후 `/admin/delivery/new` 진입 → 통화 드롭다운에 방금 승인한 통화 표시
8. 매수자 선택 → 매출금액 입력 (예: ₩1,500,000) → "납품 (₩1,500,000)" 버튼
9. 모달 → "납품" → 토스트 "납품 처리되었습니다" → `/admin/transactions` 자동 이동
10. `/admin/transactions` 에서 방금 등록한 행 확인

### 디버깅 체크리스트
- [ ] 백엔드 `/api/admin/reviews` 응답 200 (DevTools Network)
- [ ] `sessions.review_status` DB 변경 확인 (Supabase Dashboard 또는 SQL)
- [ ] `deliveries` 테이블에 행 추가 확인
- [ ] 401 발생 시: `/auth` 재로그인 + admin role 확인

---

## 시나리오 B: 비배타적 — 같은 매수자 차단

**목적**: 동일 매수자에 대한 중복 납품 시도가 차단되는지 검증.

**합격 시간**: 1분

### 사전 조건
- 시나리오 A 완료 (deliveries 테이블에 (session_X, client_Y) 1건 존재)

### 단계
1. `/admin/delivery/new` 진입
2. 통화 드롭다운 → 시나리오 A 의 session_X 선택
3. 매수자 드롭다운 → 시나리오 A 의 client_Y 선택
4. **빨간 박스 표시 확인**: "이미 이 매수자에 납품된 데이터입니다"
5. 매출금액 입력해도 "납품" 버튼 **disabled** 상태 확인
6. 모달이 열리지 않음 (버튼 비활성)

### 합격 기준
- 빨간 박스 메시지 노출
- "납품" 버튼 disabled
- 백엔드 `/api/admin/deliveries/check` 응답 `duplicate=true`

---

## 시나리오 C: 비배타적 — 다른 매수자 진행 가능

**목적**: 동일 통화를 다른 매수자에 추가 납품할 수 있는지 검증.

**합격 시간**: 2분

### 사전 조건
- 시나리오 A 완료
- 매수자(`clients`) 2건 이상 (client_Y, client_Z)

### 단계
1. `/admin/delivery/new` 진입
2. 통화 드롭다운 → 시나리오 A 의 session_X 선택
3. 매수자 드롭다운 → client_Z 선택 (시나리오 A 의 client_Y 가 아닌)
4. **노란 박스 표시 확인**: "이미 다른 매수자에 납품된 데이터입니다"
5. 매수자 목록에 client_Y 가 표시됨 + 납품일 표시
6. 매출금액 입력 → "납품" 버튼 **활성** 상태 확인
7. "납품" 클릭 → 모달 본문이 일반(시나리오 A) 과 다름:
   "이미 다른 매수자에 납품된 데이터입니다. 비배타적 라이선스로 추가 납품을 진행하시겠습니까?"
8. "납품" 확인 → 토스트 + transactions 페이지 이동
9. `/admin/transactions` 에서 같은 session_X 가 두 행에 표시 (client_Y, client_Z)

### 합격 기준
- 노란 박스 + 비배타적 라이선스 안내
- 모달 메시지가 비배타적 흐름용으로 분기
- DB: `deliveries` 에 같은 session_id 가 client_id 다른 2건 존재

---

## 시나리오 D: 한도 도달 사용자 표시

**목적**: 연간 한도 ₩3,000,000 에 도달한 사용자가 명확히 표시되는지 검증.

**합격 시간**: 1분

### 사전 조건
- DB: 양측 동의 sessions 누적 발화 시간이 충분한 사용자 존재 (테스트용 → SQL 직접 삽입 가능)
  - 예: `INSERT INTO sessions (id, user_id, duration, consent_status, consented_at) VALUES (gen_random_uuid(), '<user_id>', 720, 'both_agreed', '2026-05-01T00:00:00Z')` × N
  - 720초 × N건 → N×0.2시간 → 시간당 ₩30,000 × 0.5 share = N×₩3,000 정산
  - 한도 도달까지 1,000건 필요 (시간당 ₩15,000 share × N×0.2h × 1000 = ₩3M)

### 단계
1. `/admin/balances` 접속
2. 4개 요약 카드 표시 확인 (총 사용자 / 한도 도달 / 80% 임박 / 합산 정산금)
3. "한도 도달" 카드 ≥ 1 → 표시되는 사용자 행 → 빨간 뱃지 "한도 도달"
4. 한도 도달률 컬럼: 100% + 빨간 바
5. "잔여 ₩0" 표시
6. 80% 임박 사용자가 있으면 노란 뱃지 "80% 임박"

### 합격 기준
- 사용자별 capRatio 계산 정확 (utterance 단위 우선, sessions.duration fallback)
- 색상 분기 정확 (녹/노/빨)

---

## 시나리오 E: 종합 현황 5탭 + 새로고침

**목적**: 대시보드 5탭이 모두 동작하고 새로고침 시 데이터 갱신.

**합격 시간**: 2분

### 단계
1. `/admin` 접속 → "양측 동의" 탭 기본 활성
2. 3개 BigStat 표시 (양측 동의 통화 / 누적 통화시간 / 검수 대기)
3. "처리 흐름" 탭 클릭 → 5개 단계 (업로드 / 음성 인식 / 화자 분리 / 개인정보 마스킹 / 품질 검증) 진행률 바 표시
4. 각 단계 진행률 = done/total × 100
5. "검수" 탭 → 5개 카운트 카드 (대기 중 / 검수 중 / 승인됨 / 거절됨 / 수정 필요) + "검수 대기열 열기" 버튼
6. "납품" 탭 → 총 납품 건수 + 30일 매출 + 최근 10건
7. "이상 신호" 탭 → 처리 흐름 실패 카운트 + 거절 카운트 + 각 카드 "보기" 버튼
8. 우상단 "새로고침" 버튼 → 데이터 재조회 (Network 탭에서 `/api/admin/dashboard-stats` 재요청 확인)

### 합격 기준
- 5탭 모두 표시 + 전환 동작
- 카드 클릭 시 해당 페이지로 이동 (예: 검수 대기 카드 → /admin/review)

---

## 시나리오 F: 발화 단위 정산 (BU 폐기 검증)

**목적**: 발화(utterance) 단위 정산이 BU 페이지를 대체하고 정확히 동작.

**합격 시간**: 2분

### 사전 조건
- `utterances` 테이블에 발화 1개 이상

### 단계
1. AdminNav → 인벤토리 → "발화" 메뉴 클릭 → `/admin/utterances`
2. 4개 요약 카드 (총 발화 / 정산 완료 / 미정산 / 예상 매출) 표시
3. 정산 상태 필터 → "미정산" 선택 → 해당 발화만 표시
4. 발화 검색 → 텍스트 일부 입력 → 필터 동작
5. 컬럼: 세션 / 발화자 / 시각 / 길이 / 발화 / 단가 / 정산
6. 단가 = `duration_seconds × 30,000 / 3600` 정확히 계산
7. URL 에 `?settled=no&q=...` 반영 → 뒤로가기 시 필터 복원

### 합격 기준
- 단가 계산 정확
- 정산 상태 뱃지 표시 (정산 완료 / 미정산)
- AdminNav 의 "유닛(레거시)" 클릭 시 기존 BU 페이지 표시 (점진 폐기)

---

## 검증 절차

### 사전 환경 준비

```sh
# 1. 마이그레이션 적용
cd uncounted-api
psql $DATABASE_URL -f supabase/migrations/052_sessions_pipeline_status.sql
psql $DATABASE_URL -f supabase/migrations/054_deliveries_nonexclusive.sql

# 055 적용 전 CASCADE 영향 사전 확인 — 마이그레이션 파일 상단 주석 SQL 3개 실행
psql $DATABASE_URL -f supabase/migrations/055_drop_billable_units.sql

# 2. 정리 스크립트 dry-run
node scripts/analysis/cleanup_pre_2026_05_01.mjs
# 출력 검토 후 실제 정리:
# node scripts/analysis/cleanup_pre_2026_05_01.mjs --apply
```

### 시드 데이터 (테스트 환경)

```sql
-- 1. 매수자 2건
INSERT INTO clients (id, name, active) VALUES
  (gen_random_uuid(), 'AcmeCorp', true),
  (gen_random_uuid(), 'BetaCorp', true);

-- 2. 검수 승인 sessions (시나리오 A 사전)
UPDATE sessions
   SET upload_status='done', stt_status='done', diarize_status='done',
       pii_status='done', quality_status='done', review_status='approved'
 WHERE consent_status='both_agreed'
 LIMIT 2;
```

### 기록

| 시나리오 | 합격 시간 | 실측 시간 | 결과 | 비고 |
|---|---|---|---|---|
| A | 5분 | TBD | TBD | |
| B | 1분 | TBD | TBD | |
| C | 2분 | TBD | TBD | |
| D | 1분 | TBD | TBD | |
| E | 2분 | TBD | TBD | |
| F | 2분 | TBD | TBD | |

**STAGE 6 합격 기준**: 6/6 통과.

---

## 향후: Playwright 자동화

본 문서의 시나리오는 다음 세션에서 Playwright 스크립트로 자동화 가능:

```ts
// 예시 — playwright/tests/admin-bm-v10.spec.ts
test.describe('BM v10 — 검수 + 납품 흐름', () => {
  test('A: 검수 → 납품 해피 패스', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('tab', { name: '검수' }).click()
    // ...
  })
})
```

자동화 작성 시 `data-testid` 속성을 신규 페이지에 추가하는 후속 작업 필요.
