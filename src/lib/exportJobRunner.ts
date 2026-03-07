import { type ExportJob, type ExportJobLog } from '../types/admin'
import { getExportJob, saveExportJob, appendJobLog } from './adminStore'

function makeLog(level: ExportJobLog['level'], message: string): ExportJobLog {
  return { timestamp: new Date().toISOString(), level, message }
}

/**
 * v1 Export Job Runner
 * - selection manifest 저장까지가 범위
 * - 실제 파일 생성은 기존 export 함수 재사용 (향후)
 */
export async function runExportJob(jobId: string): Promise<ExportJob> {
  const job = await getExportJob(jobId)
  if (!job) throw new Error(`Job not found: ${jobId}`)

  // status → running
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  await saveExportJob(job)
  await appendJobLog(jobId, makeLog('info', '작업 시작'))

  try {
    // v1: manifest는 이미 Build Wizard에서 저장됨
    if (!job.selectionManifest || job.selectionManifest.length === 0) {
      throw new Error('선택 매니페스트가 비어있습니다')
    }

    job.actualUnits = job.selectionManifest.length
    await appendJobLog(jobId, makeLog('info', `${job.actualUnits.toLocaleString()}개 유닛 확인`))

    // v1: 실제 파일 생성은 향후 구현
    // 기존 exportAsJson/Jsonl/Csv + downloadBlob 재사용 예정
    await appendJobLog(jobId, makeLog('info', '매니페스트 저장 완료 (v1 범위)'))

    job.status = 'completed'
    job.completedAt = new Date().toISOString()
    await saveExportJob(job)
    await appendJobLog(jobId, makeLog('info', '작업 완료'))

    return job
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    job.status = 'failed'
    job.errorMessage = msg
    job.completedAt = new Date().toISOString()
    await saveExportJob(job)
    await appendJobLog(jobId, makeLog('error', `실패: ${msg}`))

    return job
  }
}
