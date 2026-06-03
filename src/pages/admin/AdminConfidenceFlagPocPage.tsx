// P1-c PoC 페이지 — B형 저신뢰 소프트플래그 시각 캘리브레이션.
// 백엔드(voice-api word.probability 적재) 전, Mock 데이터로 하이라이트/Dismiss/임계 UX 확인.
// 설계: uncounted-voice-api/docs/design_review_panel_redesign_20260603.md §4
import ConfidenceFlaggedTranscript from '../../components/domain/ConfidenceFlaggedTranscript'
import { MOCK_FLAG_TRANSCRIPT } from '../../lib/confidenceFlagMock'

export default function AdminConfidenceFlagPocPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-txt">저신뢰 소프트플래그 — PoC (Mock)</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>
          sess3(01dd38b9) 실측 word.probability 기반 Mock. 임계/최소길이 슬라이더로
          “이 정도 웅얼거림에 플래그가 맞다”는 균형점을 눈으로 찾으세요. 단어 클릭 = 확인처리(Dismiss).
        </p>
      </div>
      <ConfidenceFlaggedTranscript words={MOCK_FLAG_TRANSCRIPT} />
      <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        관찰점: DLP(0.14)는 정답이지만 저확률 → 플래그됨(오탐). 임계를 낮추면 줄지만 진짜 웅얼거림도 놓칩니다.
        이 트레이드오프가 캘리브레이션의 핵심입니다.
      </p>
    </div>
  )
}
