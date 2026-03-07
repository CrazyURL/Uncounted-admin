import { type ExportFieldDef, type ExportFieldGroup, type ExportFieldSelection } from '../types/dataset'
import { type SkuId } from '../types/sku'

// ── 필드 그룹 한글명 ────────────────────────────────────────────────────────────

export const FIELD_GROUP_LABELS: Record<ExportFieldGroup, string> = {
  core: '기본 정보',
  quality: '품질',
  labels: '라벨',
  consent: '동의/공개',
  privacy: 'PII/비식별',
  audio: '오디오 참조',
  speaker: '화자 프로필',
  sku: 'SKU',
  metadata: '메타데이터',
}

// ── 전체 필드 카탈로그 ──────────────────────────────────────────────────────────

export const EXPORT_FIELD_CATALOG: ExportFieldDef[] = [
  // Core
  { key: 'id', labelKo: 'ID', group: 'core', defaultOn: true },
  { key: 'title', labelKo: '제목', group: 'core', defaultOn: true },
  { key: 'date', labelKo: '날짜', group: 'core', defaultOn: true },
  { key: 'duration', labelKo: '시간(초)', group: 'core', defaultOn: true },
  { key: 'durationFormatted', labelKo: '시간', group: 'core', defaultOn: false },
  { key: 'userId', labelKo: '사용자ID', group: 'core', defaultOn: true },
  { key: 'peerId', labelKo: '상대방ID', group: 'core', defaultOn: false },
  // Quality
  { key: 'qaScore', labelKo: 'QA점수', group: 'quality', defaultOn: true },
  { key: 'qualityGrade', labelKo: '등급', group: 'quality', defaultOn: true },
  // Labels
  { key: 'labels.relationship', labelKo: '라벨_관계', group: 'labels', defaultOn: true },
  { key: 'labels.purpose', labelKo: '라벨_목적', group: 'labels', defaultOn: true },
  { key: 'labels.domain', labelKo: '라벨_도메인', group: 'labels', defaultOn: true },
  { key: 'labels.tone', labelKo: '라벨_톤', group: 'labels', defaultOn: true },
  { key: 'labels.noise', labelKo: '라벨_소음', group: 'labels', defaultOn: true },
  { key: 'labelStatus', labelKo: '라벨상태', group: 'labels', defaultOn: false },
  // Consent
  { key: 'visibilityStatus', labelKo: '공개상태', group: 'consent', defaultOn: true },
  { key: 'consentVersion', labelKo: '동의버전', group: 'consent', defaultOn: true },
  { key: 'shareScope', labelKo: '공유범위', group: 'consent', defaultOn: false },
  // Privacy
  { key: 'isPiiCleaned', labelKo: 'PII처리', group: 'privacy', defaultOn: true },
  { key: 'piiStatus', labelKo: 'PII상태', group: 'privacy', defaultOn: false },
  { key: 'uploadStatus', labelKo: '업로드상태', group: 'privacy', defaultOn: true },
  // Audio
  { key: 'audioFilePath', labelKo: '오디오경로', group: 'audio', defaultOn: true },
  { key: 'audioUrl', labelKo: '오디오URL', group: 'audio', defaultOn: true },
  { key: 'sanitizedWavPath', labelKo: '정제WAV경로', group: 'audio', defaultOn: false },
  { key: 'chunkCount', labelKo: '청크수', group: 'audio', defaultOn: false },
  // Speaker
  { key: 'speaker.ageBand', labelKo: '화자_연령대', group: 'speaker', defaultOn: false },
  { key: 'speaker.gender', labelKo: '화자_성별', group: 'speaker', defaultOn: false },
  { key: 'speaker.region', labelKo: '화자_지역', group: 'speaker', defaultOn: false },
  { key: 'speaker.accent', labelKo: '화자_사투리', group: 'speaker', defaultOn: false },
  { key: 'speaker.speechStyle', labelKo: '화자_말투', group: 'speaker', defaultOn: false },
  { key: 'speaker.language', labelKo: '화자_언어', group: 'speaker', defaultOn: false },
  { key: 'speaker.env', labelKo: '화자_환경', group: 'speaker', defaultOn: false },
  { key: 'speaker.deviceMode', labelKo: '화자_기기모드', group: 'speaker', defaultOn: false },
  { key: 'speaker.domainMix', labelKo: '화자_도메인믹스', group: 'speaker', defaultOn: false },
  // SKU
  { key: 'eligibleSkus', labelKo: '적합SKU', group: 'sku', defaultOn: true },
  // Metadata — U-M05 기기/환경 버킷
  { key: 'meta.m05.dateBucket', labelKo: 'M05_날짜버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m05.timeBucket', labelKo: 'M05_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m05.deviceBucket', labelKo: 'M05_기기버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m05.batteryLevelBucket', labelKo: 'M05_배터리', group: 'metadata', defaultOn: false },
  { key: 'meta.m05.screenTimeBucket', labelKo: 'M05_화면시간', group: 'metadata', defaultOn: false },
  // Metadata — U-M06 음성 환경 프로필
  { key: 'meta.m06.snrBucket', labelKo: 'M06_SNR', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.noiseLevelBucket', labelKo: 'M06_소음레벨', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.environmentEstimate', labelKo: 'M06_환경추정', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.speechDensityBucket', labelKo: 'M06_발화밀도', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.clippingBucket', labelKo: 'M06_클리핑', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.sampleRate', labelKo: 'M06_샘플레이트', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.channels', labelKo: 'M06_채널', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.durationBucket', labelKo: 'M06_길이버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m06.qualityGrade', labelKo: 'M06_품질등급', group: 'metadata', defaultOn: false },
  // Metadata — U-M07 통화 시간 패턴
  { key: 'meta.m07.dayOfWeek', labelKo: 'M07_요일', group: 'metadata', defaultOn: false },
  { key: 'meta.m07.timeBucket', labelKo: 'M07_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m07.callFrequencyBucket', labelKo: 'M07_통화빈도', group: 'metadata', defaultOn: false },
  { key: 'meta.m07.avgDurationBucket', labelKo: 'M07_평균길이', group: 'metadata', defaultOn: false },
  { key: 'meta.m07.incomingRatio', labelKo: 'M07_수신비율', group: 'metadata', defaultOn: false },
  // Metadata — U-M08 화면 세션 패턴
  { key: 'meta.m08.timeBucket', labelKo: 'M08_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m08.sessionCount', labelKo: 'M08_세션수', group: 'metadata', defaultOn: false },
  { key: 'meta.m08.frequencyBucket', labelKo: 'M08_빈도', group: 'metadata', defaultOn: false },
  { key: 'meta.m08.avgLengthBucket', labelKo: 'M08_평균길이', group: 'metadata', defaultOn: false },
  { key: 'meta.m08.totalMinutes', labelKo: 'M08_총시간(분)', group: 'metadata', defaultOn: false },
  // Metadata — U-M09 충전/배터리 사이클
  { key: 'meta.m09.timeBucket', labelKo: 'M09_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m09.eventType', labelKo: 'M09_이벤트', group: 'metadata', defaultOn: false },
  { key: 'meta.m09.batteryLevelBucket', labelKo: 'M09_배터리', group: 'metadata', defaultOn: false },
  { key: 'meta.m09.chargingSpeedBucket', labelKo: 'M09_충전속도', group: 'metadata', defaultOn: false },
  { key: 'meta.m09.chargingDurationBucket', labelKo: 'M09_충전시간', group: 'metadata', defaultOn: false },
  // Metadata — U-M10 네트워크 전환
  { key: 'meta.m10.timeBucket', labelKo: 'M10_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m10.fromNetwork', labelKo: 'M10_이전네트워크', group: 'metadata', defaultOn: false },
  { key: 'meta.m10.toNetwork', labelKo: 'M10_현재네트워크', group: 'metadata', defaultOn: false },
  { key: 'meta.m10.transitionCount', labelKo: 'M10_전환횟수', group: 'metadata', defaultOn: false },
  { key: 'meta.m10.dominantNetwork', labelKo: 'M10_주네트워크', group: 'metadata', defaultOn: false },
  // Metadata — 공통 필드
  { key: 'meta.pseudoId', labelKo: '메타_익명ID', group: 'metadata', defaultOn: false },
  { key: 'meta.dateBucket', labelKo: '메타_날짜버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.schema', labelKo: '메타_스키마', group: 'metadata', defaultOn: false },
  // Context Layer — U-A01 device_context (M05+M09+M10 at BU granularity)
  { key: 'ctx.deviceContext.networkType', labelKo: 'CTX_네트워크', group: 'metadata', defaultOn: false },
  { key: 'ctx.deviceContext.batteryLevel', labelKo: 'CTX_배터리', group: 'metadata', defaultOn: false },
  { key: 'ctx.deviceContext.isCharging', labelKo: 'CTX_충전중', group: 'metadata', defaultOn: false },
  { key: 'ctx.deviceContext.screenActive', labelKo: 'CTX_화면상태', group: 'metadata', defaultOn: false },
  // Context Layer — U-A02 session_context (M06+M07+M08 label consistency)
  { key: 'ctx.sessionContext.snrBucket', labelKo: 'CTX_SNR', group: 'metadata', defaultOn: false },
  { key: 'ctx.sessionContext.environmentEstimate', labelKo: 'CTX_환경추정', group: 'metadata', defaultOn: false },
  { key: 'ctx.sessionContext.speechDensityBucket', labelKo: 'CTX_발화밀도', group: 'metadata', defaultOn: false },
  { key: 'ctx.sessionContext.callFrequencyBucket', labelKo: 'CTX_통화빈도', group: 'metadata', defaultOn: false },
  { key: 'ctx.sessionContext.screenFrequencyBucket', labelKo: 'CTX_화면빈도', group: 'metadata', defaultOn: false },
  // Context Layer — U-A03 behavior_profile (Self-Report + trust, Phase 2)
  { key: 'ctx.behaviorProfile.typingBucket', labelKo: 'CTX_입력량', group: 'metadata', defaultOn: false },
  { key: 'ctx.behaviorProfile.gestureBucket', labelKo: 'CTX_터치량', group: 'metadata', defaultOn: false },
  { key: 'ctx.behaviorProfile.verificationLevel', labelKo: 'CTX_검증수준', group: 'metadata', defaultOn: false },
  // Metadata — U-M11 활동 상태 버킷
  { key: 'meta.m11.timeBucket', labelKo: 'M11_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m11.dominantActivity', labelKo: 'M11_주활동', group: 'metadata', defaultOn: false },
  { key: 'meta.m11.activityDistribution', labelKo: 'M11_활동분포', group: 'metadata', defaultOn: false },
  { key: 'meta.m11.transitionCount', labelKo: 'M11_전환횟수', group: 'metadata', defaultOn: false },
  { key: 'meta.m11.totalActiveMinutes', labelKo: 'M11_활동시간(분)', group: 'metadata', defaultOn: false },
  // Metadata — U-M13 주변 조도 패턴
  { key: 'meta.m13.timeBucket', labelKo: 'M13_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m13.avgBrightnessBucket', labelKo: 'M13_평균밝기', group: 'metadata', defaultOn: false },
  { key: 'meta.m13.minBrightnessBucket', labelKo: 'M13_최소밝기', group: 'metadata', defaultOn: false },
  { key: 'meta.m13.maxBrightnessBucket', labelKo: 'M13_최대밝기', group: 'metadata', defaultOn: false },
  { key: 'meta.m13.environmentEstimate', labelKo: 'M13_환경추정', group: 'metadata', defaultOn: false },
  { key: 'meta.m13.transitionCount', labelKo: 'M13_전환횟수', group: 'metadata', defaultOn: false },
  // Metadata — U-M14 디바이스 모션 프로필
  { key: 'meta.m14.timeBucket', labelKo: 'M14_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m14.avgIntensityBucket', labelKo: 'M14_평균강도', group: 'metadata', defaultOn: false },
  { key: 'meta.m14.peakIntensityBucket', labelKo: 'M14_최대강도', group: 'metadata', defaultOn: false },
  { key: 'meta.m14.dominantOrientation', labelKo: 'M14_주방향', group: 'metadata', defaultOn: false },
  { key: 'meta.m14.shakeCount', labelKo: 'M14_흔들림수', group: 'metadata', defaultOn: false },
  { key: 'meta.m14.stepEstimate', labelKo: 'M14_걸음추정', group: 'metadata', defaultOn: false },
  // Metadata — U-M16 앱 설치/삭제 이벤트
  { key: 'meta.m16.timeBucket', labelKo: 'M16_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m16.eventType', labelKo: 'M16_이벤트', group: 'metadata', defaultOn: false },
  { key: 'meta.m16.appCategory', labelKo: 'M16_앱카테고리', group: 'metadata', defaultOn: false },
  { key: 'meta.m16.retentionBucket', labelKo: 'M16_유지기간', group: 'metadata', defaultOn: false },
  // Metadata — U-M18 미디어 재생 패턴
  { key: 'meta.m18.timeBucket', labelKo: 'M18_시간버킷', group: 'metadata', defaultOn: false },
  { key: 'meta.m18.mediaCategory', labelKo: 'M18_미디어유형', group: 'metadata', defaultOn: false },
  { key: 'meta.m18.totalMinutes', labelKo: 'M18_총시간(분)', group: 'metadata', defaultOn: false },
  { key: 'meta.m18.playbackSpeedBucket', labelKo: 'M18_재생속도', group: 'metadata', defaultOn: false },
  { key: 'meta.m18.skipCount', labelKo: 'M18_스킵수', group: 'metadata', defaultOn: false },
  { key: 'meta.m18.pauseCount', labelKo: 'M18_일시정지수', group: 'metadata', defaultOn: false },
]

// ── SKU별 프리셋 필드 ───────────────────────────────────────────────────────────

export const SKU_FIELD_PRESETS: Partial<Record<SkuId, string[]>> = {
  'U-A01': [
    'id', 'date', 'duration', 'userId',
    'qaScore', 'qualityGrade',
    'visibilityStatus', 'consentVersion',
    'isPiiCleaned', 'uploadStatus',
    'audioFilePath', 'audioUrl', 'sanitizedWavPath',
    'eligibleSkus',
    // context_layer: device_context (M05+M09+M10 at BU granularity)
    'ctx.deviceContext.networkType', 'ctx.deviceContext.batteryLevel',
    'ctx.deviceContext.isCharging', 'ctx.deviceContext.screenActive',
  ],
  'U-A02': [
    'id', 'date', 'duration', 'userId',
    'qaScore', 'qualityGrade',
    'labels.relationship', 'labels.purpose', 'labels.domain', 'labels.tone', 'labels.noise',
    'labelStatus',
    'visibilityStatus', 'consentVersion',
    'isPiiCleaned', 'uploadStatus',
    'audioFilePath', 'audioUrl', 'sanitizedWavPath',
    'eligibleSkus',
    // context_layer: session_context (M06+M07+M08 label consistency)
    'ctx.sessionContext.snrBucket', 'ctx.sessionContext.environmentEstimate',
    'ctx.sessionContext.speechDensityBucket',
    'ctx.sessionContext.callFrequencyBucket', 'ctx.sessionContext.screenFrequencyBucket',
  ],
  'U-A03': [
    'id', 'date', 'duration', 'userId',
    'qaScore', 'qualityGrade',
    'labels.relationship', 'labels.purpose', 'labels.domain', 'labels.tone', 'labels.noise',
    'labelStatus',
    'visibilityStatus', 'consentVersion',
    'isPiiCleaned', 'uploadStatus',
    'audioFilePath', 'audioUrl', 'sanitizedWavPath',
    'eligibleSkus',
    // context_layer: behavior_profile (Self-Report + trust cross-validation, Phase 2)
    'ctx.behaviorProfile.typingBucket', 'ctx.behaviorProfile.gestureBucket',
    'ctx.behaviorProfile.verificationLevel',
  ],
  'U-M01': [
    'id', 'date', 'duration', 'userId',
    'qaScore', 'qualityGrade',
    'visibilityStatus', 'consentVersion',
    'isPiiCleaned',
    'eligibleSkus',
  ],
  'U-M05': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m05.dateBucket', 'meta.m05.timeBucket',
    'meta.m05.deviceBucket', 'meta.m05.batteryLevelBucket', 'meta.m05.screenTimeBucket',
  ],
  'U-M06': [
    'id', 'date', 'duration', 'userId',
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m06.snrBucket', 'meta.m06.noiseLevelBucket', 'meta.m06.environmentEstimate',
    'meta.m06.speechDensityBucket', 'meta.m06.clippingBucket',
    'meta.m06.sampleRate', 'meta.m06.channels', 'meta.m06.durationBucket', 'meta.m06.qualityGrade',
  ],
  'U-M07': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m07.dayOfWeek', 'meta.m07.timeBucket',
    'meta.m07.callFrequencyBucket', 'meta.m07.avgDurationBucket', 'meta.m07.incomingRatio',
  ],
  'U-M08': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m08.timeBucket', 'meta.m08.sessionCount', 'meta.m08.frequencyBucket',
    'meta.m08.avgLengthBucket', 'meta.m08.totalMinutes',
  ],
  'U-M09': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m09.timeBucket', 'meta.m09.eventType',
    'meta.m09.batteryLevelBucket', 'meta.m09.chargingSpeedBucket', 'meta.m09.chargingDurationBucket',
  ],
  'U-M10': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m10.timeBucket', 'meta.m10.fromNetwork', 'meta.m10.toNetwork',
    'meta.m10.transitionCount', 'meta.m10.dominantNetwork',
  ],
  'U-M11': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m11.timeBucket', 'meta.m11.dominantActivity', 'meta.m11.activityDistribution',
    'meta.m11.transitionCount', 'meta.m11.totalActiveMinutes',
  ],
  'U-M13': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m13.timeBucket', 'meta.m13.avgBrightnessBucket',
    'meta.m13.minBrightnessBucket', 'meta.m13.maxBrightnessBucket',
    'meta.m13.environmentEstimate', 'meta.m13.transitionCount',
  ],
  'U-M14': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m14.timeBucket', 'meta.m14.avgIntensityBucket', 'meta.m14.peakIntensityBucket',
    'meta.m14.dominantOrientation', 'meta.m14.shakeCount', 'meta.m14.stepEstimate',
  ],
  'U-M16': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m16.timeBucket', 'meta.m16.eventType',
    'meta.m16.appCategory', 'meta.m16.retentionBucket',
  ],
  'U-M18': [
    'meta.pseudoId', 'meta.dateBucket', 'meta.schema',
    'meta.m18.timeBucket', 'meta.m18.mediaCategory', 'meta.m18.totalMinutes',
    'meta.m18.playbackSpeedBucket', 'meta.m18.skipCount', 'meta.m18.pauseCount',
  ],
}

// ── 필드 셋 해석 ────────────────────────────────────────────────────────────────

/** ExportFieldSelection → 포함할 필드 키 Set */
export function resolveExportFields(selection: ExportFieldSelection): Set<string> {
  switch (selection.mode) {
    case 'all':
      return new Set(EXPORT_FIELD_CATALOG.map(f => f.key))
    case 'preset': {
      const preset = selection.presetSkuId ? SKU_FIELD_PRESETS[selection.presetSkuId] : undefined
      return new Set(preset ?? EXPORT_FIELD_CATALOG.filter(f => f.defaultOn).map(f => f.key))
    }
    case 'custom':
      return new Set(selection.selectedKeys)
  }
}

/** 기본 필드 선택 (mode=all) */
export function getDefaultFieldSelection(): ExportFieldSelection {
  return {
    mode: 'all',
    selectedKeys: EXPORT_FIELD_CATALOG.map(f => f.key),
  }
}

/** 필드가 특정 그룹에 포함되는지 확인 */
export function isFieldInGroup(fieldKey: string, group: string): boolean {
  const field = EXPORT_FIELD_CATALOG.find(f => f.key === fieldKey)
  return field?.group === group
}
