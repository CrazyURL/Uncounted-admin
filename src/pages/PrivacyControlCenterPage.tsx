// ── PrivacyControlCenterPage — 개인정보 제어 센터 ─────────────────────────────
// 신뢰 우선(Trust-first). 불필요한 모션 없음.
// per-SKU 수집 동의 토글 + 탈퇴/삭제 2단계 확인.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SKU_CATALOG } from '../types/sku'
import {
  loadPipaConsent,
  savePipaConsent,
  hasCollectConsent,
  hasThirdPartyConsent,
  PIPA_CONSENT_KEY,
  type PipaConsentRecord,
} from '../types/consent'

// ── 동의 상태 (localStorage) ─────────────────────────────────────────────────
const CONSENT_KEY = 'uncounted_sku_consents'

function loadConsents(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveConsents(c: Record<string, boolean>) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify(c))
}

// ── 2카테고리 정의 (음성 / 메타데이터) ──────────────────────────────────────
const CATEGORIES = [
  {
    key: 'voice' as const,
    icon: 'mic',
    label: '음성 데이터',
    desc: '익명화 음성 파일 + 라벨 (U-A01~A03)',
    skuIds: SKU_CATALOG.filter((s) => s.category === 'voice').map((s) => s.id),
    items: ['비식별화 처리된 음성 파일', '사용자 직접 입력 라벨 (상황/대화행위)'],
  },
  {
    key: 'metadata' as const,
    icon: 'device_hub',
    label: '활동 메타데이터',
    desc: '통화 이벤트 · 기기 환경 버킷 (U-M01~M05)',
    skuIds: SKU_CATALOG.filter((s) => s.category === 'metadata').map((s) => s.id),
    items: ['통화 이벤트 버킷 (내용 없음)', '기기 환경 버킷 (정밀 위치 없음)', '앱 카테고리 시퀀스 (앱명 없음)'],
  },
]

// ── 수집 항목 정적 정의 ──────────────────────────────────────────────────────
const COLLECTED_ITEMS = [
  '음성 파일 메타데이터 (길이, 날짜, 품질 점수)',
  '사용자가 직접 입력한 라벨 (관계·목적·도메인·톤·소음)',
  '사용자 프로필 enum 값 (연령대, 성별, 지역, 억양 등)',
  '통화 이벤트 버킷 (건수, 시간대 — 내용 없음)',
  '기기 환경 버킷 (연결성, 배터리 수준 — 정밀 위치 없음)',
]
const NOT_COLLECTED_ITEMS = [
  '음성 통화 내용(대화 텍스트·녹취록)',
  '이름·주소·전화번호·이메일 등 PII',
  '정확한 GPS 위치',
  '앱 이름 또는 웹사이트 URL',
  '타인 정보 (수신자, 제3자)',
]

// ── 삭제 확인 모달 ────────────────────────────────────────────────────────────
function DeleteConfirmModal({
  step,
  onCancel,
  onConfirm1,
  onConfirm2,
}: {
  step: 1 | 2
  onCancel: () => void
  onConfirm1: () => void
  onConfirm2: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8">
      <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onCancel} />
      <div
        className="relative w-full rounded-2xl p-5 max-w-sm"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-danger)' }}
      >
        {step === 1 ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-danger)' }}>warning</span>
              <p className="font-bold text-base" style={{ color: 'var(--color-text)' }}>정말 삭제하시겠어요?</p>
            </div>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              모든 로컬 데이터(프로필, 라벨, 동의 기록)가 삭제됩니다.
              서버에 이미 제출된 데이터는 별도 요청이 필요합니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={onConfirm1}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-danger-dim)', color: 'var(--color-danger)' }}
              >
                계속
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-danger)' }}>delete_forever</span>
              <p className="font-bold text-base" style={{ color: 'var(--color-text)' }}>최종 확인</p>
            </div>
            <p className="text-sm mb-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              이 작업은 되돌릴 수 없습니다.
            </p>
            <p className="text-[11px] mb-5" style={{ color: 'var(--color-danger)' }}>
              "삭제 실행"을 탭하면 즉시 처리됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={onConfirm2}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}
              >
                삭제 실행
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function PrivacyControlCenterPage() {
  const navigate = useNavigate()
  const [consents, setConsents] = useState<Record<string, boolean>>(loadConsents)
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleted, setDeleted] = useState(false)
  const [pipa, setPipa] = useState<PipaConsentRecord>(loadPipaConsent)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)

  function handleCategoryToggle(categoryKey: string, next: boolean) {
    const cat = CATEGORIES.find((c) => c.key === categoryKey)
    if (!cat) return
    const updated = { ...consents }
    for (const skuId of cat.skuIds) {
      updated[skuId] = next
    }
    setConsents(updated)
    saveConsents(updated)
  }

  function isCategoryOn(categoryKey: string): boolean {
    const cat = CATEGORIES.find((c) => c.key === categoryKey)
    if (!cat) return false
    return cat.skuIds.some((id) => consents[id])
  }

  function handleCollectConsent() {
    const now = new Date().toISOString()
    const updated = { ...pipa, collectConsentAt: now, withdrawnAt: null }
    setPipa(updated)
    savePipaConsent(updated)
  }

  function handleThirdPartyConsent() {
    const now = new Date().toISOString()
    const updated = { ...pipa, thirdPartyConsentAt: now, withdrawnAt: null }
    setPipa(updated)
    savePipaConsent(updated)
  }

  function handleWithdrawConsent() {
    const now = new Date().toISOString()
    const updated = { ...pipa, withdrawnAt: now }
    setPipa(updated)
    savePipaConsent(updated)
    setShowWithdrawConfirm(false)
  }

  function handleDeleteConfirm2() {
    // 로컬 데이터 모두 삭제
    localStorage.removeItem('uncounted_user_profile')
    localStorage.removeItem('uncounted_sku_consents')
    localStorage.removeItem('uncounted_joined_skus')
    localStorage.removeItem('uncounted_label_trust')
    localStorage.removeItem(PIPA_CONSENT_KEY)
    setDeleted(true)
    setDeleteStep(0)
  }

  if (deleted) {
    return (
      <div
        className="min-h-full flex flex-col items-center justify-center px-6 gap-6"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <span className="material-symbols-outlined text-5xl" style={{ color: 'var(--color-success)' }}>
          check_circle
        </span>
        <div className="text-center">
          <p className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>로컬 데이터 삭제 완료</p>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            서버 데이터 삭제 요청은 고객 지원팀에 문의해주세요.
          </p>
        </div>
        <button
          onClick={() => navigate('/home')}
          className="px-6 py-3 rounded-xl font-bold text-sm"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
        >
          홈으로
        </button>
      </div>
    )
  }

  return (
    <div
      className="min-h-full px-4 pt-5 pb-10 flex flex-col gap-5"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* 헤더 설명 */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-accent)' }}>
            shield
          </span>
          <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>데이터 · 권리 · 동의</p>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
          Uncounted는 음성 내용을 수집하지 않습니다.
          아래에서 각 데이터 카테고리 수집을 개별 동의·철회할 수 있습니다.
        </p>
      </div>

      {/* 수집하는 항목 */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>수집하는 항목</p>
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {COLLECTED_ITEMS.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }}>
                check_circle
              </span>
              <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 수집하지 않는 항목 */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>수집하지 않는 항목</p>
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {NOT_COLLECTED_ITEMS.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }}>
                cancel
              </span>
              <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 카테고리별 수집 동의 */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>데이터 수집 동의</p>
        <div className="flex flex-col gap-3">
          {CATEGORIES.map((cat) => {
            const on = isCategoryOn(cat.key)
            return (
              <div
                key={cat.key}
                className="rounded-xl p-4"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-xl mt-0.5" style={{ color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{cat.label}</p>
                    <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{cat.desc}</p>
                  </div>
                  <button
                    onClick={() => handleCategoryToggle(cat.key, !on)}
                    className="relative flex-shrink-0 mt-0.5"
                    aria-label={`${cat.label} 수집 ${on ? '중지' : '동의'}`}
                  >
                    <div
                      className="w-11 h-6 rounded-full transition-colors duration-200"
                      style={{ backgroundColor: on ? 'var(--color-accent)' : 'var(--color-muted)' }}
                    >
                      <div
                        className="absolute top-1 w-4 h-4 rounded-full transition-transform duration-200 shadow-sm"
                        style={{
                          backgroundColor: 'white',
                          transform: on ? 'translateX(22px)' : 'translateX(4px)',
                        }}
                      />
                    </div>
                  </button>
                </div>
                <div className="mt-2 pl-8">
                  {cat.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="material-symbols-outlined text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--color-success)' }}>check</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-sub)' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── PIPA 동의 (개인정보보호법 15조/17조) ── */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
          개인정보보호법 동의 (필수)
        </p>

        {/* 수집·이용 동의 (제15조) */}
        <div
          className="rounded-xl p-4 mb-3"
          style={{ backgroundColor: 'var(--color-surface)', border: `1px solid ${hasCollectConsent(pipa) ? 'var(--color-success)' : 'var(--color-border)'}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-base" style={{ color: hasCollectConsent(pipa) ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
              {hasCollectConsent(pipa) ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>수집·이용 동의 (제15조)</p>
          </div>
          <div className="pl-7 mb-3">
            <p className="text-[11px] leading-relaxed mb-1" style={{ color: 'var(--color-text-sub)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>수집 목적:</span> {pipa.collectPurpose}
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>보유 기간:</span> {pipa.retentionPeriod}
            </p>
          </div>
          {!hasCollectConsent(pipa) ? (
            <button
              onClick={handleCollectConsent}
              className="ml-7 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
            >
              수집·이용에 동의합니다
            </button>
          ) : (
            <p className="ml-7 text-[10px]" style={{ color: 'var(--color-success)' }}>
              동의 완료 ({pipa.collectConsentAt?.slice(0, 10)})
            </p>
          )}
        </div>

        {/* 제3자 제공 동의 (제17조) */}
        <div
          className="rounded-xl p-4 mb-3"
          style={{ backgroundColor: 'var(--color-surface)', border: `1px solid ${hasThirdPartyConsent(pipa) ? 'var(--color-success)' : 'var(--color-border)'}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-base" style={{ color: hasThirdPartyConsent(pipa) ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
              {hasThirdPartyConsent(pipa) ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>제3자 제공 동의 (제17조)</p>
          </div>
          <div className="pl-7 mb-3">
            <p className="text-[11px] leading-relaxed mb-1" style={{ color: 'var(--color-text-sub)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>제공받는 자:</span> {pipa.thirdPartyRecipients}
            </p>
            <p className="text-[11px] leading-relaxed mb-1" style={{ color: 'var(--color-text-sub)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>제공 목적:</span> {pipa.thirdPartyPurpose}
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>보유 기간:</span> {pipa.retentionPeriod}
            </p>
          </div>
          {!hasThirdPartyConsent(pipa) ? (
            <button
              onClick={handleThirdPartyConsent}
              className="ml-7 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)' }}
            >
              제3자 제공에 동의합니다
            </button>
          ) : (
            <p className="ml-7 text-[10px]" style={{ color: 'var(--color-success)' }}>
              동의 완료 ({pipa.thirdPartyConsentAt?.slice(0, 10)})
            </p>
          )}
        </div>

        {/* 동의 철회 */}
        {(hasCollectConsent(pipa) || hasThirdPartyConsent(pipa)) && (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-warning)' }}>undo</span>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>동의 철회</p>
            </div>
            <p className="text-[11px] leading-relaxed mb-3 pl-7" style={{ color: 'var(--color-text-sub)' }}>
              동의를 철회하면 미판매 데이터는 즉시 삭제되며, 이미 납품된 데이터에 대해서는 제공받은 자에게 통지합니다.
            </p>
            <button
              onClick={() => setShowWithdrawConfirm(true)}
              className="ml-7 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-danger-dim)', color: 'var(--color-danger)' }}
            >
              <span className="material-symbols-outlined text-sm">block</span>
              동의 철회
            </button>
          </div>
        )}

        {/* 이미 철회된 상태 */}
        {pipa.withdrawnAt && (
          <div className="rounded-xl px-4 py-3 mt-3" style={{ backgroundColor: 'var(--color-muted)' }}>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              동의가 철회되었습니다 ({pipa.withdrawnAt.slice(0, 10)}).
              {pipa.withdrawalNotifiedAt
                ? ` 납품처 통지 완료 (${pipa.withdrawalNotifiedAt.slice(0, 10)})`
                : ' 납품처 통지는 고객 지원팀을 통해 처리됩니다.'}
            </p>
          </div>
        )}
      </div>

      {/* 위험 구분선 */}
      <div className="h-px" style={{ backgroundColor: 'var(--color-danger)' }} />

      {/* 데이터 삭제 */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>데이터 삭제 · 탈퇴</p>
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-danger)' }}
        >
          <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            기기 내 로컬 데이터(프로필, 라벨, 동의 기록)를 삭제합니다.
            서버에 이미 제출된 데이터 삭제는 고객 지원팀을 통해 요청하세요.
          </p>
          <button
            onClick={() => setDeleteStep(1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-danger-dim)', color: 'var(--color-danger)' }}
          >
            <span className="material-symbols-outlined text-base">delete</span>
            로컬 데이터 삭제
          </button>
        </div>
      </div>

      {/* 동의 철회 확인 모달 */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8">
          <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowWithdrawConfirm(false)} />
          <div
            className="relative w-full rounded-2xl p-5 max-w-sm"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-xl" style={{ color: 'var(--color-warning)' }}>warning</span>
              <p className="font-bold text-base" style={{ color: 'var(--color-text)' }}>동의를 철회하시겠어요?</p>
            </div>
            <div className="text-xs mb-5 leading-relaxed flex flex-col gap-2" style={{ color: 'var(--color-text-sub)' }}>
              <p>철회 시 다음이 적용됩니다:</p>
              <div className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--color-danger)' }}>close</span>
                <span>미판매 데이터는 즉시 판매 중단 및 삭제</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--color-warning)' }}>mail</span>
                <span>이미 납품된 데이터는 제공받은 자에게 철회 사실 통지</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>info</span>
                <span>수집·이용 동의와 제3자 제공 동의가 모두 철회됩니다</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleWithdrawConsent}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}
              >
                동의 철회
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 모달 */}
      {deleteStep > 0 && (
        <DeleteConfirmModal
          step={deleteStep as 1 | 2}
          onCancel={() => setDeleteStep(0)}
          onConfirm1={() => setDeleteStep(2)}
          onConfirm2={handleDeleteConfirm2}
        />
      )}
    </div>
  )
}
