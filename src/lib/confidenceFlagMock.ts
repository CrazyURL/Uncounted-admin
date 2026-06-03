// P1-c PoC용 Mock 전사 — sess3(01dd38b9) 실측 word.probability 기반.
// 백엔드(voice-api word.probability 적재 → uncounted-api 노출)가 뚫리기 전,
// 프론트 하이라이트/Dismiss UX + 임계값 시각 캘리브레이션을 위한 강제 매립 데이터.
// 실측 출처: _test_wordprob.py (제품하고 0.566, DLP 0.14, 네 0.02 등).

import type { TranscriptWord } from './api/transcripts'

/** "그 인증서 그게 여러 개의 제품하고 이제 뭐 브라우저라..." — 부연 환각(제품하고 이제 뭐) 포함. */
export const MOCK_FLAG_TRANSCRIPT: TranscriptWord[] = [
  { word: '그', start: 30.0, end: 30.2, probability: 0.19 },
  { word: '인증서', start: 30.2, end: 30.7, probability: 0.95 },
  { word: '그게', start: 30.7, end: 31.0, probability: 0.88 },
  { word: '여러', start: 31.0, end: 31.3, probability: 0.97 },
  { word: '개의', start: 31.3, end: 31.6, probability: 0.62 },
  { word: '제품하고', start: 31.6, end: 32.1, probability: 0.566 }, // 부연 환각 — low
  { word: '이제', start: 32.1, end: 32.4, probability: 0.31 }, // 부연 환각 — low
  { word: '뭐', start: 32.4, end: 32.6, probability: 0.12 }, // 짧음 → 제외
  { word: '브라우저라', start: 32.6, end: 33.2, probability: 0.74 },
  { word: '할', start: 33.2, end: 33.3, probability: 0.66 },
  { word: '수도', start: 33.3, end: 33.6, probability: 0.9 },
  { word: '있고', start: 33.6, end: 33.9, probability: 0.85 },
  { word: 'DLP', start: 34.0, end: 34.4, probability: 0.14 }, // 정답이지만 저확률 → 오탐(캘리브레이션 관찰점)
  { word: '팝업창', start: 34.4, end: 34.9, probability: 0.93 },
  { word: '뜨는', start: 34.9, end: 35.2, probability: 0.81 },
  { word: '거는', start: 35.2, end: 35.5, probability: 0.78 },
  { word: '우리쪽', start: 35.5, end: 35.9, probability: 0.58 },
  { word: '이슈인데', start: 35.9, end: 36.4, probability: 0.49 }, // low
  { word: '공동인증서거든요', start: 36.4, end: 37.3, probability: 0.71 },
]
