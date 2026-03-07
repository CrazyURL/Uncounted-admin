// ── 튜토리얼 상태 관리 ────────────────────────────────────────────────────────
// localStorage 기반. React 의존성 없음.

export type TutorialStage = 'welcome' | 'coachmarks' | 'quests' | 'done'
export type QuestId = 'asset_scan' | 'share_prep' | 'pii_review'

export type TutorialState = {
  stage: TutorialStage
  questsDone: QuestId[]
}

const STORAGE_KEY = 'uncounted_tutorial'
const ALL_QUESTS: QuestId[] = ['asset_scan', 'share_prep', 'pii_review']

const DEFAULT_STATE: TutorialState = { stage: 'welcome', questsDone: [] }

export function loadTutorial(): TutorialState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as TutorialState
    if (!parsed.stage || !Array.isArray(parsed.questsDone)) return DEFAULT_STATE
    return parsed
  } catch {
    return DEFAULT_STATE
  }
}

export function saveTutorial(state: TutorialState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function isFirstVisit(): boolean {
  return !localStorage.getItem(STORAGE_KEY)
}

export function advanceStage(next: TutorialStage): void {
  const state = loadTutorial()
  state.stage = next
  saveTutorial(state)
}

export function completeQuest(id: QuestId): void {
  const state = loadTutorial()
  if (state.questsDone.includes(id)) return
  state.questsDone.push(id)
  if (ALL_QUESTS.every((q) => state.questsDone.includes(q))) {
    state.stage = 'done'
  }
  saveTutorial(state)
}

export function allQuestsDone(state: TutorialState): boolean {
  return ALL_QUESTS.every((q) => state.questsDone.includes(q))
}

/** 튜토리얼 초기화 — 처음부터 다시 시작 */
export function resetTutorial(): void {
  localStorage.removeItem(STORAGE_KEY)
}
