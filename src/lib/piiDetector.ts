// ── PII 탐지 — 한국 특화 정규식 기반 ──────────────────────────────────────────
// 1) 세션 제목/파일명에서 PII 패턴 탐지
// 2) STT 추출 텍스트에서 PII 의심 문장만 추출 (사용자 맥락 판단용)

export type PiiType =
  | 'PHONE'
  | 'EMAIL'
  | 'SSN'          // 주민등록번호 + 외국인등록번호
  | 'CARD'
  | 'ACCOUNT'
  | 'ADDRESS'
  | 'PASSPORT'     // 여권번호
  | 'DRIVER'       // 운전면허번호
  | 'BIZ_REG'      // 사업자등록번호
  | 'VEHICLE'      // 차량번호
  | 'IP'           // IP 주소

export type PiiDetection = {
  type: PiiType
  matched: string         // 원본 매칭 문자열
  masked: string          // 마스킹된 표시용 (010-****-1234)
  startIndex: number      // 텍스트 내 위치
  endIndex: number
  confidence: number      // 0~1
}

// ── 정규식 패턴 ─────────────────────────────────────────────────────────────

const PII_PATTERNS: { type: PiiType; regex: RegExp; confidence: number }[] = [
  // 한국 전화번호: 01X-XXXX-XXXX
  {
    type: 'PHONE',
    regex: /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,
    confidence: 0.95,
  },
  // 유선 전화번호: 02-XXXX-XXXX, 0XX-XXX-XXXX
  {
    type: 'PHONE',
    regex: /0[2-6][0-9][-\s]?\d{3,4}[-\s]?\d{4}/g,
    confidence: 0.85,
  },
  // 이메일
  {
    type: 'EMAIL',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    confidence: 0.95,
  },
  // 주민등록번호 + 외국인등록번호: XXXXXX-[1-8]XXXXXX
  {
    type: 'SSN',
    regex: /\d{6}[-\s]?[1-8]\d{6}/g,
    confidence: 0.98,
  },
  // 카드번호: XXXX-XXXX-XXXX-XXXX
  {
    type: 'CARD',
    regex: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
    confidence: 0.90,
  },
  // 계좌번호: XXX-XX-XXXXXX 또는 XXXX-XXX-XXXXXX
  {
    type: 'ACCOUNT',
    regex: /\d{3,4}[-\s]\d{2,6}[-\s]\d{4,6}/g,
    confidence: 0.75,
  },
  // 한국 주소 패턴 (시/도/구/동/로/길 키워드)
  {
    type: 'ADDRESS',
    regex: /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|도|특별자치시|특별자치도)?\s*\S+(?:시|군|구)\s*\S+(?:읍|면|동|로|길)\s*\d*/g,
    confidence: 0.70,
  },
  // 여권번호: M12345678 (알파벳 1~2자리 + 숫자 7~8자리)
  {
    type: 'PASSPORT',
    regex: /(?<![A-Za-z])[A-Z]{1,2}\d{7,8}(?!\d)/g,
    confidence: 0.80,
  },
  // 운전면허번호: XX-XXXXXX-XX (지역코드 2자리-숫자 6자리-숫자 2자리)
  {
    type: 'DRIVER',
    regex: /\d{2}[-\s]?\d{6}[-\s]?\d{2}/g,
    confidence: 0.75,
  },
  // 사업자등록번호: XXX-XX-XXXXX
  {
    type: 'BIZ_REG',
    regex: /\d{3}[-\s]?\d{2}[-\s]?\d{5}/g,
    confidence: 0.85,
  },
  // 차량번호: 12가3456 / 서울12가3456
  {
    type: 'VEHICLE',
    regex: /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)?\s*\d{2,3}\s*[가-힣]\s*\d{4}/g,
    confidence: 0.80,
  },
  // IPv4 주소
  {
    type: 'IP',
    regex: /(?<!\d)(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?!\d)/g,
    confidence: 0.75,
  },
]

// ── 탐지 함수 ───────────────────────────────────────────────────────────────

export function detectPii(text: string): PiiDetection[] {
  if (!text || text.length === 0) return []

  const detections: PiiDetection[] = []

  for (const { type, regex, confidence } of PII_PATTERNS) {
    // 정규식 재사용 시 lastIndex 초기화
    const re = new RegExp(regex.source, regex.flags)
    let match: RegExpExecArray | null

    while ((match = re.exec(text)) !== null) {
      detections.push({
        type,
        matched: match[0],
        masked: maskString(match[0], type),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence,
      })
    }
  }

  // 중복 제거 (같은 위치의 여러 패턴 매칭 시 높은 confidence 우선)
  return deduplicateDetections(detections)
}

// ── 잠금 여부 판정 ──────────────────────────────────────────────────────────

export function shouldLock(detections: PiiDetection[]): boolean {
  return detections.some((d) => d.confidence >= 0.7)
}

// ── 텍스트 마스킹 ──────────────────────────────────────────────────────────

export function maskPiiText(text: string, detections: PiiDetection[]): string {
  if (detections.length === 0) return text

  // 끝에서부터 치환 (인덱스 이동 방지)
  const sorted = [...detections].sort((a, b) => b.startIndex - a.startIndex)
  let result = text
  for (const d of sorted) {
    result = result.slice(0, d.startIndex) + d.masked + result.slice(d.endIndex)
  }
  return result
}

// ── 세션 PII 스캔 (제목 + 파일명 기반) ──────────────────────────────────────

export function scanSessionPii(session: { title: string; callRecordId?: string }): PiiDetection[] {
  const texts = [session.title]
  if (session.callRecordId) {
    // 파일 경로에서 파일명만 추출
    const filename = session.callRecordId.split('/').pop() ?? ''
    texts.push(filename)
  }
  const combined = texts.join(' ')
  return detectPii(combined)
}

// ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function maskString(str: string, type: PiiType): string {
  switch (type) {
    case 'PHONE': {
      // 010-1234-5678 → 010-****-5678
      const digits = str.replace(/[-\s]/g, '')
      if (digits.length >= 10) {
        return digits.slice(0, 3) + '-****-' + digits.slice(-4)
      }
      return str.replace(/\d/g, '*')
    }
    case 'EMAIL': {
      const [local, domain] = str.split('@')
      const maskedLocal = local.slice(0, 2) + '***'
      return maskedLocal + '@' + domain
    }
    case 'SSN':
      return str.slice(0, 6) + '-*******'
    case 'CARD': {
      const cardDigits = str.replace(/[-\s]/g, '')
      return cardDigits.slice(0, 4) + '-****-****-' + cardDigits.slice(-4)
    }
    case 'ACCOUNT':
      return str.replace(/\d(?=\d{4})/g, '*')
    case 'ADDRESS':
      return str.slice(0, 4) + '***'
    case 'PASSPORT':
      return str.slice(0, 2) + '*****' + str.slice(-2)
    case 'DRIVER': {
      const dDigits = str.replace(/[-\s]/g, '')
      return dDigits.slice(0, 2) + '-******-' + dDigits.slice(-2)
    }
    case 'BIZ_REG': {
      const bDigits = str.replace(/[-\s]/g, '')
      return bDigits.slice(0, 3) + '-**-*****'
    }
    case 'VEHICLE':
      return str.slice(0, 2) + '***' + str.slice(-2)
    case 'IP':
      return str.replace(/\d+\.\d+$/, '***.***')
    default:
      return str.replace(/./g, '*')
  }
}

function deduplicateDetections(detections: PiiDetection[]): PiiDetection[] {
  if (detections.length <= 1) return detections

  // 위치 기준 정렬
  const sorted = [...detections].sort((a, b) => a.startIndex - b.startIndex)
  const result: PiiDetection[] = []

  for (const d of sorted) {
    const overlap = result.find(
      (existing) => d.startIndex < existing.endIndex && d.endIndex > existing.startIndex,
    )
    if (overlap) {
      // 겹치면 confidence 높은 쪽 유지
      if (d.confidence > overlap.confidence) {
        const idx = result.indexOf(overlap)
        result[idx] = d
      }
    } else {
      result.push(d)
    }
  }

  return result
}

// ── STT 텍스트용: 문장 단위 PII 탐지 ─────────────────────────────────────────

// 추가 패턴: STT 텍스트에서 자주 나타나는 구어체 PII
const STT_EXTRA_PATTERNS: { type: PiiType; regex: RegExp; confidence: number }[] = [
  // 인명+호칭: "김철수 씨", "박과장님" 등
  {
    type: 'ADDRESS' as PiiType, // 인명은 ADDRESS 카테고리로 통합 (기존 타입 활용)
    regex: /[\uAC00-\uD7A3]{2,4}\s*(?:씨|님|선생님?|과장|부장|대리|사장|이사|팀장|실장|차장|본부장|센터장|원장|교수|박사|기사)/g,
    confidence: 0.65,
  },
  // 금액: "삼백만 원", "1,500만원", "5억" 등
  {
    type: 'ACCOUNT' as PiiType,
    regex: /\d[\d,]{2,}\s*(?:원|만\s*원|천\s*만\s*원|억)/g,
    confidence: 0.60,
  },
  // 연속 숫자 4자리+ (다른 패턴에 안 걸린 나머지)
  {
    type: 'ACCOUNT' as PiiType,
    regex: /(?<!\d)\d{4,}(?!\d)/g,
    confidence: 0.50,
  },
]

export type PiiSentence = {
  /** 원본 문장 텍스트 */
  text: string
  /** 발견된 PII 패턴들 */
  detections: PiiDetection[]
}

/** 텍스트를 문장 단위로 분리 (한국어: 마침표/물음표/느낌표 + 공백/줄바꿈) */
function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.?!。])\s+|(?:\r?\n)+/)
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** STT 텍스트에서 PII 의심 문장만 추출 (사용자 맥락 판단용) */
export function detectPiiSentences(text: string): PiiSentence[] {
  if (!text || text.length === 0) return []

  const sentences = splitSentences(text)
  const allPatterns = [...PII_PATTERNS, ...STT_EXTRA_PATTERNS]
  const results: PiiSentence[] = []

  for (const sentence of sentences) {
    const detections: PiiDetection[] = []

    for (const { type, regex, confidence } of allPatterns) {
      const re = new RegExp(regex.source, regex.flags)
      let match: RegExpExecArray | null

      while ((match = re.exec(sentence)) !== null) {
        detections.push({
          type,
          matched: match[0],
          masked: maskString(match[0], type),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence,
        })
      }
    }

    if (detections.length > 0) {
      results.push({
        text: sentence,
        detections: deduplicateDetections(detections),
      })
    }
  }

  return results
}

/** PII 타입 한글 라벨 */
export function piiTypeLabel(type: PiiType): string {
  const labels: Record<PiiType, string> = {
    PHONE: '전화번호',
    EMAIL: '이메일',
    SSN: '주민/외국인등록번호',
    CARD: '카드번호',
    ACCOUNT: '숫자/금액',
    ADDRESS: '주소/인명',
    PASSPORT: '여권번호',
    DRIVER: '운전면허번호',
    BIZ_REG: '사업자등록번호',
    VEHICLE: '차량번호',
    IP: 'IP 주소',
  }
  return labels[type]
}

/** PII 발견 여부 빠른 체크 (전체 분석 없이) */
export function hasPii(text: string): boolean {
  const allPatterns = [...PII_PATTERNS, ...STT_EXTRA_PATTERNS]
  for (const { regex } of allPatterns) {
    const re = new RegExp(regex.source, regex.flags)
    if (re.test(text)) return true
  }
  return false
}
