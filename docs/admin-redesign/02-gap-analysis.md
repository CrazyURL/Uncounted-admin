# STAGE 2 — 갭 분석

본 문서는 [STAGE 1 Discovery](01-current-state.md) 의 21개 페이지를 5관점으로 점검하여 개편 방향을 정한다.

5관점:
1. **정보 구조** — 가장 중요한 정보가 첫 화면에 있는가?
2. **워크플로우** — 주 사용 흐름이 3클릭 이내인가?
3. **시각 위계** — 무엇이 액션·정보·메타인지 명확한가?
4. **상태 처리** — Empty / Loading / Error / Success 4상태가 모두 있는가?
5. **모바일** — 375px 에서 사용 가능한가?

각 페이지 평가는 **A** (개편 불필요) / **B** (부분 개편) / **C** (전면 개편) / **D** (폐기 검토).

---

## 그룹 1: 대시보드 (1개)

### AdminDashboardPage `/admin` — **C → 재작성 완료 (3차 세션)**

| 관점 | 기존 갭 | 처리 |
|---|---|---|
| 정보 구조 | 통화 카운트 + 사용자 목록 위주, BM v10 흐름 부재 | ✅ 5탭으로 재작성 (양측 동의 / 처리 흐름 / 검수 / 납품 / 이상 신호) |
| 워크플로우 | 클릭→이동 흐름 명확 X | ✅ 카드 클릭 → 해당 페이지 직접 이동 |
| 시각 위계 | 동일한 카운트 카드 반복, 액션 부재 | ✅ BigStat + 새로고침 버튼 + 탭 |
| 상태 처리 | 로딩/에러 상태 미흡 | ✅ DashboardSkeleton + ErrorBanner |
| 모바일 | 그리드 미응답 | ✅ `grid-cols-1 md:grid-cols-3` 반응형 |

---

## 그룹 2: 인벤토리 (5개)

### AdminSessionListPage `/admin/sessions` — **C → 다음 세션**
| 관점 | 갭 | 개편 방향 |
|---|---|---|
| 정보 구조 | 처리 흐름 단계별 컬럼 없음 | upload/stt/diarize/pii/quality 5단계 도트 컬럼 추가 (StatusBadge 재사용) |
| 워크플로우 | review_status 필터 없음 | URL 반영 필터 + StatusBadge |
| 시각 위계 | 양측 동의 / 카운트 / 통화시간 합산 표시 X | 헤더 상단 SummaryCard 4개 |
| 상태 처리 | 빈 상태 메시지 약함 | EmptyState + EmptyIcon |
| 모바일 | 테이블 가로 스크롤 미흡 | DataTable의 `overflow-x-auto` 사용 |

### AdminCallsPage `/admin/calls` — **D → 폐기 검토**
- 옵션 A 결정: 049 v5 calls 테이블 미도입. sessions 가 통화 단위 겸함.
- 본 페이지 폐기. AdminSessionListPage 에 통합.
- AdminNav 에서 "통화" 항목 삭제 검토 (or AdminSessionListPage 별칭).

### AdminBillableUnitsPage `/admin/units` — **D → 폐기 (3차 세션 대체 완료)**
- BU 폐기 (마이그레이션 055).
- ✅ AdminUtterancesPage `/admin/utterances` 가 대체. AdminNav 에 "발화" 추가, "유닛"은 "유닛(레거시)" 표기.
- 시드 운영 검증 후 AdminBillableUnitsPage 는 라우트에서 완전 제거.

### AdminLabelCatalogPage `/admin/labels` — **B**
| 관점 | 갭 | 개편 방향 |
|---|---|---|
| 정보 구조 | 라벨 카탈로그 자체는 양호 | 그대로 유지 |
| 시각 위계 | 한국어 라벨 매핑 안 됨 | `labels.ts` 경유 |
| 상태 처리 | 로딩 미흡 | Skeleton |
| 모바일 | 표 그대로 노출 | DataTable 적용 |

### AdminConsentsPage `/admin/consents` — **B**
| 관점 | 갭 | 개편 방향 |
|---|---|---|
| 정보 구조 | 동의 종합 이력 양호. 5단계 카운트 부재 | StatusBadge consent + 필터 + 카운트 카드 |
| 워크플로우 | URL 필터 미반영 | useSearchParams 적용 |
| 시각 위계 | 약함 | StatusBadge / Badge 경유 |
| 상태 처리 | 양호 | 4상태 표준화 |
| 모바일 | 약함 | 반응형 강화 |

### AdminMetaStoragePage `/admin/meta-storage` — **B**
- 인프라성 페이지. 한국어화 + Card / DataTable 컴포넌트로 통일.

---

## 그룹 3: 카탈로그 (4개)

### AdminSkuCatalogPage `/admin/sku-catalog` — **B**
- BM v10 4단계 SKU (UC-A1 6h / UC-A2 60h / UC-A3 600h / UC-LLM 6,000h) 명시
- 한국어 라벨 + Card 통일

### AdminSkuComponentsPage `/admin/sku-components` — **B**
### AdminSkuStudioPage `/admin/studio` — **B**
- SKU 빌더 UX 정리. 단계별 Card 분리.

### AdminQualityTiersPage `/admin/quality-tiers` — **A**
- BM v10 영향 적음. 디자인 토큰 적용 정도.

---

## 그룹 4: 클라이언트 (3개)

### AdminClientsPage `/admin/clients` — **B**
| 관점 | 갭 | 개편 방향 |
|---|---|---|
| 정보 구조 | 매수자 목록 양호 | "비배타적 라이선스" 표기 |
| 워크플로우 | 매수자 → 납품 이력 링크 X | 매수자 row 클릭 → /admin/transactions?client=:id |
| 상태 처리 | 표준화 부족 | DataTable + EmptyState |

### AdminDeliveryProfilesPage `/admin/delivery-profiles` — **B**
### AdminClientSkuMapPage `/admin/sku-rules` — **B**
- UX 표준화 위주.

---

## 그룹 5: 빌드 (5개)

### AdminBuildWizardPage `/admin/build` — **C**
- export job 마법사 — UC-A1~UC-LLM 4단계 SKU 반영 + 단계별 카드 + 한국어화 + 진행 상태.

### AdminExportJobsPage `/admin/jobs` — **C**
- 처리 흐름 가시성 추가 (각 job 의 단계 진행률).
- DataTable + StatusBadge.

### AdminExportJobDetailPage `/admin/jobs/:jobId` — **C**
- 발화 단위 정산 표시 (utterance 단위 — Phase 0.6 재작성 완료 이후).

### AdminSettlementPage `/admin/settlement` — **C → 분리 완료 (3차 세션)**
- 본 페이지는 **레거시**로 표시.
- ✅ AdminTransactionsPage `/admin/transactions` (거래 내역) + AdminBalancesPage `/admin/balances` (사용자 잔액) 으로 분리 완료.
- 시드 운영 검증 후 본 페이지는 라우트에서 완전 제거.

### AdminDatasetListPage `/admin/datasets` + AdminDatasetDetailPage `/admin/datasets/:datasetId` — **B**
- 데이터셋 v 코호트 관리. UX 정리 + 한국어화.

---

## 그룹 6: 상세 (1개)

### AdminUserDetailPage `/admin/users/:userId` — **B**
| 관점 | 갭 | 개편 방향 |
|---|---|---|
| 정보 구조 | 발화 누적 시간 + 한도 도달률 표시 부재 | BigStat + CapCell 컴포넌트 재사용 |
| 워크플로우 | 통화 → 발화 → 정산 드릴다운 | 탭 구성 (통화 / 발화 / 정산) |
| 상태 처리 | 표준화 부족 | Card + Skeleton |

---

## 신규 페이지 (5개) — BM v10 도입에 따른 신설

| # | 라우트 | 상태 | 사유 |
|---|---|---|---|
| N1 | `/admin/transactions` | ✅ 3차 세션 완료 | 매수자별 거래 |
| N2 | `/admin/balances` | ✅ 3차 세션 완료 | 사용자별 한도 도달률 |
| N3 | `/admin/delivery/new` | ✅ 2차 세션 완료 | 비배타적 납품 흐름 |
| N4 | `/admin/review` | ✅ 2차 세션 완료 | 검수 5단계 상태머신 |
| N5 | `/admin/utterances` | ✅ 3차 세션 완료 (BU 대체) | 발화 단위 정산 |

---

## 우선순위 기반 작업 분류

### 즉시 작업 (이번 sprint)

신규 5개 + 재작성 1개 (Dashboard) — **모두 완료** (1+2+3차 세션)

### 다음 sprint 권장

| 페이지 | 평가 | 주요 작업 |
|---|---|---|
| AdminSessionListPage | C | 처리 흐름 컬럼 + 양측 동의 카운트 |
| AdminBuildWizardPage | C | 4단계 SKU 마법사 |
| AdminExportJobsPage | C | 처리 흐름 가시성 |
| AdminExportJobDetailPage | C | 발화 단위 정산 (Phase 0.6 의존) |

### 부분 개편 (점진)

12개 B-rated 페이지 — 한국어화 (`labels.ts` 경유) + 컴포넌트 통일 (Card / DataTable / Badge / Modal). 동시에 일괄 처리 가능.

### 폐기 대상

| 페이지 | 사유 | 처리 |
|---|---|---|
| AdminCallsPage | 옵션 A: calls 테이블 미도입 | sessions 통합 후 라우트 제거 |
| AdminBillableUnitsPage | BU 폐기 | utterances 페이지로 대체 (완료, 점진 제거) |
| AdminSettlementPage | transactions/balances 분리 | 점진 제거 |

---

## 일관성 갭 (전 페이지 공통)

| 갭 | 영향 | 대응 |
|---|---|---|
| 디자인 토큰 미정의 | 색상 하드코딩 산재 | ✅ STAGE 3 design-tokens.ts 정의 완료. 마이그레이션 점진 |
| 한국어 매핑 미정의 | 영어/한국어 혼재 | ✅ STAGE 3 labels.ts 정의 완료. 마이그레이션 점진 |
| 공용 컴포넌트 부재 | 페이지별 커스텀 반복 | ✅ STAGE 4 12개 컴포넌트 + 배럴 완료 |
| 모바일 약함 | 375px 깨짐 | DataTable + Card 의 반응형 자동 적용 |
| URL 상태 미반영 | 뒤로가기 X | useSearchParams 표준화 (신규 페이지 적용 완료) |

---

## 완료 기준 (STAGE 5 → STAGE 7)

- 핵심 신규 5개 페이지 → 25개 루브릭 항목 100% 통과
- 기존 21개 페이지 → 점진 마이그레이션 (한국어화 + 컴포넌트 통일 우선)
- 평가 D 페이지 (Calls / BU / Settlement) → 시드 검증 후 라우트 제거
