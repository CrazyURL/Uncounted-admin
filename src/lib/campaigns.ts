import { type Session } from '../types/session'
import {
  type Campaign,
  type CampaignId,
  type ConsentLog,
  type MissionCode,
  MISSIONS,
} from '../types/campaign'

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'BIZ',
    name: '비즈니스 HQ',
    description: '10분 이상의 업무·회의 고품질 녹음을 수집합니다',
    matchCriteria: {
      assetTypes: ['업무/회의', '비즈니스'],
      minDurationMin: 10,
      minQaScore: 70,
    },
    unitPrice: 580,
    bonusLabel: '+15% 도메인 보너스',
    badgeColor: '#6366f1',
    icon: 'business_center',
  },
  {
    id: 'SALES',
    name: '영업/상담 감정',
    description: '2~10분 상담 통화에 감정 라벨을 추가하면 20% 보너스',
    matchCriteria: {
      minDurationMin: 2,
      maxDurationMin: 10,
    },
    unitPrice: 520,
    bonusLabel: '+20% 감정 라벨 보너스',
    badgeColor: '#10b981',
    icon: 'support_agent',
  },
  {
    id: 'MIX',
    name: '다국어 믹스',
    description: '다국어 환경 녹음 — 짧은 파일도 환영',
    matchCriteria: {
      maxDurationMin: 10,
    },
    unitPrice: 480,
    bonusLabel: '+10% 다국어 보너스',
    badgeColor: '#f59e0b',
    icon: 'translate',
  },
]

// ── Consent localStorage helpers ──────────────────────────────────────────────

const CONSENT_KEY = 'uncounted_consents'

export function loadConsents(): ConsentLog[] {
  try {
    return JSON.parse(localStorage.getItem(CONSENT_KEY) ?? '[]') as ConsentLog[]
  } catch {
    return []
  }
}

export function saveConsents(logs: ConsentLog[]): void {
  localStorage.setItem(CONSENT_KEY, JSON.stringify(logs))
}

export function getActiveConsent(campaignId: CampaignId): boolean {
  const logs = loadConsents()
  const last = [...logs].reverse().find((l) => l.campaignId === campaignId)
  return last !== undefined && last.action === 'join'
}

export function joinCampaign(campaignId: CampaignId): void {
  const logs = loadConsents()
  logs.push({ campaignId, action: 'join', ts: new Date().toISOString() })
  saveConsents(logs)
}

export function withdrawCampaign(campaignId: CampaignId): void {
  const logs = loadConsents()
  logs.push({ campaignId, action: 'withdraw', ts: new Date().toISOString() })
  saveConsents(logs)
}

// ── Session matching ───────────────────────────────────────────────────────────

export function matchSessions(campaign: Campaign, sessions: Session[]): Session[] {
  const c = campaign.matchCriteria
  return sessions.filter((s) => {
    const dMin = s.duration / 60
    if (c.minDurationMin !== undefined && dMin < c.minDurationMin) return false
    if (c.maxDurationMin !== undefined && dMin > c.maxDurationMin) return false
    if (c.minQaScore !== undefined && (s.qaScore ?? 0) < c.minQaScore) return false
    return true
  })
}

// ── Mission state (반복 사이클 추적) ─────────────────────────────────────────

type MissionState = {
  label10Cycles: number
  dialogAct5Cycles: number
}

const MISSION_STATE_KEY = 'uncounted_mission_state'

export function loadMissionState(): MissionState {
  try {
    const raw = localStorage.getItem(MISSION_STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { label10Cycles: 0, dialogAct5Cycles: 0 }
}

function saveMissionState(state: MissionState): void {
  localStorage.setItem(MISSION_STATE_KEY, JSON.stringify(state))
}

export function getMissionCycles(code: MissionCode): number {
  const state = loadMissionState()
  switch (code) {
    case 'LABEL_10': return state.label10Cycles
    case 'DIALOG_ACT_5': return state.dialogAct5Cycles
  }
}

// ── Mission progress ───────────────────────────────────────────────────────────

/** 수동 라벨 완료 세션 수 (전체) */
function countManualLabels(sessions: Session[]): number {
  return sessions.filter(
    (s) => s.labelStatus === 'CONFIRMED' && s.labelSource === 'user',
  ).length
}

/** 대화행위 입력 완료 세션 수 (전체) */
function countDialogActLabels(sessions: Session[]): number {
  return sessions.filter(
    (s) => s.labels?.primarySpeechAct != null && s.labelStatus === 'CONFIRMED',
  ).length
}

/** 현재 사이클 내 진행도 (0 ~ targetValue) */
export function calcMissionProgress(code: MissionCode, sessions: Session[]): number {
  const state = loadMissionState()
  switch (code) {
    case 'LABEL_10': {
      const total = countManualLabels(sessions)
      return Math.max(0, total - state.label10Cycles * 10)
    }
    case 'DIALOG_ACT_5': {
      const total = countDialogActLabels(sessions)
      return Math.max(0, total - state.dialogAct5Cycles * 5)
    }
  }
}

/**
 * 미션 완료 체크 + 사이클 자동 증가.
 * 진행도가 target 이상이면 사이클 완료 처리.
 * 반환: 이번 호출에서 완료된 미션 코드 배열
 */
export function checkAndCompleteMissions(sessions: Session[]): MissionCode[] {
  const state = loadMissionState()
  const completed: MissionCode[] = []

  const labelTotal = countManualLabels(sessions)
  const labelProgress = labelTotal - state.label10Cycles * 10
  if (labelProgress >= 10) {
    state.label10Cycles += Math.floor(labelProgress / 10)
    completed.push('LABEL_10')
  }

  const dialogTotal = countDialogActLabels(sessions)
  const dialogProgress = dialogTotal - state.dialogAct5Cycles * 5
  if (dialogProgress >= 5) {
    state.dialogAct5Cycles += Math.floor(dialogProgress / 5)
    completed.push('DIALOG_ACT_5')
  }

  if (completed.length > 0) saveMissionState(state)
  return completed
}

export function getMissionTarget(code: MissionCode): number {
  return MISSIONS.find((m) => m.code === code)?.targetValue ?? 1
}
