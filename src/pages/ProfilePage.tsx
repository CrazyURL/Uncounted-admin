import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Session } from '../types/session'
import { loadAllSessions, getCachedSessions } from '../lib/sessionMapper'
import PrivacySecurityModal from '../components/domain/PrivacySecurityModal'
import { loadProfile, calcAnsweredCount, TOTAL_PROFILE_FIELDS, isProfileGateCompleted, getConsistencyScore } from '../types/userProfile'
import { calcContributorLevel, calcUserConfirmedRatio } from '../lib/contributorLevel'
import { loadUserSettings, saveUserSettings, buildConsentVersion, saveConsentFlag, saveConsentToIDB } from '../lib/globalConsent'
import { type UserSettings } from '../types/consent'
import Illust3D from '../components/domain/Illust3D'
import { getSttMode, setSttMode } from '../lib/sttEngine'
import { loadTutorial, resetTutorial } from '../lib/tutorialStore'
import { resetLocal } from '../lib/resetAll'
import { useToast } from '../lib/toastContext'
import { isEnrolled as isVoiceEnrolled } from '../lib/embeddingEngine'
import { trackFunnel } from '../lib/funnelLogger'
import { canShare } from '../lib/stateMachine'
type MenuItem = { icon: string; label: string; onClick?: () => void }

export default function ProfilePage() {
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const navigate = useNavigate()
  const cached = getCachedSessions()
  const [sessions, setSessions] = useState<Session[]>(cached ?? [])
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem('uncounted_auto_scan') === 'on')
  const [sttOn, setSttOn] = useState(() => getSttMode() === 'on')
  const [autoLabel, setAutoLabel] = useState(() => localStorage.getItem('uncounted_auto_label') !== 'off')
  const [tutorialDone, setTutorialDone] = useState(() => loadTutorial().stage === 'done')
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings())
  const { showToast } = useToast()
  const voiceEnrolled = isVoiceEnrolled()

  useEffect(() => {
    // 항상 최신 데이터 로드 (다른 페이지에서 PII 자동보호 등 변경 반영)
    loadAllSessions().then(setSessions)
  }, [])

  const profile = loadProfile()
  const answeredCount = profile ? calcAnsweredCount(profile) : 0
  const fillPct = Math.round((answeredCount / TOTAL_PROFILE_FIELDS) * 100)

  const displayName = profile?.age_band && profile.age_band !== '응답안함'
    ? `${profile.age_band} 사용자`
    : '익명 사용자'

  const saleReadyCount = sessions.filter((s) => canShare(s)).length
  const labeledCount = sessions.filter((s) => s.labels !== null).length

  // ── 기여자 등급 계산 ───────────────────────────────────────────────────────
  const profileComplete = profile ? isProfileGateCompleted(profile) : false
  const labelConfirmRate = calcUserConfirmedRatio(sessions)
  const consistencyScore = profile ? getConsistencyScore(profile) : 0
  const contributor = calcContributorLevel({ profileCompleted: profileComplete, labelConfirmRate, consistencyScore })

  const publicTotal = sessions.filter((s) => s.isPublic).length
  const STATS = [
    { icon: 'mic', label: '총 음성', value: `${sessions.length.toLocaleString()}건` },
    { icon: 'storefront', label: '판매 적합', value: `${saleReadyCount.toLocaleString()}건` },
    { icon: 'label', label: '라벨 완료', value: `${labeledCount.toLocaleString()}건` },
    { icon: 'public', label: '공개 ON', value: `${publicTotal.toLocaleString()}건` },
  ]

  const MENU_ITEMS: MenuItem[] = [
    { icon: 'manage_accounts', label: '프로필 설정', onClick: () => navigate('/profile/setup') },
    { icon: 'shield', label: '민감정보 관리', onClick: () => navigate('/pii-review') },
    { icon: 'tune', label: '개인정보 세부 설정', onClick: () => navigate('/privacy-control') },
    { icon: 'security', label: '개인정보 및 보안', onClick: () => setPrivacyOpen(true) },
    { icon: 'help_outline', label: '도움말' },
  ]

  return (
    <div className="min-h-full px-5 py-6 flex flex-col gap-6" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 프로필 헤더 — 마스코트 */}
      <div className="flex flex-col items-center gap-3 py-4">
        <Illust3D fallback="shield" src="/assets/3d/A-1.png" size={80} />
        <div className="text-center">
          <p className="font-bold text-2xl font-display" style={{ color: 'var(--color-text)' }}>{displayName}</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            판매 적합 {saleReadyCount.toLocaleString()}/{sessions.length.toLocaleString()}건
          </p>
        </div>
      </div>

      {/* 프로필 완성도 카드 */}
      {profile ? (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>프로필 완성도</p>
            <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
              {answeredCount}/{TOTAL_PROFILE_FIELDS} 항목
            </span>
          </div>
          <div className="h-2 rounded-full mb-2" style={{ backgroundColor: 'var(--color-muted)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${fillPct}%`, backgroundColor: 'var(--color-accent)' }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {fillPct >= 80
              ? '프로필 정보가 충분합니다 — 데이터 분류가 정밀해집니다'
              : fillPct >= 40
              ? '프로필을 더 채우면 데이터 분류가 정밀해집니다'
              : '프로필을 설정하면 데이터 분류 정밀도가 올라갑니다'}
          </p>
        </div>
      ) : (
        <button
          onClick={() => navigate('/profile/setup')}
          className="rounded-xl p-5 text-left w-full"
          style={{ backgroundColor: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)' }}
        >
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined mt-0.5" style={{ color: 'var(--color-accent)', fontSize: 20 }}>
              person_add
            </span>
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--color-text)' }}>프로필을 설정해보세요</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                프로필 정보가 많을수록 데이터 분류가 정밀해집니다
              </p>
            </div>
            <span className="material-symbols-outlined ml-auto" style={{ color: 'var(--color-text-tertiary)', fontSize: 18 }}>
              chevron_right
            </span>
          </div>
        </button>
      )}

      {/* 기여자 등급 */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>기여자 등급</p>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: contributor.level === 'certified'
                ? 'var(--color-accent)'
                : contributor.level === 'verified'
                  ? 'var(--color-accent-dim)'
                  : 'var(--color-muted)',
              color: contributor.level === 'certified'
                ? 'var(--color-text-on-accent)'
                : contributor.level === 'verified'
                  ? 'var(--color-accent)'
                  : 'var(--color-text-tertiary)',
            }}
          >
            {contributor.labelKo}
          </span>
        </div>
        <div className="flex gap-3 mb-3">
          <div className="flex-1 rounded-lg p-3" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>프로필</p>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {contributor.profileComplete ? '완료' : '미완료'}
            </p>
          </div>
          <div className="flex-1 rounded-lg p-3" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>라벨 확인율</p>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {Math.round(contributor.labelConfirmRate * 100)}%
            </p>
          </div>
          <div className="flex-1 rounded-lg p-3" style={{ backgroundColor: 'var(--color-surface-alt)' }}>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>일관성</p>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {Math.round(contributor.consistencyScore * 100)}%
            </p>
          </div>
        </div>
        {contributor.nextRequirements.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>다음 등급 조건</p>
            {contributor.nextRequirements.map((req) => (
              <div key={req} className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs" style={{ color: 'var(--color-text-tertiary)' }}>arrow_forward</span>
                <p className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>{req}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 통계 그리드 */}
      <div className="grid grid-cols-2 gap-5">
        {STATS.map(({ icon, label, value }) => (
          <div
            key={label}
            className="rounded-xl p-5 flex flex-col gap-2"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-accent)' }}>{icon}</span>
            <div>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
              <p className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 안심 체크리스트 ────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-accent)' }}>verified_user</span>
          <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>안심 체크리스트</p>
        </div>

        <div className="flex flex-col gap-2 mb-3">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>수집하는 항목</p>
          {['음성 파일 메타데이터', '통화 이벤트(내용 없음)', '앱 카테고리(앱명 제외)', '기기/환경 버킷', '사용자 입력 라벨'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-accent)' }}>check_circle</span>
              <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>수집하지 않는 항목</p>
          {['통화 내용 / 텍스트 원문', '연락처 / 전화번호', '정밀 위치 정보', '앱 이름 / 화면 내용', '정밀 타임스탬프'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm" style={{ color: 'var(--color-text-tertiary)' }}>block</span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 목소리 등록 ────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden cursor-pointer"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        onClick={() => navigate('/voice-enrollment')}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 40, height: 40,
              backgroundColor: voiceEnrolled ? 'var(--color-success-dim)' : 'var(--color-accent-dim)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: voiceEnrolled ? 'var(--color-success)' : 'var(--color-accent)' }}
            >
              {voiceEnrolled ? 'verified_user' : 'record_voice_over'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {voiceEnrolled ? '목소리 등록 완료' : '목소리 등록'}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
              {voiceEnrolled
                ? '음성 데이터(U-A01~A03) 판매 가능'
                : '등록하면 음성 데이터 판매가 가능해집니다'}
            </p>
          </div>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: 'var(--color-text-tertiary)' }}
          >
            chevron_right
          </span>
        </div>
      </div>

      {/* ── 자동 녹음 상태 점검 ──────────────────────────────────────────── */}
      {(() => {
        const lastDate = sessions.length > 0
          ? sessions.reduce((latest, s) => s.date > latest ? s.date : latest, sessions[0].date)
          : null
        const daysSince = lastDate
          ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
          : null
        const isActive = daysSince !== null && daysSince <= 3
        const isStale = daysSince !== null && daysSince > 3
        const isEmpty = sessions.length === 0

        return (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: isActive ? 'var(--color-surface)' : 'var(--color-surface)',
              border: `1px solid ${isActive ? 'var(--color-border)' : 'var(--color-warning, #d97706)'}`,
            }}
          >
            <div className="flex items-center gap-3 px-5 py-4">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 40, height: 40,
                  backgroundColor: isActive
                    ? 'var(--color-success-dim)'
                    : 'var(--color-warning-dim, rgba(217,119,6,0.1))',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 22,
                    color: isActive ? 'var(--color-success)' : 'var(--color-warning, #d97706)',
                  }}
                >
                  {isActive ? 'mic' : 'mic_off'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {isActive ? '자동 녹음 정상' : isEmpty ? '녹음 파일 없음' : '자동 녹음 확인 필요'}
                </p>
                <p className="text-xs" style={{
                  color: isActive ? 'var(--color-text-sub)' : 'var(--color-warning, #d97706)',
                }}>
                  {isActive
                    ? `최근 녹음: ${daysSince === 0 ? '오늘' : `${daysSince}일 전`}`
                    : isEmpty
                      ? '기기의 자동 녹음을 켜면 자산화가 시작됩니다'
                      : `마지막 녹음이 ${daysSince}일 전입니다`}
                </p>
              </div>
              {isActive && (
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-success)' }}>
                  check_circle
                </span>
              )}
            </div>
            {(isEmpty || isStale) && (
              <div className="px-5 pb-4 pt-0">
                <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--color-muted)' }}>
                  <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                    자동 녹음 켜는 방법
                  </p>
                  <div className="flex flex-col gap-1">
                    {[
                      '전화 앱 → 설정 → 통화 녹음',
                      '자동 녹음 → 항상 녹음 또는 모든 통화 녹음 ON',
                      '녹음이 쌓이면 앱에서 자동으로 감지합니다',
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--color-accent)' }}>
                          {i + 1}
                        </span>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── 데이터 설정 ────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-accent)' }}>tune</span>
            <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>데이터 설정</p>
          </div>
        </div>

        {/* 1. 자동 스캔 */}
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>sync</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>자동 스캔</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>앱 접속 시 새 녹음 자동 감지</p>
          </div>
          <button
            onClick={() => {
              const next = !autoScan
              setAutoScan(next)
              localStorage.setItem('uncounted_auto_scan', next ? 'on' : 'off')
            }}
            className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: autoScan ? 'var(--color-accent)' : 'var(--color-muted)' }}
            role="switch"
            aria-checked={autoScan}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
              style={{ left: autoScan ? '22px' : '2px' }}
            />
          </button>
        </div>

        {/* 2. 텍스트 추출 */}
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>mic</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>텍스트 추출</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>음성을 텍스트로 변환 (기기 내 처리)</p>
          </div>
          <button
            onClick={() => {
              const next = !sttOn
              setSttOn(next)
              setSttMode(next ? 'on' : 'off')
              if (!next) {
                setAutoLabel(false)
                localStorage.setItem('uncounted_auto_label', 'off')
              }
            }}
            className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: sttOn ? 'var(--color-accent)' : 'var(--color-muted)' }}
            role="switch"
            aria-checked={sttOn}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
              style={{ left: sttOn ? '22px' : '2px' }}
            />
          </button>
        </div>

        {/* 3. 자동 라벨링 (STT OFF → disabled) */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ borderTop: '1px solid var(--color-border)', opacity: sttOn ? 1 : 0.5 }}
        >
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>auto_awesome</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>자동 라벨링</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {sttOn ? '텍스트 기반 관계/맥락 자동 분류' : '텍스트 추출이 꺼져 있어 비활성'}
            </p>
          </div>
          <button
            onClick={() => {
              if (!sttOn) return
              const next = !autoLabel
              setAutoLabel(next)
              localStorage.setItem('uncounted_auto_label', next ? 'on' : 'off')
            }}
            className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: autoLabel && sttOn ? 'var(--color-accent)' : 'var(--color-muted)' }}
            role="switch"
            aria-checked={autoLabel && sttOn}
            disabled={!sttOn}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
              style={{ left: autoLabel && sttOn ? '22px' : '2px' }}
            />
          </button>
        </div>

        {/* 4. 민감정보 자동 보호 (상시 ON) */}
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>shield</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>민감정보 자동 보호</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>항상 활성 — 개인정보 자동 마스킹</p>
          </div>
          <span className="material-symbols-outlined text-lg" style={{ color: 'var(--color-success)' }}>check_circle</span>
        </div>

        {/* 5. 수익 받기 */}
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>monetization_on</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>수익 받기</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {settings.globalShareConsentEnabled ? '데이터 공개 활성 중' : '데이터 공개하여 수익 산정'}
            </p>
          </div>
          <button
            onClick={() => {
              if (settings.globalShareConsentEnabled) {
                if (!confirm('수익 받기를 끄면 수익 발생이 중단됩니다. 계속하시겠습니까?')) return
                const newSettings: UserSettings = {
                  ...settings,
                  globalShareConsentEnabled: false,
                  globalShareConsentUpdatedAt: new Date().toISOString().slice(0, 10),
                }
                saveUserSettings(newSettings)
                setSettings(newSettings)
                trackFunnel('consent_global_off')
              } else {
                const newSettings: UserSettings = {
                  ...settings,
                  globalShareConsentEnabled: true,
                  globalShareConsentUpdatedAt: new Date().toISOString().slice(0, 10),
                  consentVersion: buildConsentVersion(),
                }
                saveUserSettings(newSettings)
                setSettings(newSettings)
                trackFunnel('consent_global_on')
                void saveConsentFlag(true, newSettings)
                void saveConsentToIDB(true, newSettings)
              }
            }}
            className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: settings.globalShareConsentEnabled ? 'var(--color-accent)' : 'var(--color-muted)' }}
            role="switch"
            aria-checked={settings.globalShareConsentEnabled}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
              style={{ left: settings.globalShareConsentEnabled ? '22px' : '2px' }}
            />
          </button>
        </div>

        {/* 세부 설정 링크 */}
        <button
          onClick={() => navigate('/privacy-control')}
          className="w-full flex items-center justify-center gap-1.5 px-5 py-3 text-sm"
          style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-accent)' }}
        >
          세부 설정
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>

      {/* 기타 설정 */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {/* 튜토리얼 초기화 */}
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>school</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>튜토리얼</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {tutorialDone ? '완료됨' : '진행 중'}
            </p>
          </div>
          <button
            onClick={() => {
              resetTutorial()
              setTutorialDone(false)
              showToast({ message: '튜토리얼 초기화 — 앱 재시작 시 처음부터', icon: 'replay' })
            }}
            className="text-[11px] font-medium px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-accent)' }}
          >
            초기화
          </button>
        </div>

        {/* 캐시 전체 초기화 */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-danger, #ef4444)' }}>delete_sweep</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>캐시 전체 초기화</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>세션·음성 등록·전사·정제 모두 삭제 (재스캔 필요)</p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('모든 로컬 데이터(세션, 음성 등록, 캐시)가 삭제됩니다. 계속하시겠습니까?')) return
              await resetLocal()
              showToast({ message: '전체 초기화 완료 — 앱을 재시작해 주세요', icon: 'check_circle' })
            }}
            className="text-[11px] font-medium px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'var(--color-danger, #ef4444)', color: '#fff' }}
          >
            초기화
          </button>
        </div>
      </div>

      {/* 메뉴 항목 */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {MENU_ITEMS.map(({ icon, label, onClick }, idx, arr) => (
          <button
            key={label}
            onClick={onClick}
            className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
            style={idx < arr.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : undefined}
          >
            <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-text-sub)' }}>{icon}</span>
            <span className="text-sm flex-1" style={{ color: 'var(--color-text)' }}>{label}</span>
            <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>chevron_right</span>
          </button>
        ))}
      </div>

      {/* 앱 정보 카드 */}
      <div
        className="rounded-xl p-5 flex items-center gap-3"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--color-accent-dim)' }}
        >
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-accent)' }}>shield</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>Uncounted</p>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>v0.1.0 MVP · 내 데이터, 내 가치</p>
        </div>
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-text-tertiary)' }}>chevron_right</span>
      </div>

      <PrivacySecurityModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}
