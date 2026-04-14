#!/usr/bin/env bash
# Cloudflare Tunnel + nginx 리버스 프록시 자동 설정
# - nginx 설치 (없으면)
# - /etc/nginx/sites-available/uncounted-tunnel 등록
# - 8080 포트에서 /api/* → 3001, /* → 5000 프록시
# - 기존 cloudflared 종료 후 8080으로 재기동
#
# Usage:
#   sudo bash deploy/setup-tunnel.sh           # nginx 설정만
#   sudo bash deploy/setup-tunnel.sh --tunnel  # nginx + cloudflared 재기동까지
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_SRC="${SCRIPT_DIR}/nginx-tunnel.conf"
CONF_DST="/etc/nginx/sites-available/uncounted-tunnel"
CONF_LINK="/etc/nginx/sites-enabled/uncounted-tunnel"

RUN_TUNNEL=0
for arg in "$@"; do
    case "$arg" in
        --tunnel) RUN_TUNNEL=1 ;;
        -h|--help)
            sed -n '2,12p' "$0"
            exit 0
            ;;
    esac
done

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m  %s\n' "$*"; }
err()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

if [[ $EUID -ne 0 ]]; then
    err "sudo로 실행하세요: sudo bash $0 $*"
    exit 1
fi

if [[ ! -f "$CONF_SRC" ]]; then
    err "nginx 설정 원본 없음: $CONF_SRC"
    exit 1
fi

# 1) nginx 설치
if ! command -v nginx >/dev/null 2>&1; then
    log "nginx 설치 중..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
else
    log "nginx 이미 설치됨: $(nginx -v 2>&1)"
fi

# 2) 설정 파일 배포
log "설정 파일 배포: $CONF_DST"
install -m 0644 "$CONF_SRC" "$CONF_DST"

# 3) sites-enabled 심볼릭 링크 + default 비활성
ln -sf "$CONF_DST" "$CONF_LINK"
if [[ -e /etc/nginx/sites-enabled/default ]]; then
    log "default 사이트 비활성"
    rm -f /etc/nginx/sites-enabled/default
fi

# 4) 8080 포트 점유 확인
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(^|:)8080$'; then
    HOLDER=$(ss -ltnp 2>/dev/null | awk '/:8080 /{print $0}' | head -1 || true)
    if ! echo "$HOLDER" | grep -q nginx; then
        warn "8080 포트가 nginx 외 프로세스에 점유됨:"
        warn "  $HOLDER"
        warn "충돌 시 nginx reload 실패 가능"
    fi
fi

# 5) 문법 검사 + 적용 (WSL2 호환)
log "nginx 문법 검사"
nginx -t

log "nginx 적용"
if systemctl reload nginx 2>/dev/null; then
    :
elif service nginx reload 2>/dev/null; then
    :
else
    # systemd/service 모두 실패 → 직접 띄우거나 reload
    if pgrep -x nginx >/dev/null; then
        nginx -s reload
    else
        nginx
    fi
fi

# 6) 로컬 점검
log "로컬 점검"
sleep 1
ROOT_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ || echo "000")
API_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/auth/me || echo "000")
printf '  nginx 8080 root         → %s (admin SPA 기대: 200)\n' "$ROOT_CODE"
printf '  nginx 8080 /api/auth/me → %s (인증 미들웨어 도달 기대: 401)\n' "$API_CODE"

if [[ "$ROOT_CODE" != "200" ]]; then
    warn "admin(5000) 미응답 — 'pm2 status uncounted-admin' 확인"
fi
if [[ "$API_CODE" != "401" && "$API_CODE" != "200" ]]; then
    warn "api(3001) 미응답 — 'pm2 status uncounted-api' 확인"
fi

# 7) (옵션) cloudflared 재기동
if [[ $RUN_TUNNEL -eq 1 ]]; then
    if ! command -v cloudflared >/dev/null 2>&1; then
        err "cloudflared 미설치 — 직접 설치 후 재실행하세요"
        exit 1
    fi
    log "기존 cloudflared 프로세스 종료"
    pkill -f 'cloudflared.*tunnel' || true
    sleep 1

    log "cloudflared 재기동 (백그라운드, 8080 → trycloudflare)"
    LOG_DIR="${SCRIPT_DIR}/../log"
    mkdir -p "$LOG_DIR"
    LOG_FILE="${LOG_DIR}/cloudflared.log"
    : > "$LOG_FILE"
    nohup cloudflared tunnel --url http://localhost:8080 \
        >>"$LOG_FILE" 2>&1 &
    TUNNEL_PID=$!
    log "cloudflared PID=$TUNNEL_PID, 로그=$LOG_FILE"

    log "터널 호스트 발급 대기 (최대 30초)..."
    HOST=""
    for _ in $(seq 1 30); do
        HOST=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" | head -1 || true)
        [[ -n "$HOST" ]] && break
        sleep 1
    done

    if [[ -n "$HOST" ]]; then
        log "터널 호스트: $HOST"
        log "→ uncounted-api/.env 의 CORS_ORIGIN 을 '$HOST' 로 갱신 후"
        log "  pm2 reload uncounted-api 실행하세요."
    else
        warn "30초 안에 호스트를 못 찾았습니다. tail -f $LOG_FILE 확인"
    fi
fi

log "완료"
