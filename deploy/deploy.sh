#!/usr/bin/env bash
# Runs on the VPS. Installs the built SPA (dist/) and (re)starts an nginx
# container that serves it on port 8100 and proxies /api to the backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-$HOME/coteacher}"
TARBALL="$(realpath "${1:?usage: deploy.sh <dist.tar.gz>}")"
CONTAINER=coteacher-frontend
NETWORK=coteacher
PORT="${FRONTEND_PORT:-8100}"

mkdir -p "$APP_DIR/frontend"
cd "$APP_DIR/frontend"

rm -rf html.new && mkdir html.new
tar -xzf "$TARBALL" -C html.new
rm -f "$TARBALL"
cp "$SCRIPT_DIR/nginx.conf" nginx.conf
rm -rf html.old
[ -d html ] && mv html html.old
mv html.new html

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p "$PORT:80" \
  -v "$APP_DIR/frontend/html:/usr/share/nginx/html:ro" \
  -v "$APP_DIR/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine

sleep 2
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && echo "Frontend deployed on port $PORT."
