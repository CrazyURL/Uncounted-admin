import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getInvitationByToken,
  processAgreement,
  processDecline,
  updateInvitationStatus,
} from '../lib/consentInvitation'

// ── 상태 타입 ────────────────────────────────────────────────────────────────

type PageState =
  | { step: 'loading' }
  | { step: 'invalid'; message: string }
  | { step: 'expired' }
  | { step: 'info'; sessionDate: string; durationMin: number }
  | { step: 'agreed' }
  | { step: 'declined' }
  | { step: 'already_agreed' }

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function PeerConsentPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<PageState>({ step: 'loading' })

  const token = searchParams.get('t')
  const sessionDate = searchParams.get('d') ?? ''
  const durationMin = parseInt(searchParams.get('m') ?? '0', 10)

  useEffect(() => {
    if (!token) {
      setState({ step: 'invalid', message: '유효하지 않은 링크입니다' })
      return
    }

    const invitation = getInvitationByToken(token)
    if (!invitation) {
      setState({ step: 'invalid', message: '초대를 찾을 수 없습니다' })
      return
    }

    // 만료 확인
    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      updateInvitationStatus(invitation.id, 'expired')
      setState({ step: 'expired' })
      return
    }

    // 이미 동의한 경우
    if (invitation.status === 'agreed') {
      setState({ step: 'already_agreed' })
      return
    }

    // 이미 거절한 경우
    if (invitation.status === 'declined') {
      setState({ step: 'declined' })
      return
    }

    // 열람 상태로 전환
    if (invitation.status === 'sent' || invitation.status === 'pending') {
      updateInvitationStatus(invitation.id, 'opened')
    }

    setState({ step: 'info', sessionDate, durationMin })
  }, [token, sessionDate, durationMin])

  function handleAgree() {
    if (!token) return
    const result = processAgreement(token)
    if (result.success) {
      setState({ step: 'agreed' })
    } else {
      setState({ step: 'invalid', message: result.error ?? '처리 중 오류가 발생했습니다' })
    }
  }

  function handleDecline() {
    if (!token) return
    processDecline(token)
    setState({ step: 'declined' })
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ backgroundColor: '#101322' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-xl"
        style={{ backgroundColor: '#1b1e2e' }}
      >
        {/* 로고 / 앱명 */}
        <div className="text-center mb-6">
          <span
            className="material-symbols-outlined text-4xl"
            style={{ color: '#1337ec' }}
          >
            verified_user
          </span>
          <h1 className="text-lg font-bold text-white mt-2">Uncounted</h1>
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            통화 녹음 데이터 동의 요청
          </p>
        </div>

        {/* 상태별 렌더 */}
        {state.step === 'loading' && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-3xl animate-spin text-white">
              progress_activity
            </span>
            <p className="text-sm text-white mt-2">확인 중...</p>
          </div>
        )}

        {state.step === 'invalid' && (
          <StatusCard
            icon="error"
            iconColor="#ef4444"
            title="유효하지 않은 요청"
            description={state.message}
          />
        )}

        {state.step === 'expired' && (
          <StatusCard
            icon="schedule"
            iconColor="#f59e0b"
            title="초대가 만료되었습니다"
            description="동의 요청 유효 기간(7일)이 지났습니다. 상대방에게 다시 요청해주세요."
          />
        )}

        {state.step === 'info' && (
          <>
            {/* 세션 정보 */}
            <div
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: '#151829' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-xl" style={{ color: '#1337ec' }}>
                  call
                </span>
                <div>
                  <p className="text-sm font-medium text-white">통화 녹음</p>
                  <p className="text-xs" style={{ color: '#9ca3af' }}>
                    {state.sessionDate} · {state.durationMin}분
                  </p>
                </div>
              </div>
            </div>

            {/* 동의 내용 설명 */}
            <div className="space-y-3 mb-6">
              <InfoRow
                icon="mic"
                text="이 통화에 참여한 상대방이 녹음 데이터의 AI 학습 활용에 동의를 요청합니다."
              />
              <InfoRow
                icon="shield"
                text="음성은 비식별 처리되어 개인을 특정할 수 없습니다."
              />
              <InfoRow
                icon="lock"
                text="전화번호, 이름 등 개인정보는 수집하지 않습니다."
              />
              <InfoRow
                icon="gavel"
                text="통신비밀보호법에 따라 양측 동의 시에만 전체 음성이 활용됩니다."
              />
            </div>

            {/* 동의/거절 버튼 */}
            <div className="space-y-3">
              <button
                onClick={handleAgree}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity active:opacity-80"
                style={{ backgroundColor: '#1337ec' }}
              >
                동의합니다
              </button>
              <button
                onClick={handleDecline}
                className="w-full py-3 rounded-xl text-sm font-medium transition-opacity active:opacity-80"
                style={{ backgroundColor: '#252a3a', color: '#9ca3af' }}
              >
                동의하지 않습니다
              </button>
            </div>

            {/* 안내 */}
            <p className="text-xs text-center mt-4" style={{ color: '#6b7280' }}>
              동의하지 않더라도 불이익은 없습니다. 7일 내 응답해주세요.
            </p>
          </>
        )}

        {state.step === 'agreed' && (
          <StatusCard
            icon="check_circle"
            iconColor="#22c55e"
            title="동의가 완료되었습니다"
            description="감사합니다. 비식별 처리된 음성 데이터가 AI 학습에 활용될 수 있습니다."
          />
        )}

        {state.step === 'already_agreed' && (
          <StatusCard
            icon="check_circle"
            iconColor="#22c55e"
            title="이미 동의하셨습니다"
            description="이 통화에 대해 이미 동의가 완료되었습니다."
          />
        )}

        {state.step === 'declined' && (
          <StatusCard
            icon="cancel"
            iconColor="#9ca3af"
            title="동의하지 않으셨습니다"
            description="동의하지 않더라도 불이익은 없습니다. 마음이 바뀌시면 상대방에게 다시 요청해주세요."
          />
        )}
      </div>

      {/* 하단 Powered by */}
      <p className="text-xs mt-6" style={{ color: '#4b5563' }}>
        Uncounted — 당신의 데이터, 당신의 가치
      </p>
    </div>
  )
}

// ── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function StatusCard({
  icon,
  iconColor,
  title,
  description,
}: {
  icon: string
  iconColor: string
  title: string
  description: string
}) {
  return (
    <div className="text-center py-6">
      <span
        className="material-symbols-outlined text-5xl"
        style={{ color: iconColor }}
      >
        {icon}
      </span>
      <h2 className="text-base font-bold text-white mt-3">{title}</h2>
      <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>
        {description}
      </p>
    </div>
  )
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="material-symbols-outlined text-lg mt-0.5 shrink-0"
        style={{ color: '#1337ec' }}
      >
        {icon}
      </span>
      <p className="text-sm" style={{ color: '#d1d5db' }}>{text}</p>
    </div>
  )
}
