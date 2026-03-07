// ── 파이프라인 오케스트레이터 ─────────────────────────────────────────────────
// STT는 백그라운드 fire-and-forget — PII/라벨은 전체 세션 즉시 일괄 처리.
// 7,000건 이상에서도 수 분 내 완료. STT는 별도로 계속 진행.
// 크래시 후 자동 재개: resumePipeline()

import { type Session } from '../types/session'
import {
  type PipelineStage,
  getPipelineSnapshot,
  pipelineStart,
  pipelineUpdateStage,
  pipelineMarkComplete,
} from './pipelineState'
import { setSttMode, enqueueTranscriptions } from './sttEngine'
import { loadTranscriptFull, loadAllTranscripts } from './transcriptStore'
import { scanSessionPii } from './piiDetector'
import {
  scanTranscriptPii,
  applySanitizeResult,
  saveSanitizeCacheEntry,
  sessionHash,
  type SanitizeCacheEntry,
} from './sanitizeCache'
import { saveAllSessions, loadAllSessions } from './sessionMapper'
import { batchAutoLabel, applyAutoLabelToSession } from './autoLabel'
import { extractContactName } from './contactUtils'
import { refreshDerivedMetadata } from './metadataExportResolver'
import { registerProcessingTask, updateProcessingTask, unregisterProcessingTask } from './processingServiceBridge'

const PIPELINE_TASK_ID = 'pipeline'

/** STT enqueue 배치 크기 */
const STT_BATCH_SIZE = 50

// ── 메인 파이프라인 ──────────────────────────────────────────────────────────

export async function runFullPipeline(
  initialSessions: Session[],
): Promise<void> {
  pipelineStart()
  await registerProcessingTask(PIPELINE_TASK_ID, '데이터 처리 중', 4)

  try {
    const total = initialSessions.length

    // Stage 1: Scan 완료
    pipelineUpdateStage('scan', {
      status: 'done', progress: 100, total, done: total,
    })

    // Stage 2: STT — 백그라운드 fire-and-forget (완료 대기 안 함)
    const sttItems = initialSessions
      .filter(s => s.callRecordId)
      .map(s => ({ sessionId: s.id, callRecordId: s.callRecordId! }))

    if (sttItems.length > 0) {
      pipelineUpdateStage('stt', {
        status: 'running', total: sttItems.length, done: 0, progress: 0,
      })
      setSttMode('on')
      startSttBackground(sttItems)
    } else {
      pipelineUpdateStage('stt', { status: 'done', progress: 100, total: 0, done: 0 })
    }

    // Stage 3: PII — 전체 세션 즉시 일괄 처리
    await updateProcessingTask(PIPELINE_TASK_ID, 2, 4, '민감정보 검사 중')
    const afterPii = await runPiiForAll(initialSessions)
    await saveAllSessions(afterPii)

    // Stage 4: Label — 전체 세션 즉시 일괄 처리
    await updateProcessingTask(PIPELINE_TASK_ID, 3, 4, '자동 라벨링 중')
    const afterLabel = await runLabelForAll(afterPii)
    await saveAllSessions(afterLabel)

    // Stage 5: 메타데이터
    await updateProcessingTask(PIPELINE_TASK_ID, 4, 4, '메타데이터 정리 중')
    await runMetadataStage()

    // STT는 백그라운드 계속 진행 — 파이프라인 상에서는 done 처리
    pipelineUpdateStage('stt', { status: 'done', progress: 100 })
    pipelineMarkComplete()
  } catch (err) {
    console.error('[Pipeline] error:', err)
    markCurrentStageError()
  } finally {
    await unregisterProcessingTask(PIPELINE_TASK_ID)
  }
}

// ── 크래시 후 재개 ──────────────────────────────────────────────────────────

export async function resumePipeline(): Promise<void> {
  const snap = getPipelineSnapshot()
  if (snap.overallComplete || !snap.startedAt) return

  if (import.meta.env.DEV) console.log('[Pipeline] 중단된 파이프라인 감지, 재개 시작')
  await registerProcessingTask(PIPELINE_TASK_ID, '데이터 처리 재개 중', 4)

  try {
    const sessions = await loadAllSessions()
    if (sessions.length === 0) {
      pipelineMarkComplete()
      return
    }

    pipelineUpdateStage('scan', {
      status: 'done', progress: 100,
      total: sessions.length, done: sessions.length,
    })

    // STT 백그라운드 재시작 (sttEngine이 캐시를 체크하므로 중복 처리 없음)
    const sttItems = sessions
      .filter(s => s.callRecordId)
      .map(s => ({ sessionId: s.id, callRecordId: s.callRecordId! }))

    if (sttItems.length > 0) {
      pipelineUpdateStage('stt', {
        status: 'running', total: sttItems.length, done: 0, progress: 0,
      })
      setSttMode('on')
      startSttBackground(sttItems)
    }

    // PII + Label 재처리
    await updateProcessingTask(PIPELINE_TASK_ID, 2, 4, '민감정보 재검사 중')
    const afterPii = await runPiiForAll(sessions)
    await saveAllSessions(afterPii)

    await updateProcessingTask(PIPELINE_TASK_ID, 3, 4, '자동 라벨링 중')
    const afterLabel = await runLabelForAll(afterPii)
    await saveAllSessions(afterLabel)

    await updateProcessingTask(PIPELINE_TASK_ID, 4, 4, '메타데이터 정리 중')
    await runMetadataStage()

    pipelineUpdateStage('stt', { status: 'done', progress: 100 })
    pipelineMarkComplete()
  } catch (err) {
    console.error('[Pipeline] resume error:', err)
    markCurrentStageError()
  } finally {
    await unregisterProcessingTask(PIPELINE_TASK_ID)
  }
}

// ── STT 백그라운드 시작 (fire-and-forget) ───────────────────────────────────

function startSttBackground(
  sttItems: { sessionId: string; callRecordId: string }[],
) {
  // 비동기로 배치 enqueue — 파이프라인 진행을 블록하지 않음
  ;(async () => {
    try {
      for (let i = 0; i < sttItems.length; i += STT_BATCH_SIZE) {
        await enqueueTranscriptions(sttItems.slice(i, i + STT_BATCH_SIZE))
      }
      if (import.meta.env.DEV) console.log(`[Pipeline] STT ${sttItems.length}건 enqueue 완료 — 백그라운드 처리 중`)
    } catch (err) {
      console.error('[Pipeline] STT enqueue error:', err)
    }
  })()
}

// ── PII 일괄 처리 ────────────────────────────────────────────────────────────
// 제목 기반 PII 즉시 처리. 캐시된 트랜스크립트가 있으면 트랜스크립트 PII도 처리.

async function runPiiForAll(sessions: Session[]): Promise<Session[]> {
  const total = sessions.length
  pipelineUpdateStage('pii', { status: 'running', total, done: 0, progress: 0 })

  // 이미 캐시된 트랜스크립트 세션 ID 확인 (1회 벌크 로드)
  const cachedTranscripts = await loadAllTranscripts()
  const hasTranscriptIds = new Set(Object.keys(cachedTranscripts))

  const results: Session[] = []
  const autoPiiProtect = localStorage.getItem('uncounted_pii_auto_protect') === 'on'

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    const titleDetections = scanSessionPii(session)

    let transcriptDetections: SanitizeCacheEntry['transcriptPiiDetections'] = []
    let hasTranscript = false

    // 캐시된 트랜스크립트가 있는 세션만 트랜스크립트 PII 처리
    if (hasTranscriptIds.has(session.id)) {
      try {
        const transcript = await loadTranscriptFull(session.id)
        if (transcript?.text) {
          hasTranscript = true
          transcriptDetections = scanTranscriptPii(
            transcript.text, session.duration, transcript.words,
          )
        }
      } catch { /* 무시 */ }
    }

    const isLocked = transcriptDetections.some(td =>
      td.detections.some(d => d.confidence >= 0.7),
    )

    const entry: SanitizeCacheEntry = {
      sessionId: session.id,
      textPreview: null,
      piiDetections: titleDetections,
      transcriptPiiDetections: transcriptDetections,
      isLocked,
      hash: sessionHash(session, hasTranscript),
      createdAt: new Date().toISOString(),
    }
    await saveSanitizeCacheEntry(entry)

    let updated = applySanitizeResult(session, entry)
    if (
      updated.piiStatus === 'LOCKED' &&
      !updated.reviewAction &&
      autoPiiProtect
    ) {
      updated.piiStatus = 'REVIEWED'
      updated.reviewAction = 'MASK_TEXT_ONLY'
      updated.eligibleForShare = true
    }

    results.push(updated)

    // 진행률 (50건마다)
    if ((i + 1) % 50 === 0 || i === total - 1) {
      pipelineUpdateStage('pii', {
        done: i + 1,
        progress: Math.round(((i + 1) / total) * 100),
      })
    }

    // UI 양보 (200건마다)
    if ((i + 1) % 200 === 0) {
      await new Promise(r => setTimeout(r, 0))
    }
  }

  pipelineUpdateStage('pii', { status: 'done', progress: 100, done: total })
  return results
}

// ── Label 일괄 처리 ──────────────────────────────────────────────────────────

async function runLabelForAll(sessions: Session[]): Promise<Session[]> {
  const total = sessions.length
  const autoLabelEnabled = localStorage.getItem('uncounted_auto_label') !== 'off'

  if (!autoLabelEnabled) {
    pipelineUpdateStage('label', { status: 'done', progress: 100, total, done: total })
    return sessions
  }

  pipelineUpdateStage('label', { status: 'running', total, done: 0, progress: 0 })

  const groupRels: Record<string, string> = JSON.parse(
    localStorage.getItem('uncounted_group_rels') ?? '{}',
  )

  const LABEL_BATCH = 200
  const results = [...sessions]
  const cancelToken = { current: false }

  for (let i = 0; i < sessions.length; i += LABEL_BATCH) {
    const batch = results.slice(i, i + LABEL_BATCH)
    const { results: labelResults } = await batchAutoLabel(
      batch, groupRels, () => {}, cancelToken,
    )

    for (let j = 0; j < batch.length; j++) {
      const r = labelResults.get(batch[j].id)
      if (r) {
        results[i + j] = applyAutoLabelToSession(results[i + j], r)
      }
    }

    const done = Math.min(i + LABEL_BATCH, total)
    pipelineUpdateStage('label', {
      done,
      progress: Math.round((done / total) * 100),
    })

    // UI 양보
    await new Promise(r => setTimeout(r, 0))
  }

  // 자동 라벨 결과의 relationship을 uncounted_group_rels에 동기화
  // (수동 설정이 없는 연락처만 — 수동 우선)
  const updatedRels = { ...groupRels }
  let relsChanged = false
  for (const s of results) {
    if (!s.labels?.relationship) continue
    const contactName = extractContactName(s.title)
    if (contactName === '알 수 없음' || updatedRels[contactName]) continue
    updatedRels[contactName] = s.labels.relationship
    relsChanged = true
  }
  if (relsChanged) {
    try { localStorage.setItem('uncounted_group_rels', JSON.stringify(updatedRels)) } catch { /* ignore */ }
  }

  pipelineUpdateStage('label', { status: 'done', progress: 100, done: total })
  return results
}

// ── Stage 5: 메타데이터 파생 ────────────────────────────────────────────────

async function runMetadataStage(): Promise<void> {
  const finalSessions = await loadAllSessions()
  try {
    const meta = refreshDerivedMetadata(finalSessions)
    if (import.meta.env.DEV) console.log(`[Pipeline] metadata derived: M06=${meta.m06Count}, M07=${meta.m07Count}`)
  } catch (metaErr) {
    console.warn('[Pipeline] metadata derivation failed:', metaErr)
  }
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function markCurrentStageError() {
  const stages: PipelineStage[] = ['stt', 'pii', 'label']
  for (const s of stages) {
    const snap = getPipelineSnapshot()
    if (snap[s].status === 'running') {
      pipelineUpdateStage(s, { status: 'error' })
      break
    }
  }
}
