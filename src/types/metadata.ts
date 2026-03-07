// ── 메타데이터 수집 타입 (내용 없음 원칙) ────────────────────────────────────
// U-M01 (통화/통신), U-M02 (앱 카테고리), U-M05 (기기/환경)
// 절대 제약: 연락처명/전화번호/텍스트/앱명/정밀 위치/정밀 타임스탬프 저장 금지

import { type TimeBucket2h, type DeviceBucket } from './audioAsset'

// ── 공통 버킷 타입 ────────────────────────────────────────────────────────────

export type DateMonthBucket = string   // 'YYYY-MM' (월 버킷)
export type DateDayBucket = string     // 'YYYY-MM-DD' (일 버킷)

// ── U-M01: 통화/통신 메타데이터 ───────────────────────────────────────────────
// Android: READ_CALL_LOG 권한  | iOS: 제한적 (자기보고 대체)
// 저장 금지: 상대방 번호/이름, 정밀 시각, 통화 내용

export type CallTypeBucket = 'incoming' | 'outgoing' | 'missed' | 'rejected'

export type CallDurationBucket =
  | 'under_30s'   // < 30초
  | '30s_3m'      // 30초 ~ 3분
  | '3m_15m'      // 3분 ~ 15분
  | '15m_60m'     // 15분 ~ 1시간
  | 'over_60m'    // 1시간 초과

export type CallMetaRecord = {
  schema: 'U-M01-v1'
  pseudoId: string
  dateBucket: DateMonthBucket          // 'YYYY-MM' (월 버킷)
  timeBucket: TimeBucket2h
  callType: CallTypeBucket
  durationBucket: CallDurationBucket
  count: number                        // 해당 버킷 내 건수 집계
  // ❌ 금지: 상대방 번호, 이름, 정밀 시각, 내용
}

// ── U-M02: 앱 카테고리 시퀀스 ─────────────────────────────────────────────────
// Android: PACKAGE_USAGE_STATS (특수 권한 필요) | iOS: 불가
// 정책: 앱명 저장 금지. 카테고리만 기록.

export type AppCategory =
  | 'social'          // SNS, 커뮤니티
  | 'communication'   // 문자, 이메일, 채팅
  | 'finance'         // 은행, 주식, 페이
  | 'health'          // 헬스, 의료, 수면
  | 'entertainment'   // 동영상, 음악, 팟캐스트
  | 'productivity'    // 문서, 메모, 캘린더
  | 'education'       // 어학, 학습, 뉴스
  | 'shopping'        // 쇼핑, 배달, 커머스
  | 'travel'          // 지도, 교통, 숙박
  | 'games'           // 게임
  | 'tools'           // 설정, 유틸리티
  | 'other'           // 분류 불가

export type TransitionDurationBucket = 'short' | 'med' | 'long'  // <5m, 5-30m, >30m

export type AppCategoryEvent = {
  schema: 'U-M02-v1'
  pseudoId: string
  dateBucket: DateMonthBucket
  timeBucket: TimeBucket2h
  fromCategory: AppCategory
  toCategory: AppCategory
  transitionBucket: TransitionDurationBucket  // 전환 전 앱 체류 시간
  sessionDurationBucket: TransitionDurationBucket  // 전환 후 앱 체류 시간
  // ❌ 금지: 앱명, 패키지명
}

// ── U-M05: 기기/환경 버킷 ─────────────────────────────────────────────────────
// Android: ACCESS_NETWORK_STATE, BATTERY_STATS | iOS: 제한적
// 저장 금지: GPS 좌표, 셀 ID, Wi-Fi SSID, 세밀한 위치

export type BatteryLevelBucket = 'high' | 'medium' | 'low'  // >60%, 20-60%, <20%

export type ScreenTimeBucket =
  | 'active'    // >4h/day
  | 'moderate'  // 2-4h/day
  | 'light'     // <2h/day

export type DeviceContextRecord = {
  schema: 'U-M05-v1'
  pseudoId: string
  dateBucket: DateDayBucket            // 'YYYY-MM-DD' (일 버킷)
  timeBucket: TimeBucket2h
  deviceBucket: DeviceBucket
  batteryLevelBucket: BatteryLevelBucket
  screenTimeBucket: ScreenTimeBucket
  // ❌ 금지: GPS 좌표, 셀 ID, Wi-Fi SSID, 정밀 위치
}

// ── U-M03 / U-M04: 자기보고 대체 (자동 수집 정책 불가) ───────────────────────
// 자동 수집: Android 접근성/키로거 → 정책 제한 High
// 대체: 일일 10초 자기보고 (옵션 OFF 기본)

export type SelfReportTypingBucket =
  | 'none'      // 거의 안 씀
  | 'light'     // < 30분
  | 'moderate'  // 30분 ~ 2시간
  | 'heavy'     // > 2시간

export type SelfReportGestureBucket =
  | 'minimal'   // 기본 탐색만
  | 'normal'    // 평균 수준
  | 'intensive' // 활발한 터치

export type SelfReportRecord = {
  schema: 'self-report-v1'
  pseudoId: string
  dateBucket: DateDayBucket            // 'YYYY-MM-DD'
  typingAmountBucket: SelfReportTypingBucket
  gestureBucket: SelfReportGestureBucket
  reportedAt: DateDayBucket            // 제출 날짜 (정밀 시각 금지)
}

// ── U-M06: 음성 환경 프로필 ──────────────────────────────────────────────────
// 기존 오디오 DSP 분석(audioAnalyzer.ts)에서 파생
// GPU 추론 금지 — 규칙 기반 버킷만
// 음성 내용과 무관한 환경/품질 특성만 기록

export type SnrBucket = 'clean' | 'moderate' | 'noisy'          // >25dB / 15-25dB / <15dB
export type NoiseLevelBucket = 'quiet' | 'moderate' | 'loud'    // RMS 기반
export type EnvironmentEstimate =
  | 'quiet_indoor'      // 높은 SNR + 낮은 무음 비율
  | 'moderate_indoor'   // 중간 SNR
  | 'outdoor'           // 낮은 SNR + 높은 배경 잡음
  | 'noisy'             // 매우 낮은 SNR, 클리핑 있음
export type SpeechDensityBucket = 'sparse' | 'normal' | 'dense' // validSpeechRatio 기반
export type ClippingBucket = 'none' | 'light' | 'heavy'         // clippingRatio 기반

export type AudioEnvironmentRecord = {
  schema: 'U-M06-v1'
  sessionId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  snrBucket: SnrBucket
  noiseLevelBucket: NoiseLevelBucket
  environmentEstimate: EnvironmentEstimate
  speechDensityBucket: SpeechDensityBucket
  clippingBucket: ClippingBucket
  sampleRate: number           // Hz (8000/16000/44100 등)
  channels: number             // 1=mono, 2=stereo
  durationBucket: CallDurationBucket  // 재사용: 녹음 길이 버킷
  qualityGrade: 'A' | 'B' | 'C'
  // ❌ 금지: 음성 내용, 화자 정보, 전사문, 위치
}

// ── U-M07: 통화 시간 패턴 ───────────────────────────────────────────────────
// U-M01 재가공: 요일/시간대별 통화 빈도 히트맵, 평균 길이 버킷
// Android: READ_CALL_LOG 파생 | iOS: 자기보고
// 저장 금지: 상대방 정보, 정밀 시각

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type CallFrequencyBucket = 'none' | 'low' | 'moderate' | 'high'  // 0 / 1-3 / 4-10 / 11+

export type CallTimePatternRecord = {
  schema: 'U-M07-v1'
  pseudoId: string
  dateBucket: DateMonthBucket          // 'YYYY-MM' 집계 기간
  dayOfWeek: DayOfWeek
  timeBucket: TimeBucket2h
  callFrequencyBucket: CallFrequencyBucket
  avgDurationBucket: CallDurationBucket  // 해당 슬롯 평균 통화 길이
  incomingRatio: number                // 0~1, 수신 비율
  // ❌ 금지: 상대방 번호/이름, 정밀 시각, 내용
}

// ── U-M08: 화면 세션 패턴 ───────────────────────────────────────────────────
// 화면 On/Off 이벤트 → 세션 길이/빈도 시간대 버킷 (내용 없음)
// Web: visibilitychange API | Android: Screen State broadcast
// 저장 금지: 화면 내용, 앱명

export type ScreenSessionLengthBucket =
  | 'glance'     // < 30초
  | 'short'      // 30초 ~ 5분
  | 'medium'     // 5분 ~ 30분
  | 'long'       // 30분 ~ 2시간
  | 'marathon'   // > 2시간

export type ScreenSessionFrequencyBucket = 'low' | 'moderate' | 'high' | 'very_high'
  // low: <10/day, moderate: 10-30, high: 30-80, very_high: 80+

export type ScreenSessionPatternRecord = {
  schema: 'U-M08-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  sessionCount: number                        // 해당 시간대 화면 세션 수
  frequencyBucket: ScreenSessionFrequencyBucket
  avgLengthBucket: ScreenSessionLengthBucket
  totalMinutes: number                        // 해당 시간대 총 화면 시간 (분)
  // ❌ 금지: 화면 내용, 앱명, 노출된 텍스트
}

// ── U-M09: 충전/배터리 사이클 ───────────────────────────────────────────────
// 충전 시작/종료 시간대 버킷, 충전 속도, 배터리 레벨 패턴
// Web: navigator.getBattery() | Android: ACTION_BATTERY_CHANGED
// 저장 금지: 위치

export type ChargingSpeedBucket = 'slow' | 'normal' | 'fast'  // <1%/min, 1-3%/min, >3%/min

export type ChargingEventType = 'start' | 'end'

export type BatteryChargingRecord = {
  schema: 'U-M09-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  eventType: ChargingEventType
  batteryLevelBucket: BatteryLevelBucket    // 이벤트 시점 배터리 레벨
  chargingSpeedBucket: ChargingSpeedBucket | null  // 충전 종료 시에만 계산
  chargingDurationBucket: CallDurationBucket | null // 충전 시간 버킷 (재사용)
  // ❌ 금지: 위치, 정밀 시각
}

// ── U-M10: 네트워크 전환 이벤트 ─────────────────────────────────────────────
// WiFi/모바일/오프라인 전환 빈도, 네트워크 타입 시간대 분포
// Web: navigator.connection + online/offline | Android: ConnectivityManager
// 저장 금지: SSID, IP, 셀 ID

export type NetworkType = 'wifi' | 'cellular' | 'offline'

export type NetworkTransitionRecord = {
  schema: 'U-M10-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  fromNetwork: NetworkType
  toNetwork: NetworkType
  transitionCount: number                   // 해당 시간대 전환 횟수
  dominantNetwork: NetworkType              // 해당 시간대 주 연결 타입
  // ❌ 금지: SSID, IP 주소, 셀 ID, APN
}

// ── U-M13: 주변 조도 패턴 ─────────────────────────────────────────────────
// 조도 센서 → 시간대별 밝기 버킷, 실내/실외 전환, 수면 패턴 추정
// Web: AmbientLightSensor (제한적) | Android: SensorManager TYPE_LIGHT
// 저장 금지: GPS, 카메라 이미지

export type BrightnessLevelBucket =
  | 'dark'         // < 10 lux (어두운 방, 수면)
  | 'dim'          // 10~50 lux (저조도 실내)
  | 'normal'       // 50~500 lux (일반 실내)
  | 'bright'       // 500~10000 lux (밝은 실내/그늘)
  | 'very_bright'  // > 10000 lux (직사광선)

export type LightEnvironmentEstimate = 'indoor_dark' | 'indoor_normal' | 'outdoor_shade' | 'outdoor_sun'

export type AmbientLightRecord = {
  schema: 'U-M13-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  avgBrightnessBucket: BrightnessLevelBucket
  minBrightnessBucket: BrightnessLevelBucket
  maxBrightnessBucket: BrightnessLevelBucket
  environmentEstimate: LightEnvironmentEstimate
  transitionCount: number              // 밝기 버킷 전환 횟수 (실내/실외 이동 추정)
  // ❌ 금지: GPS 좌표, 카메라 이미지, 정밀 시각
}

// ── U-M14: 디바이스 모션 프로필 ───────────────────────────────────────────────
// 가속도계/자이로 → 움직임 강도 버킷, 화면 각도 (위치 없음)
// Web: DeviceMotionEvent (표준) | Android: SensorManager
// 저장 금지: GPS 좌표, 정밀 경로

export type MovementIntensityBucket = 'still' | 'light' | 'moderate' | 'active'
  // still: <0.5 m/s², light: 0.5~2, moderate: 2~5, active: >5

export type DeviceOrientationBucket = 'flat' | 'tilted' | 'upright' | 'face_down'

export type DeviceMotionRecord = {
  schema: 'U-M14-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  avgIntensityBucket: MovementIntensityBucket
  peakIntensityBucket: MovementIntensityBucket
  dominantOrientation: DeviceOrientationBucket
  shakeCount: number                   // 강한 흔들림 이벤트 횟수
  stepEstimate: number | null          // 걸음 수 추정 (가속도 피크 카운팅, 정확도 낮음)
  // ❌ 금지: GPS 좌표, 이동 경로, 정밀 위치
}

// ── U-M16: 앱 설치/삭제 이벤트 ────────────────────────────────────────────────
// Android: PACKAGE_ADDED/REMOVED broadcast (Capacitor 네이티브 플러그인 필요)
// 앱명 저장 금지 — Play Store 카테고리만 기록
// 저장 금지: 패키지명, 앱명, 정밀 시각

export type AppLifecycleEventType = 'install' | 'uninstall' | 'update'

export type AppRetentionBucket =
  | 'flash'     // < 1일 (설치 후 즉시 삭제)
  | 'short'     // 1~7일
  | 'medium'    // 7~30일
  | 'long'      // 30~90일
  | 'retained'  // > 90일

export type AppLifecycleRecord = {
  schema: 'U-M16-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  eventType: AppLifecycleEventType
  appCategory: AppCategory               // Play Store 카테고리 (앱명 없음)
  retentionBucket: AppRetentionBucket | null  // 삭제 시에만: 설치~삭제 기간
  // ❌ 금지: 패키지명, 앱명, 정밀 시각
}

// ── U-M18: 미디어 재생 패턴 ──────────────────────────────────────────────────
// MediaSession/AudioFocus → 카테고리별 재생 시간 (앱명 없음)
// Web: MediaSession API (제한적) | Android: MediaController/AudioFocus
// 저장 금지: 앱명, 콘텐츠 제목, 아티스트

export type MediaCategory = 'music' | 'podcast' | 'video' | 'audiobook' | 'call' | 'other'

export type PlaybackSpeedBucket = 'slow' | 'normal' | 'fast'  // <0.9x, 0.9~1.1x, >1.1x

export type MediaPlaybackRecord = {
  schema: 'U-M18-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  mediaCategory: MediaCategory
  totalMinutes: number                   // 해당 시간대 재생 시간 (분)
  playbackSpeedBucket: PlaybackSpeedBucket
  skipCount: number                      // 건너뛰기 횟수
  pauseCount: number                     // 일시정지 횟수
  // ❌ 금지: 앱명, 콘텐츠 제목, 아티스트, URL
}

// ── U-M11: 활동 상태 버킷 ──────────────────────────────────────────────────
// Activity Recognition API (Android) → 정지/도보/차량 등 활동 유형
// Web: DeviceMotionEvent 기반 추정 (정확도 낮음, M14와 교차 검증)
// Android: Transition API (ACTIVITY_RECOGNITION 런타임 권한)
// 저장 금지: GPS 좌표, 이동 경로, 정밀 위치

export type ActivityType = 'still' | 'walking' | 'running' | 'cycling' | 'vehicle' | 'unknown'

export type ActivityStateRecord = {
  schema: 'U-M11-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  dominantActivity: ActivityType          // 해당 시간대 최빈 활동
  activityDistribution: Partial<Record<ActivityType, number>>  // 활동별 비율 (0~1, 합계=1)
  transitionCount: number                 // 활동 전환 횟수
  totalActiveMinutes: number | null       // still 제외 활동 시간 (분)
  // ❌ 금지: GPS 좌표, 이동 경로, 정밀 위치, 속도
}

// ── U-P01: 촬영 행동 패턴 ──────────────────────────────────────────────────
// Capacitor Filesystem readdir() → 파일 수/크기/확장자/수정일만 수집
// 저장 금지: 이미지 내용, EXIF GPS, 파일명(해시만 가능), 앱명
// Android: READ_MEDIA_IMAGES (13+) or READ_EXTERNAL_STORAGE (12-)

export type MediaFileBucket = 'photo' | 'video' | 'screenshot'

export type PhotoPatternRecord = {
  schema: 'U-P01-v1'
  pseudoId: string
  dateBucket: DateDayBucket
  timeBucket: TimeBucket2h
  photoCount: number                     // 해당 버킷 내 사진 수
  videoCount: number                     // 영상 수
  screenshotCount: number                // 스크린샷 수
  burstGroupCount: number                // 연속촬영 그룹 수 (≤2초 간격)
  selfCreatedRatio: number               // 0~1, DCIM/Camera 비율 (직접촬영 vs 다운로드)
  totalSizeMb: number                    // 해당 버킷 파일 총 MB
  // ❌ 금지: 이미지 내용, EXIF GPS, 파일명, OCR, 앱명
}

// ── 메타데이터 수집 동의 상태 ────────────────────────────────────────────────

export type MetadataConsentState = {
  um01Enabled: boolean   // 통화 메타
  um02Enabled: boolean   // 앱 카테고리
  um05Enabled: boolean   // 기기/환경
  um06Enabled: boolean   // 음성 환경 프로필
  um07Enabled: boolean   // 통화 시간 패턴
  um08Enabled: boolean   // 화면 세션 패턴
  um09Enabled: boolean   // 충전/배터리 사이클
  um10Enabled: boolean   // 네트워크 전환
  um11Enabled: boolean   // 활동 상태 버킷
  um13Enabled: boolean   // 주변 조도 패턴
  um14Enabled: boolean   // 디바이스 모션 프로필
  um16Enabled: boolean   // 앱 설치/삭제 이벤트
  um18Enabled: boolean   // 미디어 재생 패턴
  up01Enabled: boolean   // 촬영 행동 패턴
  selfReportEnabled: boolean  // 자기보고 (U-M03/M04 대체)
  consentGrantedAt: DateDayBucket | null
}

export const DEFAULT_METADATA_CONSENT: MetadataConsentState = {
  um01Enabled: false,
  um02Enabled: false,
  um05Enabled: false,
  um06Enabled: false,
  um07Enabled: false,
  um08Enabled: false,
  um09Enabled: false,
  um10Enabled: false,
  um11Enabled: false,
  um13Enabled: false,
  um14Enabled: false,
  um16Enabled: false,
  um18Enabled: false,
  up01Enabled: false,
  selfReportEnabled: false,
  consentGrantedAt: null,
}

export const METADATA_CONSENT_KEY = 'uncounted_metadata_consent'

// ── BehaviorProfile (U-A03 context_layer, Phase 2 prep) ────────────────────
// Self-Report + labelTrust 교차 검증 → 음성 SKU 강화 레이어
// Phase 1: basic (Self-Report only)
// Phase 2: verified (M08/M09/M10 교차 검증 후 CBT 데이터로 신뢰도 확인)
// UI: 일일 자기보고 (per-session이 아닌 daily)
//
// ⚠️ 본 서비스는 타 앱의 입력 이벤트, 화면 내용, 키 입력 텍스트를 수집하지 않습니다.
// AccessibilityService/IME 권한을 통한 자동 수집은 영구 차단됩니다.

export type BehaviorVerificationLevel = 'basic' | 'verified'

export type BehaviorProfile = {
  schema: 'behavior-profile-v1'
  pseudoId: string
  dateBucket: DateDayBucket                         // 프로필 생성일
  // Self-Report 원본 (SelfReportRecord에서 복사)
  typingAmountBucket: SelfReportTypingBucket
  gestureBucket: SelfReportGestureBucket
  // 교차 검증 결과 (Phase 2)
  verificationLevel: BehaviorVerificationLevel
  crossValidation: {
    m08Consistent: boolean | null    // 화면 세션 패턴과 일치 여부
    m09Consistent: boolean | null    // 배터리 사이클과 일치 여부
    m10Consistent: boolean | null    // 네트워크 전환과 일치 여부
  }
  // labelTrust 연동 (Phase 2)
  trustScore: number | null          // 0~1, Self-Report 신뢰도
  userReliabilityTier: 'A' | 'B' | 'C' | null
  // ❌ 금지: 원시 키 입력, 터치 좌표, 앱명, 화면 내용
}

export const BEHAVIOR_PROFILE_KEY = 'uncounted_behavior_profiles'
