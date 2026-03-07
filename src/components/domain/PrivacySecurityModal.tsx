import Modal from '../common/Modal'

type SectionProps = {
  icon: string
  title: string
  children: React.ReactNode
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-base" style={{ color: 'var(--color-accent)' }}>{icon}</span>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{title}</h3>
      </div>
      <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
        {children}
      </div>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 last:border-b-0 last:pb-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className="material-symbols-outlined text-sm mt-0.5 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
        fiber_manual_record
      </span>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>{children}</p>
    </div>
  )
}

type PrivacySecurityModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function PrivacySecurityModal({ isOpen, onClose }: PrivacySecurityModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="개인정보 및 보안">
      {/* 1. 수집하는 데이터 — 음성 */}
      <Section icon="mic" title="수집하는 음성 데이터">
        <Bullet>익명화 음성 원천 (U-A01) — 비식별 처리된 원시 음성 파일</Bullet>
        <Bullet>음성 + 상황 라벨 (U-A02) — 사용자가 직접 태그한 상황/활동/분위기/주제</Bullet>
        <Bullet>음성 + 대화행위 라벨 (U-A03) — 진술/질문/요청 등 대화행위 + 강도 태그</Bullet>
        <Bullet>음성 환경 프로필 (U-M06) — 실내/실외, 배경 소음 유형, SNR 등 환경 특성 (내용 무관)</Bullet>
      </Section>

      {/* 2. 수집하는 데이터 — 메타데이터 */}
      <Section icon="smartphone" title="수집하는 기기 메타데이터">
        <Bullet>통화/통신 메타 (U-M01) — 통화 건수/시간대/유형 버킷 (내용 없음)</Bullet>
        <Bullet>기기/환경 버킷 (U-M05) — 연결성/배터리/시간대 (정밀 위치 없음)</Bullet>
        <Bullet>통화 시간 패턴 (U-M07) — 요일/시간대별 통화 빈도 히트맵</Bullet>
        <Bullet>화면 세션 패턴 (U-M08) — 화면 On/Off 세션 길이/빈도 (앱명/내용 없음)</Bullet>
        <Bullet>충전/배터리 사이클 (U-M09) — 충전 시간대/속도/배터리 패턴</Bullet>
        <Bullet>네트워크 전환 (U-M10) — WiFi/모바일/오프라인 전환 빈도 (SSID 없음)</Bullet>
        <Bullet>주변 조도 패턴 (U-M13) — 시간대별 밝기 버킷, 실내/실외 추정</Bullet>
        <Bullet>디바이스 모션 (U-M14) — 움직임 강도/화면 각도 버킷 (위치 없음)</Bullet>
        <Bullet>앱 설치/삭제 (U-M16) — 카테고리별 설치/삭제 빈도 (앱명 없음)</Bullet>
        <Bullet>미디어 재생 (U-M18) — 카테고리별 재생 시간/건너뛰기 빈도 (앱명/콘텐츠명 없음)</Bullet>
      </Section>

      {/* 3. 수집하지 않는 항목 */}
      <Section icon="block" title="수집하지 않는 항목">
        <Bullet>통화 내용 / 문자 텍스트 원문 — 음성 파일의 내용은 분석하지 않습니다</Bullet>
        <Bullet>연락처 / 전화번호 — 상대방 정보는 일체 저장하지 않습니다</Bullet>
        <Bullet>GPS 좌표 / 정밀 위치 — 위치 기반 추적을 하지 않습니다</Bullet>
        <Bullet>앱 이름 / 화면 내용 — 앱 카테고리만 기록하며 앱명은 저장하지 않습니다</Bullet>
        <Bullet>정밀 타임스탬프 — 시간은 2시간 단위 버킷으로만 기록합니다</Bullet>
        <Bullet>키 입력 / 터치 좌표 — AccessibilityService 자동 수집은 영구 차단됩니다</Bullet>
      </Section>

      {/* 4. 비식별화 처리 */}
      <Section icon="enhanced_encryption" title="비식별화 처리">
        <Bullet>버킷화 — 시간(2h 단위), 통화 길이, 배터리 등 모든 수치를 범위로 변환합니다</Bullet>
        <Bullet>PII 마스킹 — 텍스트 추출 시 이름/번호/주소 등 개인정보를 자동 마스킹합니다</Bullet>
        <Bullet>음성 비식별화 — 원본 음성은 처리 후 삭제하며, 비식별 처리된 파일만 보관합니다</Bullet>
        <Bullet>익명 식별자 — 기기 ID 대신 가명 처리된 pseudoId를 사용합니다</Bullet>
      </Section>

      {/* 5. 데이터 활용 및 제3자 제공 */}
      <Section icon="storefront" title="데이터 활용 및 제3자 제공">
        <Bullet>사용자가 공개(동의 ON)한 데이터만 SKU 단위로 패키징하여 B2B 구매자에게 제공합니다</Bullet>
        <Bullet>구매자 예시 — AI 모델 학습 기업, 통신사, 광고 플랫폼, IoT/스마트홈, 헬스케어 등</Bullet>
        <Bullet>개인 식별 정보(이름, 전화번호, 기기 ID 등)는 제3자에게 제공되지 않습니다</Bullet>
        <Bullet>법령에 따른 수사기관 요청 시 법적 절차에 따라 제한적으로 제공될 수 있습니다</Bullet>
      </Section>

      {/* 6. 동의 및 공개 관리 */}
      <Section icon="toggle_on" title="동의 및 공개 관리">
        <Bullet>글로벌 수익 토글 — 내정보에서 전체 데이터 공개/비공개를 한 번에 제어합니다</Bullet>
        <Bullet>세션별 공개 토글 — 개별 세션 단위로 공개 여부를 설정할 수 있습니다</Bullet>
        <Bullet>메타데이터 항목별 동의 — 각 메타데이터 카테고리(통화/화면/센서 등)의 수집을 개별 설정합니다</Bullet>
        <Bullet>음성 동의 단계 — 본인 인증 전에는 메타데이터만 판매 가능하며, 본인 목소리 인증 후 음성 판매가 가능합니다</Bullet>
      </Section>

      {/* 7. 보안 조치 */}
      <Section icon="shield" title="보안 조치">
        <Bullet>전송 구간 TLS 1.3 암호화 — 모든 데이터 업로드 시 적용</Bullet>
        <Bullet>저장 데이터 AES-256 암호화 — 서버 및 백업 스토리지 전체 적용</Bullet>
        <Bullet>접근 권한 최소화 원칙 — 담당 엔지니어 외 원본 데이터 접근 불가</Bullet>
        <Bullet>이상 접근 탐지 시스템 운영 및 정기 보안 감사 실시</Bullet>
      </Section>

      {/* 8. 사용자 권리 */}
      <Section icon="manage_accounts" title="사용자 권리">
        <Bullet>열람권 — 수집된 본인 데이터 목록 및 처리 현황 요청 가능</Bullet>
        <Bullet>삭제권 — 특정 세션 또는 전체 데이터 삭제 요청 가능 (영업일 7일 내 처리)</Bullet>
        <Bullet>정정권 — 잘못 입력된 라벨 정보는 앱 내에서 직접 수정 가능</Bullet>
        <Bullet>동의 철회권 — 언제든 공개 토글 OFF 또는 서비스 탈퇴로 동의를 철회할 수 있습니다</Bullet>
      </Section>

      <p className="text-xs text-center pt-2 pb-1" style={{ color: 'var(--color-text-tertiary)' }}>
        본 방침은 2025년 1월 1일부터 적용됩니다 · Uncounted v0.1.0
      </p>
    </Modal>
  )
}
