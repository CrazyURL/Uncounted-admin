import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  type AgeBand,
  type Gender,
  type RegionGroup,
  type AccentGroup,
  type SpeechStyle,
  type PrimaryLanguage,
  type CommonEnv,
  type CommonDeviceMode,
  type DomainMixItem,
  type UserProfile,
  TOTAL_PROFILE_FIELDS,
  getOrCreateProfile,
  saveProfile,
  calcValueBoostCount,
} from '../types/userProfile'
import ProgressBar from '../components/common/ProgressBar'

// ─── 옵션 상수 ────────────────────────────────────────────────────────────────

const AGE_BAND_OPTIONS: AgeBand[] = ['10대', '20대', '30대', '40대', '50대', '60대이상', '응답안함']
const GENDER_OPTIONS: Gender[] = ['남성', '여성', '논바이너리', '응답안함']
const REGION_OPTIONS: RegionGroup[] = ['수도권', '영남', '호남', '충청', '강원', '제주', '해외', '응답안함']
const ACCENT_OPTIONS: AccentGroup[] = ['표준', '경상도', '전라도', '충청도', '강원도', '제주도', '혼합', '모르겠음']
const SPEECH_STYLE_OPTIONS: SpeechStyle[] = ['주로 존댓말', '주로 반말', '혼합', '응답안함']
const LANG_OPTIONS: PrimaryLanguage[] = ['한국어(ko-KR)', '영어(en-US)', '중국어(zh-CN)', '일본어(ja-JP)', '기타', '응답안함']
const ENV_OPTIONS: CommonEnv[] = ['조용한 실내', '보통', '시끄러운 환경', '응답안함']
const DEVICE_OPTIONS: CommonDeviceMode[] = ['수화기', '핸즈프리', '블루투스', '혼합', '응답안함']
const DOMAIN_OPTIONS: DomainMixItem[] = ['일상대화', '업무', '육아', '쇼핑', '금융', '의료', '교육', '여행', '게임']

const DOMAIN_MAX = 3
const TOTAL_STEPS = 10 // 0~8: questions, 9: summary

// ─── Step config ────────────────────────────────────────────────────────────

type StepConfig = {
  question: string
  field: keyof UserProfile
  multi?: boolean
}

const STEPS: StepConfig[] = [
  { question: '연령대는 어떻게 되시나요?', field: 'age_band' },
  { question: '성별은 어떻게 되시나요?', field: 'gender' },
  { question: '어디에 거주하고 계신가요?', field: 'region_group' },
  { question: '주로 사용하시는 억양은요?', field: 'accent_group' },
  { question: '평소 말투는 어떤 편인가요?', field: 'speech_style' },
  { question: '주요 사용 언어는요?', field: 'primary_language' },
  { question: '주로 어떤 환경에서 통화하시나요?', field: 'common_env' },
  { question: '기기를 어떻게 사용하시나요?', field: 'common_device_mode' },
  { question: '주요 통화 주제를 골라주세요', field: 'domain_mix', multi: true },
]

function getOptionsForField(field: keyof UserProfile): string[] {
  switch (field) {
    case 'age_band': return AGE_BAND_OPTIONS
    case 'gender': return GENDER_OPTIONS
    case 'region_group': return REGION_OPTIONS
    case 'accent_group': return ACCENT_OPTIONS
    case 'speech_style': return SPEECH_STYLE_OPTIONS
    case 'primary_language': return LANG_OPTIONS
    case 'common_env': return ENV_OPTIONS
    case 'common_device_mode': return DEVICE_OPTIONS
    case 'domain_mix': return DOMAIN_OPTIONS
    default: return []
  }
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

function SingleChipGrid<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: T[]
  value: T | null
  onSelect: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {options.map((opt) => {
        const selected = value === opt
        const isAbstain = opt === '응답안함' || opt === '모르겠음'
        return (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="w-full px-5 py-3.5 rounded-xl text-base font-medium border transition-all text-left"
            style={
              selected
                ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                : isAbstain
                ? { backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }
                : { backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-sub)' }
            }
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function MultiChipGrid({
  options,
  value,
  onToggle,
}: {
  options: DomainMixItem[]
  value: DomainMixItem[]
  onToggle: (item: DomainMixItem) => void
}) {
  const atMax = value.length >= DOMAIN_MAX
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => {
          const selected = value.includes(opt)
          const disabled = atMax && !selected
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              disabled={disabled}
              className="px-5 py-3.5 rounded-xl text-base font-medium border transition-all"
              style={
                selected
                  ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }
                  : disabled
                  ? { backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed', opacity: 0.4 }
                  : { backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-sub)' }
              }
            >
              {opt}
            </button>
          )
        })}
      </div>
      <p className="text-sm mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
        {value.length}/{DOMAIN_MAX}개 선택됨 · 미선택 시 미응답 처리
      </p>
    </div>
  )
}

function ValueBoostCard({ profile }: { profile: UserProfile }) {
  const boostCount = calcValueBoostCount(profile)
  const fillPct = Math.round((boostCount / TOTAL_PROFILE_FIELDS) * 100)

  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-base font-semibold font-display mb-4" style={{ color: 'var(--color-text)' }}>
        프로필 완성도
      </p>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--color-muted)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${fillPct}%`, backgroundColor: 'var(--color-accent)' }}
          />
        </div>
        <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{boostCount}/{TOTAL_PROFILE_FIELDS}</span>
      </div>
      <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
        프로필 정보가 많을수록 데이터 분류가 정밀해집니다
      </p>
      {boostCount === 0 && (
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-tertiary)' }}>위 항목을 선택하면 분류 정밀도가 올라갑니다</p>
      )}
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isGateMode = searchParams.get('mode') === 'gate'
  const { userId, isReady } = useAuth()
  const [draft, setDraft] = useState<UserProfile>(() => getOrCreateProfile())
  const [step, setStep] = useState(0)

  // gate 모드가 아닌 일반 접근 시 인증 체크
  useEffect(() => {
    if (!isGateMode && isReady && !userId) {
      navigate('/auth', { replace: true })
    }
  }, [isGateMode, isReady, userId, navigate])

  const isSummaryStep = step === TOTAL_STEPS - 1
  const isLastQuestion = step === TOTAL_STEPS - 2
  const currentConfig = step < STEPS.length ? STEPS[step] : null

  function setField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function toggleDomainMix(item: DomainMixItem) {
    setDraft((prev) => {
      const current = prev.domain_mix
      if (current.includes(item)) {
        return { ...prev, domain_mix: current.filter((x) => x !== item) }
      }
      if (current.length >= DOMAIN_MAX) return prev
      return { ...prev, domain_mix: [...current, item] }
    })
  }

  function goNext() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
  }

  function goBack() {
    if (step > 0) setStep((s) => s - 1)
    else navigate(-1)
  }

  function handleSave() {
    const finalProfile = isGateMode
      ? {
          ...draft,
          profile_required_completed_at: new Date().toISOString(),
          profile_confidence: draft.profile_confidence ?? ('self_declared' as const),
          profile_snapshot_at: new Date().toISOString(),
          profile_snapshot: {
            age_band: draft.age_band,
            gender: draft.gender,
            region_group: draft.region_group,
            accent_group: draft.accent_group,
            speech_style: draft.speech_style,
            primary_language: draft.primary_language,
            common_env: draft.common_env,
            common_device_mode: draft.common_device_mode,
            domain_mix: draft.domain_mix.join(',') || null,
          },
        }
      : draft
    saveProfile(finalProfile)
    navigate(isGateMode ? '/guided' : '/profile', { replace: true })
  }

  return (
    <div className="min-h-full flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Top progress bar */}
      <div className="px-5 pt-3">
        <ProgressBar ratio={(step + 1) / TOTAL_STEPS} />
      </div>

      {/* Back button */}
      <div className="px-5 pt-3">
        <button
          onClick={goBack}
          className="flex items-center gap-1"
          style={{ color: 'var(--color-text-sub)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back_ios</span>
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 px-6 pt-6 pb-4 overflow-y-auto" style={{ paddingBottom: '8rem' }}>
        {isSummaryStep ? (
          /* Step 9: Summary */
          <div>
            <h1 className="text-2xl font-bold font-display mb-3" style={{ color: 'var(--color-text)' }}>
              프로필 설정 완료
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-sub)' }}>
              {isGateMode
                ? '프로필 설정이 완료되었습니다. 데이터 가치가 극대화됩니다.'
                : '프로필이 저장되면 데이터 분류 정밀도가 올라갑니다.'}
            </p>
            <ValueBoostCard profile={draft} />
          </div>
        ) : currentConfig ? (
          /* Steps 0~8: One question per screen */
          <div>
            <h1 className="text-2xl font-bold font-display mb-8" style={{ color: 'var(--color-text)' }}>
              {currentConfig.question}
            </h1>

            {currentConfig.multi ? (
              <div>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
                  최대 {DOMAIN_MAX}개까지 선택할 수 있어요
                </p>
                <MultiChipGrid
                  options={DOMAIN_OPTIONS}
                  value={draft.domain_mix}
                  onToggle={toggleDomainMix}
                />
              </div>
            ) : (
              <SingleChipGrid
                options={getOptionsForField(currentConfig.field)}
                value={draft[currentConfig.field] as string | null}
                onSelect={(v) => setField(currentConfig.field, v as never)}
              />
            )}
          </div>
        ) : null}
      </div>

      {/* Bottom action bar */}
      <div
        className="fixed left-0 right-0 px-5 pt-4 pb-3 z-40"
        style={{
          bottom: 'env(safe-area-inset-bottom)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <button
          onClick={isSummaryStep ? handleSave : goNext}
          className="w-full py-4 rounded-2xl text-base font-bold"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          {isSummaryStep ? '저장하고 완료' : isLastQuestion ? '다음' : '다음'}
        </button>
        {!isSummaryStep && (
          <button
            onClick={goNext}
            className="w-full text-center mt-3 py-1 text-sm"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
