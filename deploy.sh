#!/usr/bin/env bash
#
# Build and run the wedding guest-list app with Docker, locally, on whatever
# machine you run this from (Raspberry Pi, laptop, server — any arch).
#
# Usage:
#   ./deploy.sh
#
# Configure via environment variables (or edit the defaults below):
#   APP_NAME       container/image name  (default: utils-nozze)
#   HOST_PORT      port to expose         (default: 8091)
#   AUTH_USER      Basic Auth username    (default: sposi)
#   AUTH_PASSWORD  Basic Auth password    (REQUIRED for a public address)
#   ADMIN_KEY      extra key for sensitive gallery admin tools
#   R2_*           Cloudflare R2 gallery storage settings
#   DATA_VOLUME    Docker volume for DB   (default: <APP_NAME>-data)
#
# Examples:
#   AUTH_PASSWORD='our-secret' ./deploy.sh
#   HOST_PORT=80 AUTH_USER=george AUTH_PASSWORD='our-secret' ./deploy.sh

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
AUTH_USER="${AUTH_USER:-sposi}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
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

# 2. Warn if the site would be left unprotected.
if [ -z "${AUTH_PASSWORD}" ]; then
  echo "!! AUTH_PASSWORD is not set — the site would be PUBLIC with no password." >&2
  echo "   Re-run with e.g.  AUTH_PASSWORD='our-secret' ./deploy.sh" >&2
  read -r -p "   Continue without a password anyway? [y/N] " reply
  case "${reply}" in
    [yY]*) ;;
    *) echo "   Aborted."; exit 1 ;;
  esac
fi

if [ -z "${ADMIN_KEY}" ]; then
  echo "!! ADMIN_KEY is not set — gallery admin tools will fall back to the dev value 'admin'." >&2
  echo "   Set a long random ADMIN_KEY in .env before production deploy." >&2
  read -r -p "   Continue with the dev fallback anyway? [y/N] " reply
  case "${reply}" in
    [yY]*) ;;
    *) echo "   Aborted."; exit 1 ;;
  esac
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
  -e "AUTH_USER=${AUTH_USER}" \
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
