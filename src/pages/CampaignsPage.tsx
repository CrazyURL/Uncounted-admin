import { useState, useEffect } from 'react'
import { type Session } from '../types/session'
import { type CampaignId } from '../types/campaign'
import {
  CAMPAIGNS,
  matchSessions,
  getActiveConsent,
  joinCampaign,
  withdrawCampaign,
} from '../lib/campaigns'
import { loadAllSessions } from '../lib/sessionMapper'

export default function CampaignsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [consents, setConsents] = useState<Record<CampaignId, boolean>>(() => ({
    BIZ: getActiveConsent('BIZ'),
    SALES: getActiveConsent('SALES'),
    MIX: getActiveConsent('MIX'),
  }))
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    loadAllSessions().then(setSessions)
  }, [])

  function handleToggle(campaignId: CampaignId) {
    const current = consents[campaignId]
    if (current) {
      withdrawCampaign(campaignId)
      setConsents((prev) => ({ ...prev, [campaignId]: false }))
      showToast('캠페인 참여를 철회했습니다')
    } else {
      joinCampaign(campaignId)
      setConsents((prev) => ({ ...prev, [campaignId]: true }))
      showToast('캠페인에 참여했습니다!')
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const activeCount = Object.values(consents).filter(Boolean).length

  return (
    <div className="min-h-full px-4 py-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 안내 카드 */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-accent)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>campaign</span>
          <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>데이터 캠페인</span>
          {activeCount > 0 && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
              style={{ backgroundColor: 'var(--color-success-dim)', color: 'var(--color-success)' }}
            >
              {activeCount.toLocaleString()}개 참여 중
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
          AI 기업이 요청하는 데이터 유형에 맞는 녹음을 제공하면 더 높은 단가를 받을 수 있습니다.
          참여 동의 후 언제든지 철회할 수 있습니다.
        </p>
      </div>

      {/* 개인정보 신뢰 안내 */}
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }}
      >
        <span className="material-symbols-outlined text-base mt-0.5" style={{ color: 'var(--color-accent)' }}>shield</span>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          원본 음성 파일은 서버에 저장되지 않습니다. 비식별화 처리 후 16kHz WAV + JSONL 메타데이터만 제공됩니다.
          동의 이력은 기기 내에만 보관됩니다.
        </p>
      </div>

      {/* 캠페인 목록 */}
      {CAMPAIGNS.map((campaign) => {
        const matched = matchSessions(campaign, sessions)
        const active = consents[campaign.id]

        return (
          <div
            key={campaign.id}
            className="rounded-xl p-4"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: active ? `1px solid var(--color-accent)` : '1px solid var(--color-border)',
            }}
          >
            {/* 헤더 */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--color-accent-dim)' }}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {campaign.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{campaign.name}</p>
                  {active && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-success-dim)', color: 'var(--color-success)' }}
                    >
                      참여 중
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{campaign.description}</p>
              </div>
            </div>

            {/* 통계 그리드 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: '단가', value: `₩${campaign.unitPrice.toLocaleString()}/분` },
                { label: '매칭 세션', value: `${matched.length.toLocaleString()}건` },
                { label: '보너스', value: campaign.bonusLabel },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg p-2 text-center"
                  style={{ backgroundColor: 'var(--color-muted)' }}
                >
                  <p className="text-[9px] mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
                  <p className="text-xs font-bold leading-tight" style={{ color: 'var(--color-text)' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* 참여/철회 버튼 */}
            <button
              onClick={() => handleToggle(campaign.id)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: active ? 'var(--color-danger-dim)' : 'var(--color-accent)',
                color: active ? 'var(--color-danger)' : 'var(--color-text-on-accent)',
                border: active ? '1px solid var(--color-danger)' : 'none',
              }}
            >
              {active ? '참여 철회' : '캠페인 참여'}
            </button>
          </div>
        )
      })}

      {/* Toast */}
      {toast && (
        <div
          className="fixed left-4 right-4 rounded-xl px-4 py-3 text-sm font-medium text-center z-50"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))', backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
