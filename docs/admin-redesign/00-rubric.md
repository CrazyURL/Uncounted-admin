# STAGE 0 — 자체 검증 루브릭

본 루브릭은 admin UI/UX 전면 개편의 모든 단계에서 합격 기준이 된다. 1개라도 미달이면 해당 페이지는 **재작업**한다. "거의 됐다"는 불합격이다.

## 1. 정량 지표 (각 페이지마다 합격 기준)

| 지표 | 합격선 | 측정 방법 |
|---|---|---|
| Lighthouse Performance | ≥ 90 | Chrome DevTools Lighthouse, mobile preset |
| Lighthouse Accessibility | ≥ 95 | 동일 |
| First Contentful Paint | < 1.5s | Lighthouse |
| 인터랙션 응답 (클릭→피드백) | < 100ms | DevTools Performance recording |
| 모바일 viewport (375px) | 깨지지 않음 | Chrome DevTools device toolbar |
| 키보드 네비게이션 | Tab 만으로 모든 기능 접근 + Enter/Space 활성화 + Esc 모달 닫기 | 수동 검증 |
| axe-core 위반 | 0 건 | `axe-core` CLI 또는 DevTools 확장 |

## 2. 정성 지표 (페이지마다 검증)

| 항목 | 합격 기준 |
|---|---|
| 5초 판단 가능성 | 첫 화면에서 "지금 무엇을 해야 하는지" 5초 안에 판단 가능 |
| 빈 상태 (Empty) | 데이터 0건일 때 빈 상태 컴포넌트 노출 (아이콘 + 메시지 + 액션 버튼) |
| 로딩 상태 (Loading) | 모든 비동기 작업에 스켈레톤 또는 스피너 — 빈 화면 X |
| 에러 상태 (Error) | 모든 실패 케이스에 에러 박스 + 재시도 버튼 |
| 주요 액션 위치 | 우상단 또는 모바일 하단 고정 (스크롤해도 항상 접근 가능) |
| 위험 액션 | 빨간색 (`semantic.danger`) + 확인 모달 (ConfirmDialog) |
| 성공 피드백 | 토스트 (3초 자동 사라짐) — 새로고침으로 결과 확인 X |
| URL 상태 반영 | 검색·필터·정렬 상태가 URL 쿼리 파라미터에 반영되어 뒤로가기로 복원 가능 |

## 3. 일관성 지표

| 항목 | 합격 기준 |
|---|---|
| 디자인 토큰 | 모든 페이지 동일 토큰 (`src/lib/design-tokens.ts`) 사용. 하드코딩 색상 0건 |
| 액션 일관성 | 같은 의미의 액션은 같은 색·아이콘·위치 (예: "삭제"는 항상 빨간색 휴지통 아이콘) |
| 컴포넌트 재사용 | 테이블·카드·모달은 1회만 정의 (`src/components/ui/*`). 페이지별 커스텀 변형 X |
| 한국어 통일 | 모든 UI 텍스트 한국어 (`src/lib/labels.ts` 경유). 하드코딩 한국어/영어 0건 |

## 4. BM v10 정합 지표 (신규)

본 개편은 BM v10 (50:50 분배·연간 한도 ₩3,000,000·발화 단위 정산·비배타적 라이선스) 도입과 동시 진행된다. 따라서 다음 사항을 합격 기준에 추가한다.

| 항목 | 합격 기준 |
|---|---|
| 정산 단위 표시 | 발화(utterance) 단위로 노출. BU(billable_unit) 노출 X |
| 라이선스 표시 | "비배타적" 명시. "1회 판매" 또는 "독점" 표현 X |
| 연간 한도 | 사용자 화면에 한도 도달률 + 80% 임박 경고 배지 |
| 중복 판매 차단 | 납품 시 (session_id, client_id) 중복 검증 + 차단 모달 |
| 처리 흐름 가시성 | 파일별 STT/화자분리/PII/품질 단계 상태 표시 |
| 검수 상태머신 | 5단계 (`pending`/`in_review`/`approved`/`rejected`/`needs_revision`) 시각화 |

## 5. 합격선

- 모든 정량 지표 7/7 합격
- 모든 정성 지표 8/8 합격
- 모든 일관성 지표 4/4 합격
- 모든 BM v10 정합 지표 6/6 합격

**총 25개 합격 항목 100% 통과**가 작업 완료의 정의다.

## 6. 측정 도구

- Lighthouse: Chrome DevTools 기본 도구 또는 `lighthouse` CLI
- axe-core: `@axe-core/cli` 또는 Chrome DevTools "Issues" 패널
- 키보드 검증: 마우스 분리 후 수동 시도
- 모바일: Chrome DevTools device toolbar (iPhone SE 375×667)
- 한국어 검증: `grep -E "[a-zA-Z]{4,}" src/components` 후 모든 결과가 코드명·prop명인지 확인 (UI 텍스트 0건)

## 7. 재작업 규칙

- 25개 항목 중 1개라도 FAIL → 해당 페이지 작업 미완료 처리
- 다음 페이지로 넘어가지 않음
- 수정 후 25개 항목 전체 재검증
- "다른 페이지에서는 통과했으니 이건 봐줄 만하다" — 금지

## 8. 본 루브릭의 위치

- `docs/admin-redesign/00-rubric.md` — 본 문서
- 페이지별 자가 검증 결과: `docs/admin-redesign/pages/<page-name>.md` (STAGE 5)
- 최종 평가: `docs/admin-redesign/07-final-review.md` (STAGE 7)
