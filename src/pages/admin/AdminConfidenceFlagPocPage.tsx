// P1-c PoC 페이지 — B형 저신뢰 소프트플래그 시각 캘리브레이션.
// 백엔드(voice-api word.probability 적재) 전, Mock 데이터로 하이라이트/Dismiss/임계 UX 확인.
// 설계: uncounted-voice-api/docs/design_review_panel_redesign_20260603.md §4
import ConfidenceFlaggedTranscript from '../../components/domain/ConfidenceFlaggedTranscript'
import { MOCK_FLAG_UTTERANCES } from '../../lib/confidenceFlagMock'

export default function AdminConfidenceFlagPocPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-txt">저신뢰 소프트플래그 — PoC (Mock)</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>
          sess3(01dd38b9) GT 구조 기반 Mock(화자·겹침·[불확실] 구간). 임계/최소길이 슬라이더로
          “이 정도 웅얼거림에 플래그가 맞다”는 균형점을 눈으로 찾으세요. 단어 클릭 = 확인처리(Dismiss).
        </p>
      </div>
      <ConfidenceFlaggedTranscript utterances={MOCK_FLAG_UTTERANCES} />
      <div className="text-[11px] space-y-1" style={{ color: 'var(--color-text-tertiary)' }}>
        <p>· [알수없음] 구간 = Whisper 부연환각 “제품하고 이제”(0.34/0.27) → 저확률로 플래그. 검수자가 청취 후 [알수없음] 마킹/정정.</p>
        <p>· [이지](0.18)는 high, [하는데](0.30)는 low — 음향 불확실 구간.</p>
        <p>· DLP(0.41)는 정답이지만 저확률 → 플래그됨(오탐). 임계를 낮추면 줄지만 진짜 웅얼거림도 놓칩니다 — 이 트레이드오프가 캘리브레이션의 핵심.</p>
      </div>
    </div>
  )
}
