// 세션 검수 패널 화자 헤더용 표시 라벨.
// 역할(self/other) 우선, 없으면 raw speaker_label("SPEAKER_00") 을 "화자 N" 으로 매핑.
// DB/API 변경 없음 — 순수 표시 로직.

/**
 * 화자 표시 라벨을 만든다.
 * - speakerRole 이 self → '본인', other → '상대방' (대소문자/공백 무시)
 * - 그 외(null/미지)면 speakerLabel 의 끝 숫자를 0-기반으로 보고 "화자 N" (SPEAKER_00 → 화자 1)
 * - 숫자 없는 라벨은 원본 유지, 빈 문자열은 '-'
 */
export function speakerDisplayLabel(speakerLabel: string, speakerRole: string | null): string {
  const normalizedRole = speakerRole?.trim().toLowerCase()
  if (normalizedRole === 'self') return '본인'
  if (normalizedRole === 'other') return '상대방'

  const label = speakerLabel.trim()
  if (!label) return '-'

  const match = label.match(/(?:speaker_?|s)(\d+)$/i)
  if (!match) return label

  const index = Number.parseInt(match[1], 10)
  if (Number.isNaN(index)) return label

  return `화자 ${index + 1}`
}
