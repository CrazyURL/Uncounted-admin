// 통화 단위 검수 액션 버튼 (승인 / 재수정 필요 / 거절)
//
// 사용처: AdminUtterancesPage 의 SessionRow 헤더
// 처리 흐름이 끝나지 않으면 비활성. 이미 결정된 상태면 텍스트만 표시.

import { Button } from '../ui'
import { labels } from '../../lib/labels'
import {
  type AdminSession,
  type ReviewStatus,
  isPipelineComplete,
} from '../../types/adminSession'

export interface SessionReviewActionRequest {
  status: ReviewStatus
  label: string
  body: string
}

interface SessionReviewActionsProps {
  session: AdminSession
  onAction: (req: SessionReviewActionRequest) => void
}

export function SessionReviewActions({ session, onAction }: SessionReviewActionsProps) {
  const complete = isPipelineComplete(session)
  const review = session.review_status ?? 'pending'

  // 처리 흐름 미완 시 검수 액션 비활성
  if (!complete && review === 'pending') {
    return <span className="text-xs text-txt-tertiary">처리 흐름 진행 중</span>
  }

  // 이미 결정된 상태 — 단순 표시만
  if (review === 'approved' || review === 'rejected') {
    return <span className="text-xs text-txt-tertiary">완료된 결정</span>
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="primary"
        onClick={(e) => {
          e.stopPropagation()
          onAction({
            status: 'approved',
            label: labels.action.approve,
            body: '승인 후에는 납품 가능 상태로 전환됩니다.',
          })
        }}
      >
        {labels.action.approve}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation()
          onAction({
            status: 'needs_revision',
            label: labels.action.needRevision,
            body: 'PII 보정 또는 라벨 수정이 필요한 경우 사용합니다.',
          })
        }}
      >
        {labels.action.needRevision}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={(e) => {
          e.stopPropagation()
          onAction({
            status: 'rejected',
            label: labels.action.reject,
            body: labels.confirm.rejectBody,
          })
        }}
      >
        {labels.action.reject}
      </Button>
    </div>
  )
}
