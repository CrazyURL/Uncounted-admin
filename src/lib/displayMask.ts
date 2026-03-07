// ── 비식별화 표시 마스킹 ──────────────────────────────────────────────────────
// 녹음파일명(세션 제목)에서 연락처 이름·전화번호를 마스킹
// 규칙:
//   이름 2글자: 파* (파파)
//   이름 3글자: 조*승 (조평승)
//   이름 4글자+: 종**형 (종일이형)
//   괄호 내 이름: (김지한) → (김*한)
//   전화번호: 가운데 **** (010-****-5678)
//   기관명(은행/병원 등): 마스킹 안 함
// SessionDetailPage는 예외 — 풀 네임 표시 (로컬 전용)

import { extractContactName } from './contactUtils'

const SKIP_NAMES = new Set(['알 수 없음', '음성 메모'])
const RECORDING_PREFIX_RE = /^(?:녹음|통화|call)[_ ]+/i

// ── 한국 성씨 (~99% 커버) ────────────────────────────────────────────────────
const SURNAMES = new Set(
  '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허노남심하주곽성차구민진변우위엄원천방공현염석선설마길연표명기반왕금옥인맹제승추감단봉편예경여태가소복'.split('')
)

// ── 기관명 접미사 (마스킹 제외) ──────────────────────────────────────────────
const INSTITUTION_SUFFIXES = [
  // 금융
  '은행', '증권', '카드', '생명', '화재', '보험', '캐피탈',
  // 의료
  '병원', '의원', '약국', '치과', '한의원',
  // 교육·종교
  '학교', '대학', '대학교', '교회', '성당',
  // 기업·기관
  '센터', '공사', '공단', '재단', '연구소', '연구원',
  '택배', '마트', '통신', '전자', '건설', '제약', '그룹', '물산',
  '중공업', '백화점',
  // 관공서
  '시청', '구청', '군청', '도청',
  '경찰서', '소방서', '세무서', '우체국', '법원',
  '검찰청', '교육청', '출입국', '등기소',
  '면사무소', '읍사무소', '주민센터',
]

function endsWithInstitution(name: string): boolean {
  return INSTITUTION_SUFFIXES.some(s => name.endsWith(s))
}

// 성씨로 시작하지만 이름이 아닌 단어 (false-positive 방지)
const SKIP_WORDS = new Set([
  // 직급·직책
  '팀장', '부장', '과장', '대리', '사원', '차장', '이사', '전무', '상무',
  '사장', '대표', '수석', '선생', '박사', '교수', '실장', '본부', '센터',
  '팀장님', '부장님', '과장님', '대리님', '사원님', '수석님', '선생님', '님',
  // 부서·업무
  '영업', '보험', '구축', '운영', '관리', '개발', '기획', '총무', '인사',
  '물류', '재무', '회계', '생산', '설계', '홍보',
  // 성씨로 시작하는 흔한 일반 단어
  '이동', '이름', '이후', '이전', '이상', '이하', '이번', '이미', '이용',
  '서류', '서울', '서비스', '정보', '정상', '정리', '정도',
  '남자', '남편', '남성', '남쪽',
  '문의', '문자', '문서', '문제',
  '고객', '고급', '고민', '고장',
  '최고', '최신', '최대', '최소',
  '강남', '강서', '강북', '강원', '강화',
  '전화', '전문', '전자', '전체', '전국',
  '배달', '배송', '손님', '한국', '유명', '유행',
  '조건', '조사', '조회', '장소', '장비', '장치',
  '임시', '임대', '안내', '안전', '권한', '권리',
  '신청', '신규', '황금', '오전', '오후', '오류',
  '하나', '하루', '구매', '변경', '방문', '방법',
  '선택', '설정', '경기', '경우', '예약', '예정',
  '가격', '가입', '가능', '소개', '복사', '복구',
  '보험사', '사무실', '연구소', '연구원', '경기도',
  '병원', '약국', '은행', '학교', '회사',
  '성공', '성과', '선물', '석유', '현금', '현재', '현장',
  '원래', '원인', '천원', '백만', '백화점',
  '민원', '공사', '공장', '공급', '여행', '예산',
  '기본', '기술', '기업', '반품', '가게',
])

// ── 기본 유틸 ─────────────────────────────────────────────────────────────────

function isPhoneNumber(str: string): boolean {
  const digits = str.replace(/[-\s+()]/g, '')
  return /^\d+$/.test(digits) && digits.length >= 7
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/[-\s+()]/g, '')
  if (digits.length < 7) return phone
  if (phone.includes('-')) {
    const parts = phone.split('-')
    if (parts.length >= 3) return parts[0] + '-****-' + parts[parts.length - 1]
    return parts[0] + '-****-' + digits.slice(-4)
  }
  return digits.slice(0, 3) + '****' + digits.slice(-4)
}

/** 순수 이름만 마스킹 (접미사 없이) */
function applyNameMask(name: string): string {
  if (name.length <= 1) return name
  if (name.length === 2) return name[0] + '*'
  if (name.length === 3) return name[0] + '*' + name[2]
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}

/** 한글 이름 마스킹 — 괄호/공백 접미어 보존, 기관명 스킵 */
function maskKoreanName(name: string): string {
  const parenIdx = name.indexOf('(')
  let namePart: string
  let tail: string

  if (parenIdx > 0) {
    namePart = name.slice(0, parenIdx)
    tail = name.slice(parenIdx)
  } else {
    const spaceIdx = name.indexOf(' ')
    if (spaceIdx > 0) {
      namePart = name.slice(0, spaceIdx)
      tail = name.slice(spaceIdx)
    } else {
      namePart = name
      tail = ''
    }
  }

  // 기관명이면 마스킹 안 함
  if (endsWithInstitution(namePart)) return name

  return applyNameMask(namePart) + tail
}

// ── 전체 텍스트 이름 스캔 ─────────────────────────────────────────────────────

/** 한국 성씨로 시작하는 2~4글자 한글이 이름인지 판별 */
function isLikelyName(word: string): boolean {
  if (word.length < 2 || word.length > 4) return false
  if (!/^[가-힣]+$/.test(word)) return false
  if (!SURNAMES.has(word[0])) return false
  if (SKIP_WORDS.has(word)) return false
  if (endsWithInstitution(word)) return false
  return true
}

/** 공백으로 분리된 토큰별 이름 패턴 마스킹 */
function maskNamesInTokens(text: string, minLen: number): string {
  return text.split(' ').map(token => {
    // 토큰 앞부분이 한글 2~4글자인지 체크 (뒤에 pm, 님 등 비한글 허용)
    const m = token.match(/^([가-힣]{2,4})(.*)$/)
    if (!m) return token
    const korean = m[1]
    const rest = m[2]
    if (korean.length < minLen) return token
    if (!isLikelyName(korean)) return token
    return applyNameMask(korean) + rest
  }).join(' ')
}

/** 전체 텍스트에서 한국 이름 패턴 후처리 마스킹 */
function maskAllKoreanNames(text: string): string {
  // 1단계: 괄호 내부 — 적극적 (2글자 이상)
  let result = text.replace(/\(([^)]+)\)/g, (_, inner) =>
    '(' + maskNamesInTokens(inner, 2) + ')'
  )

  // 2단계: 괄호 외부 — 보수적 (3글자 이상)
  const parts = result.split(/(\([^)]*\))/)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part // 이미 처리된 괄호 그룹
    return maskNamesInTokens(part, 3)
  }).join('')
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/** 연락처 이름/번호 마스킹 — group.name 표시용 */
export function maskContactName(name: string): string {
  if (!name || SKIP_NAMES.has(name)) return name

  // extractContactName이 녹음/통화 접두사를 포함할 수 있음 → 제거
  const clean = name.replace(RECORDING_PREFIX_RE, '')
  if (!clean) return name

  if (isPhoneNumber(clean)) return maskPhone(clean)

  // 기관명(은행/병원 등)이면 주 이름 마스킹 스킵, 내부 인명만 스캔
  const parenIdx = clean.indexOf('(')
  const mainPart = parenIdx > 0 ? clean.slice(0, parenIdx) : clean
  if (endsWithInstitution(mainPart)) {
    return maskAllKoreanNames(clean)
  }

  // 1차: 주 이름 마스킹
  let result = maskKoreanName(clean)

  // 2차: 텍스트 전체 이름 패턴 스캔 (괄호 내부, 공백 뒤 등)
  result = maskAllKoreanNames(result)

  return result
}

// Samsung 녹음 파일명 패턴: prefix_CONTACT_DATE_TIME
const SAMSUNG_TITLE_RE = /^((?:녹음|통화|call)[_ ])(.+?)([_ ]\d{6,8}(?:[_ ]\d{4,6})?)$/i

/** 파일 경로의 파일명 부분만 마스킹 (경로 구조 유지) */
export function maskFilePath(filePath: string | null): string | null {
  if (!filePath) return filePath
  const sep = filePath.includes('\\') ? '\\' : '/'
  const lastIdx = filePath.lastIndexOf(sep)
  if (lastIdx < 0) return maskSessionTitle(filePath)
  const dir = filePath.slice(0, lastIdx + 1)
  const filename = filePath.slice(lastIdx + 1)
  return dir + maskSessionTitle(filename)
}

/** 세션 제목 내 연락처 부분 마스킹 */
export function maskSessionTitle(title: string): string {
  if (!title) return title

  const t = title.replace(/\.(m4a|mp3|wav|ogg|3gp|aac|amr|flac)$/i, '')

  // ── Samsung 직접 패턴 매칭 ──────────────────────────────────────
  const sm = t.match(SAMSUNG_TITLE_RE)
  if (sm) {
    const prefix = sm[1]
    const rawContact = sm[2]
    const dateSuffix = sm[3]
    const cleaned = rawContact.replace(/[-_]+/g, ' ').trim()
    if (SKIP_NAMES.has(cleaned)) return title
    if (/^\d{6,8}$/.test(cleaned)) return title

    let masked: string
    if (isPhoneNumber(cleaned)) {
      masked = maskPhone(rawContact)
    } else {
      // 기관명이면 마스킹 안 함
      const parenIdx = rawContact.indexOf('(')
      const mainPart = parenIdx > 0 ? rawContact.slice(0, parenIdx) : rawContact
      if (endsWithInstitution(mainPart)) {
        masked = maskAllKoreanNames(rawContact)
      } else {
        masked = maskKoreanName(rawContact)
        masked = maskAllKoreanNames(masked)
      }
    }
    return prefix + masked + dateSuffix
  }

  // ── Fallback: extractContactName 기반 ──────────────────────────
  const contactName = extractContactName(t)
  if (SKIP_NAMES.has(contactName)) return title

  const actualName = contactName.replace(RECORDING_PREFIX_RE, '') || contactName

  // 전화번호 — 제목 전체에서 패턴 치환
  if (isPhoneNumber(actualName)) {
    let result = title
    result = result.replace(/(\d{2,4})-(\d{3,4})-(\d{4})/g, '$1-****-$3')
    result = result.replace(/\b(\d{3})(\d{3,4})(\d{4})\b/g, '$1****$3')
    return result
  }

  const masked = maskKoreanName(actualName)
  if (masked === actualName) return maskAllKoreanNames(title)

  // 원본 제목에서 실제 이름 부분 찾아서 교체
  let idx = t.indexOf(actualName)
  if (idx >= 0) {
    const result = title.slice(0, idx) + masked + title.slice(idx + actualName.length)
    return maskAllKoreanNames(result)
  }

  // extractContactName이 _ → 공백 치환했을 수 있음
  const underscored = actualName.replace(/ /g, '_')
  idx = t.indexOf(underscored)
  if (idx >= 0) {
    const result = title.slice(0, idx) + masked + title.slice(idx + underscored.length)
    return maskAllKoreanNames(result)
  }

  return maskAllKoreanNames(title)
}
