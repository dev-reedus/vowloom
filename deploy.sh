#!/usr/bin/env bash
#
# Build and run the wedding guest-list app with Docker, locally, on whatever
# machine you run this from (Raspberry Pi, laptop, server - any arch).
#
# Usage:
#   ./deploy.sh
#
# Configure via environment variables (or edit the defaults below):
#   APP_NAME         container/image name (default: utils-nozze)
#   HOST_PORT        port to expose        (default: 8091)
#   WEDDING_*        public couple names, year, and gallery title
#   DEFAULT_LANGUAGE initial UI language: it, en, or ro
#   COUPLE_PASSWORD  couple login password (REQUIRED; falls back to AUTH_PASSWORD)
#   ADMIN_PASSWORD   admin login password  (REQUIRED; must differ from couple's)
#   TOKEN_SECRET     guest-link encryption key (recommended; else derived from ADMIN_KEY)
#   SESSION_SECRET   session-version key (optional; falls back to TOKEN_SECRET)
#   ADMIN_KEY        legacy guest-link key material (kept so old links keep working)
#   AUTH_PASSWORD    legacy; used as the COUPLE_PASSWORD fallback if unset
#   R2_*             Cloudflare R2 gallery storage settings
#   DATA_VOLUME      Docker volume for DB  (default: <APP_NAME>-data)
#
# Examples:
#   COUPLE_PASSWORD='couple-secret' ADMIN_PASSWORD='admin-secret' ./deploy.sh
#   HOST_PORT=80 COUPLE_PASSWORD='couple-secret' ADMIN_PASSWORD='admin-secret' ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Load .env if present. Variables already set in the environment (e.g. passed
# on the command line) take precedence, so `HOST_PORT=80 ./deploy.sh` still wins.
if [ -f .env ]; then
  echo "==> Loading config from .env"
  while IFS='=' read -r key val; do
    key="${key#"${key%%[![:space:]]*}"}"   # ltrim
    key="${key%"${key##*[![:space:]]}"}"   # rtrim
    case "${key}" in ''|\#*) continue ;; esac
    if [ -z "${!key:-}" ]; then
      val="${val%\"}"; val="${val#\"}"     # strip surrounding double quotes
      val="${val%\'}"; val="${val#\'}"     # strip surrounding single quotes
      export "${key}=${val}"
    fi
  done < .env
fi

APP_NAME="${APP_NAME:-utils-nozze}"
HOST_PORT="${HOST_PORT:-8091}"
WEDDING_COUPLE_NAMES="${WEDDING_COUPLE_NAMES:-The Couple}"
WEDDING_YEAR="${WEDDING_YEAR:-}"
WEDDING_GALLERY_TITLE="${WEDDING_GALLERY_TITLE:-Wedding Gallery}"
DEFAULT_LANGUAGE="${DEFAULT_LANGUAGE:-it}"
SEED_EXAMPLE_TABLES="${SEED_EXAMPLE_TABLES:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
COUPLE_PASSWORD="${COUPLE_PASSWORD:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TOKEN_SECRET="${TOKEN_SECRET:-}"
SESSION_SECRET="${SESSION_SECRET:-}"
ALLOW_INSECURE_AUTH="${ALLOW_INSECURE_AUTH:-}"
ADMIN_KEY="${ADMIN_KEY:-}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"
R2_BUCKET="${R2_BUCKET:-}"
R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL:-}"
GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS="${GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS:-300}"
GALLERY_DISPLAY_URL_EXPIRES_SECONDS="${GALLERY_DISPLAY_URL_EXPIRES_SECONDS:-3600}"
GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT="${GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT:-200}"
GALLERY_DISPLAY_IMAGE_SIZE="${GALLERY_DISPLAY_IMAGE_SIZE:-2048}"
GALLERY_MONTHLY_BUDGET_USD="${GALLERY_MONTHLY_BUDGET_USD:-10}"
DATA_VOLUME="${DATA_VOLUME:-${APP_NAME}-data}"

# 1. Docker must be installed and running.
if ! command -v docker >/dev/null 2>&1; then
  echo "!! Docker is not installed." >&2
  echo "   Install it with:  curl -sSL https://get.docker.com | sh" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "!! Docker is installed but not reachable." >&2
  echo "   Is the daemon running, and is your user in the 'docker' group?" >&2
  echo "   (try:  sudo usermod -aG docker \"\$USER\"  then log out/in)" >&2
  exit 1
fi

# 2. Fail-closed pre-flight: the app refuses to start unless both login
#    passwords are set, non-guessable, and distinct (unless ALLOW_INSECURE_AUTH=1).
#    Catch it here with a clear message instead of a crash-looping container.
COUPLE_EFFECTIVE="${COUPLE_PASSWORD:-${AUTH_PASSWORD}}"   # couple falls back to AUTH_PASSWORD
# Match the app's truthiness for ALLOW_INSECURE_AUTH (1|true|yes, case-insensitive).
if ! printf '%s' "${ALLOW_INSECURE_AUTH}" | grep -qiE '^(1|true|yes)$'; then
  problems=""
  [ -z "${COUPLE_EFFECTIVE}" ] && problems="${problems}\n   - COUPLE_PASSWORD (or AUTH_PASSWORD) is empty"
  [ -z "${ADMIN_PASSWORD}" ] && problems="${problems}\n   - ADMIN_PASSWORD is empty"
  if [ -n "${COUPLE_EFFECTIVE}" ] && [ "${COUPLE_EFFECTIVE}" = "${ADMIN_PASSWORD}" ]; then
    problems="${problems}\n   - COUPLE_PASSWORD and ADMIN_PASSWORD must be distinct"
  fi
  if [ -n "${problems}" ]; then
    echo "!! Insecure/incomplete auth config - the container would refuse to start:" >&2
    printf "%b\n" "${problems}" >&2
    echo "   Set them in .env, e.g.  COUPLE_PASSWORD='...'  ADMIN_PASSWORD='...'" >&2
    echo "   (or set ALLOW_INSECURE_AUTH=1 for a local, non-public deploy)." >&2
    exit 1
  fi
fi

echo "==> Building image '${APP_NAME}:latest' (this is native to this machine)…"
docker build -t "${APP_NAME}:latest" .

echo "==> (Re)starting container…"
docker rm -f "${APP_NAME}" >/dev/null 2>&1 || true
docker run -d \
  --name "${APP_NAME}" \
  --restart unless-stopped \
  -p "${HOST_PORT}:80" \
  -v "${DATA_VOLUME}:/app/data" \
  -e "WEDDING_COUPLE_NAMES=${WEDDING_COUPLE_NAMES}" \
  -e "WEDDING_YEAR=${WEDDING_YEAR}" \
  -e "WEDDING_GALLERY_TITLE=${WEDDING_GALLERY_TITLE}" \
  -e "DEFAULT_LANGUAGE=${DEFAULT_LANGUAGE}" \
  -e "SEED_EXAMPLE_TABLES=${SEED_EXAMPLE_TABLES}" \
  -e "COUPLE_PASSWORD=${COUPLE_PASSWORD}" \
  -e "ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  -e "TOKEN_SECRET=${TOKEN_SECRET}" \
  -e "SESSION_SECRET=${SESSION_SECRET}" \
  -e "ALLOW_INSECURE_AUTH=${ALLOW_INSECURE_AUTH}" \
  -e "AUTH_PASSWORD=${AUTH_PASSWORD}" \
  -e "ADMIN_KEY=${ADMIN_KEY}" \
  -e "R2_ACCOUNT_ID=${R2_ACCOUNT_ID}" \
  -e "R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}" \
  -e "R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}" \
  -e "R2_BUCKET=${R2_BUCKET}" \
  -e "R2_PUBLIC_BASE_URL=${R2_PUBLIC_BASE_URL}" \
  -e "GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS=${GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS}" \
  -e "GALLERY_DISPLAY_URL_EXPIRES_SECONDS=${GALLERY_DISPLAY_URL_EXPIRES_SECONDS}" \
  -e "GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT=${GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT}" \
  -e "GALLERY_DISPLAY_IMAGE_SIZE=${GALLERY_DISPLAY_IMAGE_SIZE}" \
  -e "GALLERY_MONTHLY_BUDGET_USD=${GALLERY_MONTHLY_BUDGET_USD}" \
  "${APP_NAME}:latest"

docker image prune -f >/dev/null 2>&1 || true

# 3. Report where it's reachable.
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "==> Done. App is live at:"
echo "     http://localhost:${HOST_PORT}/"
[ -n "${IP}" ] && echo "     http://${IP}:${HOST_PORT}/   (from other devices on the network)"
echo ""
echo "    Data volume: ${DATA_VOLUME}  (survives container stop/rm and redeploys)"
