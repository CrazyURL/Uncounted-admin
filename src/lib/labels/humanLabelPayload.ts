// 사람 emotion 라벨 저장 페이로드 빌더 (PR-H2b-queue 에서 추출).
// UtteranceReviewRow(통화 인벤토리)와 EmotionLabelQueueRow(검수 큐)가 공유한다.
// 저장 API/DB 정책은 서버 admin-emotion-labels.ts 가 단일 소스 — 여기서는 본문 구성만.

import type {
  EmotionCategory,
  EmotionFineLabel,
  SaveHumanLabelBody,
} from '../api/utterances'

// 1차 카테고리 버튼(긍정/중립/부정/판단불가).
export const HUMAN_CATEGORY_OPTIONS = ['긍정', '중립', '부정', '판단불가'] as const
export type HumanCategoryChoice = (typeof HUMAN_CATEGORY_OPTIONS)[number]

// 세부 감정 7종(resolved 일 때 fine_label 보정용 드롭다운).
export const EMOTION_FINE_OPTIONS: readonly EmotionFineLabel[] = [
  '기쁨',
  '놀람',
  '슬픔',
  '분노',
  '불안',
  '당황',
  '중립',
]

// 카테고리 선택 시 자동 적용되는 기본 fine_label.
// resolved 는 서버에서 fine_label·emotion_category 둘 다 필수(미전송 시 400)이므로 기본값이 필요하다.
// ⚠️ 이 기본값은 학습 품질에 직접 영향 — 부정은 슬픔/분노/불안이 섞여 있으므로
//    검수자가 가능하면 fine_label 드롭다운으로 정확한 7종을 보정해야 한다(기본값 맹신 금지).
export const DEFAULT_FINE_BY_CATEGORY: Record<EmotionCategory, EmotionFineLabel> = {
  긍정: '기쁨',
  중립: '중립',
  부정: '불안',
}

// 카테고리에 대응하는 기본 fine_label (판단불가 → null).
export function defaultFineFor(category: HumanCategoryChoice): EmotionFineLabel | null {
  return category === '판단불가' ? null : DEFAULT_FINE_BY_CATEGORY[category]
}

export interface BuiltHumanLabel {
  // saveUtteranceHumanLabel 에 그대로 넘길 요청 본문.
  body: SaveHumanLabelBody
  // 저장 성공 후 배지 표시에 쓸 확정 fine_label (판단불가면 null).
  resolvedFineLabel: EmotionFineLabel | null
  isUndecidable: boolean
}

// 카테고리 선택 + (선택적) 세부 감정으로 저장 본문을 구성한다.
// - 판단불가 ⇒ { category_decision: 'undecidable' } (fine/category 미전송).
// - 그 외   ⇒ { category_decision: 'resolved', emotion_category, fine_label }.
//   세부 감정 미선택 시 DEFAULT_FINE_BY_CATEGORY 로 채운다.
export function buildHumanLabelBody(
  category: HumanCategoryChoice,
  fine: EmotionFineLabel | null,
): BuiltHumanLabel {
  if (category === '판단불가') {
    return {
      body: { category_decision: 'undecidable' },
      resolvedFineLabel: null,
      isUndecidable: true,
    }
  }
  const fineLabel = fine ?? DEFAULT_FINE_BY_CATEGORY[category]
  return {
    body: {
      category_decision: 'resolved',
      emotion_category: category,
      fine_label: fineLabel ?? undefined,
    },
    resolvedFineLabel: fineLabel,
    isUndecidable: false,
  }
}
