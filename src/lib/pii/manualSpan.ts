// ── 관리자 수동 PII span 등록 — 순수 로직 (PR-P2B-B) ────────────────────
// DOM 선택(Selection/Range)에서 char offset 을 안전하게 추출한다.
// offset 은 raw transcript_text 의 UTF-16 code unit 기준이며, 서버의
// extractSpan(text.slice(char_start, char_end)) 과 정확히 일치해야 한다.

// pii_annotations.pii_type enum (서버 annotationReview.ts 와 동일).
export type PiiType =
  | 'name'
  | 'phone'
  | 'account'
  | 'address'
  | 'ip'
  | 'email'
  | 'organization'
  | 'resident_id'
  | 'other'

export interface PiiTypeOption {
  value: PiiType
  /** 사용자 노출 라벨(한국어). 전송 값은 value(enum) 만 사용. */
  label: string
}

// 드롭다운 노출용. 전송 시 value(enum)만 보낸다(원문/라벨 텍스트 미전송).
export const PII_TYPE_OPTIONS: readonly PiiTypeOption[] = [
  { value: 'name', label: '이름' },
  { value: 'phone', label: '전화번호' },
  { value: 'account', label: '계좌번호' },
  { value: 'address', label: '주소' },
  { value: 'ip', label: 'IP' },
  { value: 'email', label: '이메일' },
  { value: 'organization', label: '기관/회사명' },
  { value: 'resident_id', label: '주민등록번호' },
  { value: 'other', label: '기타' },
]

// 후보 predicted_type(한국어, voice-api 부여) → pii_annotations enum(PiiType).
// 서버 annotationReview.ts 의 KOREAN_PII_TYPE_MAP 과 동일 의미 — 행별 수동등록에서
// "이미 자동 탐지된 유형"을 차단(disable)할 때 후보 한국어 타입을 enum 으로 환산한다.
const KOREAN_PII_TYPE_MAP: Record<string, PiiType> = {
  이름: 'name',
  전화번호: 'phone',
  휴대폰번호: 'phone',
  계좌번호: 'account',
  주소: 'address',
  IP주소: 'ip',
  IP: 'ip',
  이메일: 'email',
  기관명: 'organization',
  회사명: 'organization',
  '기관/회사명': 'organization',
  주민번호: 'resident_id',
  주민등록번호: 'resident_id',
  기타: 'other',
}

const VALID_PII_TYPES = new Set<string>(PII_TYPE_OPTIONS.map((o) => o.value))

/**
 * 후보 predicted_type 을 pii_annotations enum 으로 환산한다.
 * - 이미 유효한 enum 문자열이면 그대로 통과(방어적).
 * - 알려진 한국어 라벨이면 매핑.
 * - 그 외는 null(차단하지 않음 — fail-open, 서버 409 dedup 이 최종 방어).
 */
export function mapKoreanPiiTypeToEnum(
  predictedType: string | null | undefined,
): PiiType | null {
  if (!predictedType) return null
  const t = predictedType.trim()
  if (VALID_PII_TYPES.has(t)) return t as PiiType
  return KOREAN_PII_TYPE_MAP[t] ?? null
}

export interface SpanOffsets {
  charStart: number
  charEnd: number
}

const TEXT_NODE = 3 // Node.TEXT_NODE

/**
 * DOM Range 에서 char offset(UTF-16 code unit)을 추출한다.
 *
 * 안전 가드(어긋난 offset 저장 방지):
 *   - container 는 raw transcript 전체를 담은 "단일 텍스트 노드" 한 개만 가져야 한다.
 *   - range 의 시작/끝이 모두 그 텍스트 노드 안이어야 한다(형제/하위 요소로 새면 거부).
 *   - 빈 선택(charStart >= charEnd)은 거부한다.
 * Range.startOffset/endOffset 은 이미 start <= end 로 정규화돼 있어 min/max 불필요.
 * 위 조건 중 하나라도 어긋나면 null 을 반환해 호출부가 등록을 막는다.
 */
export function extractSpanFromRange(
  range: Range | null | undefined,
  container: Element | null | undefined,
): SpanOffsets | null {
  if (!range || !container) return null

  const node = container.firstChild
  if (
    container.childNodes.length !== 1 ||
    !node ||
    node.nodeType !== TEXT_NODE ||
    range.startContainer !== node ||
    range.endContainer !== node
  ) {
    return null
  }

  const charStart = range.startOffset
  const charEnd = range.endOffset
  if (typeof charStart !== 'number' || typeof charEnd !== 'number') return null
  if (charStart >= charEnd) return null

  return { charStart, charEnd }
}
