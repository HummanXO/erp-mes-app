#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/metrics-bug-analysis}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE="${SERVICE:-frontend}"

echo "[deploy] app_dir=${APP_DIR} branch=${BRANCH} service=${SERVICE}"

cd "${APP_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[deploy] ERROR: ${APP_DIR} is not a git repository"
  exit 1
fi

git fetch --all --prune
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

docker compose -f "${COMPOSE_FILE}" build --pull "${SERVICE}"
docker compose -f "${COMPOSE_FILE}" up -d "${SERVICE}"

echo "[deploy] done"
