import { useState } from 'react'

export default function UtteranceReviewGuide() {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)' }}
    >
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm" style={{ color: '#eab308' }}>lightbulb</span>
          <span className="text-xs font-medium text-white">검수 가이드</span>
        </div>
        <span
          className="material-symbols-outlined text-sm transition-transform"
          style={{ color: 'rgba(255,255,255,0.4)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          expand_more
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-4">
          {/* 좌측: 들어서 판단 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#eab308' }}>hearing</span>
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>들어서 판단</span>
            </div>
            <ul className="space-y-1">
              {[
                '알아들을 수 없는 웅얼거림',
                '소음이 음성보다 큰 구간',
                '개인정보 beep 마스킹 누락',
                '의미 없는 맞장구/감탄사만',
              ].map(item => (
                <li key={item} className="text-[10px] flex items-start gap-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ color: '#eab308', flexShrink: 0 }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* 우측: 수치로 판단 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#eab308' }}>analytics</span>
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>수치로 판단</span>
            </div>
            <ul className="space-y-1">
              {[
                { text: '3초 미만 발화', tag: '자동' },
                { text: 'Grade C (품질 기준 미달)', tag: '자동' },
                { text: 'beep 30%+ (마스킹 과다)', tag: '자동' },
                { text: '화자 식별 오류 (pseudoId 불일치)', tag: '수동' },
              ].map(item => (
                <li key={item.text} className="text-[10px] flex items-start gap-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ color: '#eab308', flexShrink: 0 }}>·</span>
                  <span className="flex-1">{item.text}</span>
                  <span
                    className="text-[8px] px-1 py-0.5 rounded flex-shrink-0"
                    style={{
                      backgroundColor: item.tag === '자동' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                      color: item.tag === '자동' ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {item.tag}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
