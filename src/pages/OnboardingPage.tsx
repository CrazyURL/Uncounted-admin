import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import UncountedLogo from '../components/domain/UncountedLogo'
import { isFirstVisit } from '../lib/tutorialStore'
import { trackFunnel } from '../lib/funnelLogger'

type ConsentKey = 'consent1' | 'consent2'

const CONSENTS: { key: ConsentKey; title: string; description: string }[] = [
  {
    key: 'consent1',
    title: '서비스 이용약관 동의 (필수)',
    description: '음성 데이터를 수집·분석하여 개인 맞춤 가치 지표를 제공합니다.',
  },
  {
    key: 'consent2',
    title: '개인정보 처리방침 동의 (필수)',
    description: '수집된 데이터는 암호화 저장되며 제3자에게 제공되지 않습니다.',
  },
]

const FEATURES = [
  {
    icon: 'lock_person',
    title: '기기 내 익명화',
    description: '개인정보 보호를 위해 모든 데이터는 로컬에서 안전하게 처리됩니다.',
  },
  {
    icon: 'analytics',
    title: '세션 기반 점수 산정',
    description: '실시간 활동 데이터를 기반으로 자산 점수를 투명하게 산정합니다.',
  },
  {
    icon: 'trending_up',
    title: '선택적 기여도 강화',
    description: '추가 데이터 제공 옵션을 통해 자산 보상률을 높일 수 있습니다.',
  },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [consent1, setConsent1] = useState(false)
  const [consent2, setConsent2] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  // 첫 방문 → 웰컴 슬라이드로 리다이렉트 (기존 세션 유무 무관)
  useEffect(() => {
    if (isFirstVisit()) {
      navigate('/welcome', { replace: true })
    } else {
      trackFunnel('onboarding_start')
    }
  }, [navigate])

  const allConsented = consent1 && consent2

  function toggleConsent(key: ConsentKey) {
    if (key === 'consent1') setConsent1((v) => !v)
    else setConsent2((v) => !v)
    setError(null)
  }

  async function handleStart() {
    if (!allConsented) return
    setLoading(true)
    setError(null)
    setPermissionDenied(false)

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.requestPermissions()
        if (result.publicStorage !== 'granted') {
          setError('파일 접근 권한이 거부됐습니다. 설정에서 권한을 허용해 주세요.')
          setPermissionDenied(true)
          setLoading(false)
          return
        }
      }
      navigate('/auth')
    } catch {
      // 권한 요청 자체가 실패하면 그냥 진행
      navigate('/auth')
    } finally {
      setLoading(false)
    }
    trackFunnel('onboarding_complete')
  }

  function openSettings() {
    window.location.href = 'app-settings:'
  }

  return (
    <div className="min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-bg)', fontFamily: "'Manrope', 'Noto Sans KR', sans-serif" }}>
      {/* Hero 그라디언트 */}
      <div
        className="fixed top-0 left-0 w-full h-[500px] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, var(--color-accent-dim) 0%, transparent 70%)',
        }}
      />

      {/* 탑바 — 로고 */}
      <header
        className="relative z-10 flex items-center px-4 flex-shrink-0"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          minHeight: 'calc(3.5rem + env(safe-area-inset-top))',
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <UncountedLogo size={28} variant="mark" />
      </header>

      {/* 스크롤 본문 */}
      <main
        className="relative z-10 flex-1 flex flex-col px-6 pt-4 overflow-y-auto"
        style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}
      >
        {/* Hero 텍스트 */}
        <div className="text-center mb-4">
          <h1 className="text-xl font-extrabold font-display leading-tight tracking-tight mb-1.5" style={{ color: 'var(--color-text)' }}>
            내 데이터, 나의 자산
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            데이터 가치를 자산으로 전환하세요.
          </p>
        </div>

        {/* 핵심 기능 3가지 */}
        <div className="flex flex-col gap-3 mb-4">
          {FEATURES.map((f) => (
            <div key={f.icon} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}>
                <span className="material-symbols-outlined text-lg">{f.icon}</span>
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <h3 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{f.title}</h3>
                <p className="text-xs leading-snug" style={{ color: 'var(--color-text-tertiary)' }}>{f.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 동의 패널 */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text)' }}>필수 권한 동의</h4>
          <div className="flex flex-col">
            {CONSENTS.map((item, idx) => {
              const checked = item.key === 'consent1' ? consent1 : consent2
              return (
                <div key={item.key}>
                  {idx > 0 && <div className="h-px w-full my-3" style={{ backgroundColor: 'var(--color-border)' }} />}
                  <div className="flex items-center justify-between gap-4 py-1">
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-medium leading-snug" style={{ color: 'var(--color-text)' }}>{item.title}</span>
                      <span className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{item.description}</span>
                    </div>
                    {/* 토글 스위치 */}
                    <button
                      onClick={() => toggleConsent(item.key)}
                      className="relative inline-flex flex-shrink-0 items-center w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
                      style={{ backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-muted)' }}
                      aria-pressed={checked}
                    >
                      <span
                        className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 mx-0.5 ${
                          checked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mt-4 p-3 rounded-xl flex flex-col gap-2" style={{ backgroundColor: 'var(--color-danger-dim)', border: '1px solid var(--color-danger)' }}>
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }}>error</span>
              <p className="text-xs leading-relaxed flex-1 min-w-0" style={{ color: 'var(--color-danger)' }}>{error}</p>
            </div>
            {permissionDenied && (
              <button
                onClick={openSettings}
                className="self-end text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
              >
                설정으로 이동
              </button>
            )}
          </div>
        )}
      </main>

      {/* 바텀 고정 영역 — 우리 앱 그대로 */}
      <div
        className="fixed bottom-0 left-0 w-full backdrop-blur-md px-6 pt-3 z-50"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))', backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
      >
        <button
          onClick={handleStart}
          disabled={!allConsented || loading}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
            allConsented && !loading
              ? 'active:scale-[0.98]'
              : 'cursor-not-allowed'
          }`}
          style={allConsented && !loading
            ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
            : { backgroundColor: 'var(--color-muted)', color: 'var(--color-text-tertiary)' }
          }
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-xl" style={{ color: 'inherit' }}>refresh</span>
              권한 확인 중...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xl" style={{ color: 'inherit', opacity: allConsented ? 0.9 : 0.4 }}>
                qr_code_scanner
              </span>
              자산 스캔 시작
            </>
          )}
        </button>
        <div className="text-center mt-3">
          <a
            href="#"
            className="text-xs underline underline-offset-4 transition-all"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            개인정보 처리방침 상세
          </a>
        </div>
      </div>
    </div>
  )
}
