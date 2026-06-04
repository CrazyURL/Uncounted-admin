# Review Panel v2 — Prototype (P1)

**상태**: Prototype (배선 X)
**Spec**: [docs/design_review_panel_redesign_20260603.md](../../../../docs/design_review_panel_redesign_20260603.md)
**Phase**: P1

---

## 개요

검수 패널 재설계 정본의 P1 UI prototype 스켈레톤. 다음 3 컴포넌트로 구성:

```
review-panel-v2/
├── README.md                          ← 본 파일
├── ReviewQueueList.tsx                ← 화면 ① 통화 검수 큐
├── UtteranceReviewPanelV2.tsx         ← 화면 ③ 발화 단건 검수 (체크박스 4종 + 라디오 + PII 드래그)
├── CallActionPanel.tsx                ← 화면 ④ 통화 단위 액션 (3버튼)
├── PiiRangePicker.tsx                 ← PII 드래그 영역 선택 헬퍼
├── ReviewKeyboardHook.ts              ← 단축키 편집/네비 모드 분리
└── types.ts                           ← P1 데이터 모델 타입
```

---

## 배선 가이드 (마이그레이션 적용 후)

```
1. Migration 075 (utterance_gt + 3 신규 테이블) 적용
2. API endpoint 추가:
   - POST /api/admin/utterance-gt
   - PATCH /api/admin/utterance-gt/:id
   - POST /api/admin/utterance-revisions
   - GET  /api/admin/utterances?priority_tier=red
   - GET  /api/admin/sessions?call_review_tier=red
3. 본 컴포넌트 import 후 AdminInventoryPage 의 발화 펼침에 배선:
   - 기존 UtteranceReviewRow → UtteranceReviewPanelV2 교체
   - 기존 SessionReviewActions → CallActionPanel 교체
4. 검수 우선순위 점수 산정 backfill 스크립트 (별도 PR)
```

---

## 정본 9 수정안 반영 체크리스트

- [x] 인라인 통합 레이아웃 (탭 X) — 의견 2
- [x] 문제 신고형 체크박스 4종 — 의견 1
- [x] 화자 라디오 (체크 시 즉시 노출) — 의견 1
- [x] 명시적 3버튼 (정상/수정/제외) — 의견 1
- [x] PII 위치 입력 드래그 UI — 의견 3
- [x] 단축키 편집/네비 모드 분리 — 의견 2
- [x] 시간순 점프 단축키 (vim G + 시간) — 의견 3 추가
- [x] 제외 사유 옵션 (화자혼재 → deferred_split) — 의견 3
- [x] HOTWORDS 단일문자 자동 ✗ — 만장일치 (P2 패널 적용)

---

## 보류 항목 명시 (정본 §7 정합)

- ❌ Merge / Split / Insert (BM v10 정산 충돌)
- ❌ 차원 ③ 화자분리 누락 마커 (P3)
- ❌ Relation 수정 UI (conf 만 표시)
- ❌ 자동 HOTWORDS 등록 (사람 게이트만)

---

## 단축키 표

| 모드 | 키 | 동작 |
|------|-----|------|
| 네비 | 1 | ☑ 텍스트 토글 |
| 네비 | 2 | ☑ 화자 토글 |
| 네비 | 3 | ☑ PII 토글 |
| 네비 | 4 | ☑ 제외 토글 |
| 네비 | Space | 재생/정지 |
| 네비 | ← / → | 3초 점프 |
| 네비 | Tab | 다음 빨강 발화 |
| 네비 | Ctrl+S | 임시저장 |
| 네비 | G + 시간 | 시간순 점프 (vim style, 예: G42 = 0:42 발화) |
| 편집 | (모든 키) | 일반 입력 (단축키 비활성) |

---

## 데이터 흐름

```
사용자가 [▶ 검수 시작] 클릭
         ↓
ReviewQueueList → 통화 선택
         ↓
빨강 발화 리스트 표시 (review_priority_tier='red')
         ↓
UtteranceReviewPanelV2 펼침
  - 자동전사 표시
  - 4 체크박스 (텍스트/화자/PII/제외)
  - 메모 입력
         ↓
사용자가 [✓ 정상] / [⚒ 수정] / [✗ 제외] 클릭
         ↓
POST /api/admin/utterance-gt
  - status='approved' | 'rejected' | 'deferred_split'
  - review_method='human'
  - reviewer_user_id=<user>
         ↓
POST /api/admin/utterance-revisions (정정 있을 시)
  - revision_type=text_correction | speaker_relabel | ...
         ↓
모든 빨강 끝나면 → CallActionPanel
  - HOTWORDS 후보 (자동 추출 + 사람 승인)
  - 3버튼: [✓ 승인] / [🔄 수정필요] / [✗ 거절]
         ↓
sessions.review_status='approved' / 'needs_revision' / 'rejected'
```
