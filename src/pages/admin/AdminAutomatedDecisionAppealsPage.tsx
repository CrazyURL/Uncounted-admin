// 자동화된 결정 거부·설명 요구 큐 (PIPC v1.3 §14.5)
// 10영업일 회신 SLA. pending → in_review → resolved/rejected.

import { useCallback, useEffect, useState } from 'react'
import {
  fetchAutomatedDecisionAppeals,
  updateAutomatedDecisionAppeal,
  businessDaysElapsed,
  type AutomatedDecisionAppealRow,
  type QueueStatus,
  type AppealType,
  type DecisionArea,
} from '../../lib/api/appealsQueue'

const APPEAL_TYPE_LABELS: Record<AppealType, string> = {
  reject: '거부 (사람 개입 요청)',
  explain: '설명 요구',
}

const DECISION_AREA_LABELS: Record<DecisionArea, string> = {
  pii_masking: 'PII 마스킹',
  speaker_diarization: '화자분리',
  quality_grade: '품질 등급',
  dataset_eligibility: '적격성 판정',
}

const STATUS_TABS: QueueStatus[] = ['pending', 'in_review', 'resolved', 'rejected']
const STATUS_LABELS: Record<QueueStatus, string> = {
  pending: '신규',
  in_review: '검토 중',
  resolved: '처리 완료',
  rejected: '반려',
}

const SLA_DAYS = 10

export default function AdminAutomatedDecisionAppealsPage() {
  const [statusTab, setStatusTab] = useState<QueueStatus>('pending')
  const [items, setItems] = useState<AutomatedDecisionAppealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [responseDraft, setResponseDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchAutomatedDecisionAppeals(statusTab, 50)
    setItems(data)
    setLoading(false)
  }, [statusTab])

  useEffect(() => {
    void load()
  }, [load])

  async function applyUpdate(
    id: string,
    newStatus: Exclude<QueueStatus, 'pending'>,
  ) {
    const result = await updateAutomatedDecisionAppeal(id, {
      status: newStatus,
      admin_response: responseDraft.trim() || undefined,
    })
    if (result) {
      setActiveId(null)
      setResponseDraft('')
      await load()
    }
  }

  return (
    <div className="min-h-full px-6 pt-6 pb-24">
      <h1 className="text-2xl font-bold mb-1">자동화된 결정 거부·설명 요구</h1>
      <p className="text-sm text-gray-500 mb-4">
        처리방침 v1.3 §14.5 · {SLA_DAYS}영업일 회신 SLA
      </p>

      <div className="flex gap-2 mb-4">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              statusTab === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-10 text-gray-500">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-center py-10 text-gray-500">
          {STATUS_LABELS[statusTab]} 상태의 요청이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((row) => {
            const elapsed = businessDaysElapsed(row.created_at)
            const overdue = statusTab !== 'resolved' && statusTab !== 'rejected' && elapsed > SLA_DAYS
            return (
              <div
                key={row.id}
                className={`p-4 rounded-xl border ${
                  overdue ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {DECISION_AREA_LABELS[row.decision_area]}
                    </span>
                    <span className="text-xs text-gray-500">
                      · {APPEAL_TYPE_LABELS[row.appeal_type]}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      overdue ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {elapsed}/{SLA_DAYS}영업일
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-1">
                  {new Date(row.created_at).toLocaleString('ko-KR')}
                  {' · '}
                  사용자 {row.users?.email ?? row.user_id.slice(0, 8)}
                  {row.session_id && ` · 세션 ${row.session_id.slice(0, 8)}`}
                </p>

                {row.user_message && (
                  <p className="text-sm leading-relaxed mt-2 p-2 bg-gray-50 rounded">
                    {row.user_message}
                  </p>
                )}

                {row.admin_response && (
                  <p className="text-sm leading-relaxed mt-2 p-2 bg-blue-50 rounded">
                    <strong>회신:</strong> {row.admin_response}
                  </p>
                )}

                {statusTab !== 'resolved' && statusTab !== 'rejected' && (
                  activeId === row.id ? (
                    <div className="mt-3">
                      <textarea
                        value={responseDraft}
                        onChange={(e) => setResponseDraft(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        placeholder="회신 내용 (선택)"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => void applyUpdate(row.id, 'resolved')}
                          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-semibold"
                        >
                          처리 완료
                        </button>
                        <button
                          onClick={() => void applyUpdate(row.id, 'rejected')}
                          className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-semibold"
                        >
                          반려
                        </button>
                        {statusTab === 'pending' && (
                          <button
                            onClick={() => void applyUpdate(row.id, 'in_review')}
                            className="px-3 py-1.5 bg-yellow-500 text-white rounded text-sm font-semibold"
                          >
                            검토 중
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveId(null)
                            setResponseDraft('')
                          }}
                          className="px-3 py-1.5 bg-gray-200 rounded text-sm"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setActiveId(row.id)
                        setResponseDraft(row.admin_response ?? '')
                      }}
                      className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold"
                    >
                      회신 작성
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
