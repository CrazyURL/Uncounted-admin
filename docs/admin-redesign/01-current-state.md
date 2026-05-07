# STAGE 1 — Discovery (현재 상태)

## 기술 스택

| 항목 | 값 |
|---|---|
| 프레임워크 | React 19 + Vite 6 |
| 라우팅 | React Router DOM 7 |
| 스타일 | Tailwind CSS 3 |
| 애니메이션 | Framer Motion 12 |
| 언어 | TypeScript 5.7 |
| 상태 | AdminContext / adminStore (lib) |

## 라우트 매핑 (21개 페이지)

| # | 라우트 | 페이지 | 카테고리 |
|---|---|---|---|
| 1 | `/admin` | AdminDashboardPage | 대시보드 |
| 2 | `/admin/sessions` | AdminSessionListPage | 인벤토리 |
| 3 | `/admin/calls` | AdminCallsPage | 인벤토리 |
| 4 | `/admin/units` | AdminBillableUnitsPage | 인벤토리 (BM v9 잔존) |
| 5 | `/admin/labels` | AdminLabelCatalogPage | 카탈로그 |
| 6 | `/admin/consents` | AdminConsentsPage | 인벤토리 |
| 7 | `/admin/meta-storage` | AdminMetaStoragePage | 인벤토리 |
| 8 | `/admin/sku-catalog` | AdminSkuCatalogPage | 카탈로그 |
| 9 | `/admin/sku-components` | AdminSkuComponentsPage | 카탈로그 |
| 10 | `/admin/quality-tiers` | AdminQualityTiersPage | 카탈로그 |
| 11 | `/admin/clients` | AdminClientsPage | 클라이언트 |
| 12 | `/admin/delivery-profiles` | AdminDeliveryProfilesPage | 클라이언트 |
| 13 | `/admin/sku-rules` | AdminClientSkuMapPage | 클라이언트 |
| 14 | `/admin/build` | AdminBuildWizardPage | 빌드 |
| 15 | `/admin/jobs` | AdminExportJobsPage | 빌드 |
| 16 | `/admin/jobs/:jobId` | AdminExportJobDetailPage | 빌드 |
| 17 | `/admin/settlement` | AdminSettlementPage | 빌드 |
| 18 | `/admin/datasets` | AdminDatasetListPage | 빌드 |
| 19 | `/admin/datasets/:datasetId` | AdminDatasetDetailPage | 빌드 |
| 20 | `/admin/studio` | AdminSkuStudioPage | 카탈로그 |
| 21 | `/admin/users/:userId` | AdminUserDetailPage | 상세 |

## 페이지 평가

평가 기준:
- **A** — 개편 불필요 (BM v10 정합 + UX 양호)
- **B** — 부분 개편 (필터/카운트 추가, 한국어화)
- **C** — 전면 개편 (BM v10 정합 X, UX 미흡)
- **D** — 폐기 검토 (BM v10에서 무의미)

| 페이지 | 평가 | 사유 |
|---|---|---|
| AdminDashboardPage | C | BM v10 5탭 (양측 동의/처리 흐름/검수/납품/이상 신호) 구조로 전면 재작성. 기존 위젯 재사용 가능 부분만 살림 |
| AdminSessionListPage | C | 처리 흐름 단계별(*_status) 컬럼 + review_status 필터 추가 필요. 양측 동의 필터·카운트·통화시간 표시 강화 |
| AdminCallsPage | D | 049 v5 calls 테이블 사용 — 옵션 A 결정으로 sessions 가 통화 단위 겸함. 폐기 검토 |
| AdminBillableUnitsPage | D | BU 폐기 결정 (마이그레이션 055)으로 본 페이지 폐기. 발화 단위 페이지로 대체 |
| AdminLabelCatalogPage | B | 기능 양호. 한국어화 + 컴포넌트 통일 정도 |
| AdminConsentsPage | B | 양측 동의 모니터링 핵심. 카운트/필터 강화 + 한국어화 |
| AdminMetaStoragePage | B | 메타데이터 저장소 — 인프라성 페이지, 부분 개편 |
| AdminSkuCatalogPage | B | SKU 정의 — BM v10 4단계 SKU 반영 + UX 정리 |
| AdminSkuComponentsPage | B | SKU 구성요소 — BM v10 정합성 검토 필요 |
| AdminQualityTiersPage | A | 품질 등급 정의는 BM v10 영향 없음. UX 정리 정도 |
| AdminClientsPage | B | 매수자 관리 — 비배타적 라이선스 표시 추가 |
| AdminDeliveryProfilesPage | B | 납품 프로필 — UX 정리 |
| AdminClientSkuMapPage | B | 클라이언트 SKU 매핑 — 부분 개편 |
| AdminBuildWizardPage | C | export job 생성 마법사 — UC-A1~UC-LLM 4단계 SKU 반영 + UX 전면 개선 |
| AdminExportJobsPage | C | export 작업 목록 — 처리 흐름 가시성 추가 + UX 개선 |
| AdminExportJobDetailPage | C | export 상세 — 발화 단위 정산 표시 |
| AdminSettlementPage | C | 정산 — BU → 발화 단위 + 거래/사용자 화면 분리 (`/admin/transactions` `/admin/balances`) |
| AdminDatasetListPage | B | 데이터 버전(v) 관리 — UX 정리 |
| AdminDatasetDetailPage | B | 동일 |
| AdminSkuStudioPage | B | SKU 빌더 — UX 정리 |
| AdminUserDetailPage | B | 사용자 상세 — 한도 도달률·발화 누적 시간 추가 |

### 평가 요약

- **A (개편 불필요)**: 1개 (5%)
- **B (부분 개편)**: 12개 (57%)
- **C (전면 개편)**: 6개 (29%)
- **D (폐기 검토)**: 2개 (9%)

## 신규 페이지 (BM v10 도입에 따른 신설)

| # | 라우트 | 페이지명 | 우선순위 |
|---|---|---|---|
| N1 | `/admin/transactions` | AdminTransactionsPage | 5 |
| N2 | `/admin/balances` | AdminBalancesPage | 5 |
| N3 | `/admin/delivery/new` | AdminDeliveryCreatePage | 4 |
| N4 | `/admin/review` | AdminReviewQueuePage | 2 |
| N5 | `/admin/utterances` | AdminUtterancesPage | 4 (AdminBillableUnitsPage 대체) |

## 기존 컴포넌트 (재사용 후보)

| 위치 | 컴포넌트 | 재사용 가능성 |
|---|---|---|
| `components/layout/` | AdminShell, AdminNav, TopBar, BottomNav | ✅ 그대로 |
| `components/common/` | (TBD) | 🔍 STAGE 4 진입 시 검토 |
| `components/domain/` | (TBD) | 🔍 도메인별 점진 마이그레이션 |
| `components/motion/` | Framer Motion 래퍼 | ✅ 신규 컴포넌트와 통합 |

## API 엔드포인트 (관찰)

라우트별 사용 API 는 STAGE 5 페이지 설계 시 페이지마다 상세 매핑.
주요 API 디렉토리: `lib/api/{client.ts, admin.ts, auth.ts, sessions.ts}`

## 모바일 대응 현황

- **viewport meta**: index.html 확인 필요
- **BottomNav**: layout 구조에 존재 → 모바일 친화적 기반 있음
- **Tailwind responsive**: `md:` `lg:` prefix 사용 정도는 페이지별 확인 필요 (STAGE 2 갭 분석에서 측정)

## 디자인 라이브러리 현황

- **Tailwind CSS 3** — 디자인 토큰 시스템 미정의 상태
- **shadcn/ui 미도입** — 자체 컴포넌트 + Tailwind 직접 사용
- **Framer Motion 12** — 모션 일관성 부족 가능성
- **공통 컴포넌트 라이브러리 미정의** — STAGE 4에서 신설 필요

## 결론

- **C/D 평가 8개 페이지** (29 + 9 = 38%) → 전면 개편 또는 폐기 대상
- **B 평가 12개 페이지** (57%) → 부분 개편 (필터·카운트·한국어화 위주)
- **A 평가 1개 페이지** (5%) → 디자인 토큰 적용 정도

신규 5개 페이지 + 기존 21개 → 합계 26개 페이지 (단, D 평가 2개 폐기 시 24개)

## 다음 단계 (STAGE 2)

각 페이지마다 5관점 (정보 구조 / 워크플로우 / 시각 위계 / 상태 처리 / 모바일) 점검하여 갭 분석 작성.
