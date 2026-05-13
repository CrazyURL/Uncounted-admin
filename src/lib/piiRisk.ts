// ── 통화 단위 PII 위험도 분석 (STAGE 11.5) ───────────────────────────────
//
// 단일 발화 정규식으로는 잡히지 않는 분산 PII 패턴을 통화 전체 문맥에서 감지.
//
// 감지 패턴:
//   1. 인증정보 dictation — "비밀번호/암호/OTP" 등 키워드 등장 후 후속 발화에
//      알파벳 한글표기 / 기호 한글명 / 짧은 영숫자 섞임
//   2. 화자 교대 받아적기 — 짧은 (≤2초) 숫자 위주 발화가 3건 이상 연속 등장
//
// 결과는 검수 UI 에서:
//   - 통화 헤더 ⚠️ 배지 + 이유 tooltip
//   - 위험 발화 배경 빨강 (단일 발화 7자리+ 강조와 별개로 통화 문맥 기반)
//
// STAGE 12 의 "조건부 일괄 reviewed" 자동 차단 조건으로 활용 예정.

export type RiskLevel = 'low' | 'medium' | 'high'

export interface SessionRiskResult {
  level: RiskLevel
  reasons: string[]
  dangerUttIds: Set<string>
}

// 인증정보·민감정보 dictation 트리거 키워드
// 등장 발화 + 후속 5발화를 "위험" 으로 표시
const AUTH_KEYWORDS = [
  '비밀번호', '패스워드', '비번', '암호',
  '인증번호', 'OTP', '확인번호', '일회용번호',
  'PIN', '핀번호',
  '주민번호', '주민등록번호',
  '카드번호', '계좌번호', 'CVC', '유효기간',
]

// 받아적기 행위 강화 동사 (앞 키워드 강도 보조)
const DICTATION_VERBS = [
  '불러줄', '알려줄', '받아적', '받아 적', '보내줄', '적어', '메모해',
]

const AUTH_REGEX = new RegExp(
  `(${AUTH_KEYWORDS.map(escapeRe).join('|')})|(${DICTATION_VERBS.map(escapeRe).join('|')})`,
  'i',
)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 발화가 "짧은 숫자 위주" 인지 — 화자 교대 받아적기 패턴 탐지용
function isShortNumericish(text: string | null | undefined, durationSec: number): boolean {
  if (!text || durationSec > 2.0) return false
  const stripped = text.replace(/[\s.,!?·~-]/g, '')
  if (stripped.length === 0) return false
  const digitCount = (stripped.match(/\d/g) ?? []).length
  // 숫자 비율 50%+ 이고 최소 2자리 숫자 포함
  return digitCount >= 2 && digitCount / stripped.length >= 0.5
}

interface Utterance {
  id: string
  text: string | null
  duration_seconds: number
}

export function analyzeSessionRisk(utterances: Utterance[]): SessionRiskResult {
  const dangerUttIds = new Set<string>()
  const reasons: string[] = []

  // ── 1. 인증정보 키워드 트리거 — 키워드 발화 + 후속 5발화 위험 표시
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i]
    if (!u.text) continue
    const m = AUTH_REGEX.exec(u.text)
    if (!m) continue
    const matched = m[1] ?? m[2]
    reasons.push(`인증정보 키워드 "${matched}" 등장 — ${i + 1}번 발화`)
    // 키워드 발화 + 후속 5발화를 위험으로
    for (let j = i; j < Math.min(i + 6, utterances.length); j++) {
      dangerUttIds.add(utterances[j].id)
    }
  }

  // ── 2. 화자 교대 짧은 숫자 발화 연속 3건+ 패턴
  let run = 0
  let runStart = -1
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i]
    if (isShortNumericish(u.text, u.duration_seconds)) {
      if (run === 0) runStart = i
      run += 1
      if (run >= 3) {
        // run 윈도우 전체를 위험으로
        for (let j = runStart; j <= i; j++) dangerUttIds.add(utterances[j].id)
      }
    } else {
      if (run >= 3) {
        reasons.push(`짧은 숫자 발화 ${run}건 연속 — ${runStart + 1}~${i}번 발화 (받아적기 의심)`)
      }
      run = 0
      runStart = -1
    }
  }
  if (run >= 3) {
    reasons.push(`짧은 숫자 발화 ${run}건 연속 — ${runStart + 1}~${utterances.length}번 발화 (받아적기 의심)`)
  }

  const level: RiskLevel = dangerUttIds.size > 0 ? 'high' : 'low'
  return { level, reasons, dangerUttIds }
}
