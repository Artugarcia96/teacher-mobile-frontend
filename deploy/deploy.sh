#!/usr/bin/env bash
# Runs ON THE VPS, called by .github/workflows/deploy.yml (see ../teacher-mobile-backend/docs/DEPLOY.md).
# Publishes the built site (app + landing) in ~/sepia-cuaderno/web and (re)starts sepia-cuaderno-web: nginx:alpine on
# the public port 8200, serving the site and proxying /api to the sepia-cuaderno-api container.
# The VPS also runs sepia-education and coteacher: this script only touches sepia-cuaderno-* resources.
#
#   bash deploy.sh <release dir>     (site/ and nginx.conf.template, unpacked by the workflow)
# A release without site/index.html is the "solo landing" mode: only / and /landing/ are served.
set -euo pipefail

RELEASE="$(cd "${1:?uso: deploy.sh <carpeta de la versión>}" && pwd)"
APP_DIR="$HOME/sepia-cuaderno"
WEB_DIR="$APP_DIR/web"
NAME=sepia-cuaderno-web
NETWORK=sepia-cuaderno
PORT=8200
UPSTREAM=http://sepia-cuaderno-api:8000
IMAGE=nginx:alpine
LANDING_ONLY=false
[ -f "$RELEASE/site/index.html" ] || LANDING_ONLY=true

say() { printf '\n== %s\n' "$*"; }

nginx_args() {  # nginx_args <version dir>: docker run arguments that give nginx that version's site and config
  NGINX_ARGS=(--network "$NETWORK" -e SEPIA_API_UPSTREAM="$UPSTREAM" -e NGINX_ENTRYPOINT_QUIET_LOGS=1
    -v "$1/site:/usr/share/nginx/html:ro"
    -v "$1/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro")
}

start() {  # the only place the public container is created
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  nginx_args "$WEB_DIR/live"
  docker run -d --name "$NAME" --restart unless-stopped -p "$PORT:80" \
    --memory 128m --cpus 0.5 --log-opt max-size=10m --log-opt max-file=3 \
    "${NGINX_ARGS[@]}" "$IMAGE" >/dev/null
}

page_has() {  # page_has <path> <text>
  local page
  page="$(curl -fs --max-time 3 "http://127.0.0.1:$PORT$1")" && [[ "$page" == *"$2"* ]]
}

serving() {  # the landing at / with its first image, and the app at /hoy (unless solo landing), up to ~20 s
  local img
  img="$(grep -oE '/landing/img/[A-Za-z0-9._-]+' "$WEB_DIR/live/site/landing/index.html" | head -n 1 || true)"
  for _ in $(seq 1 20); do
    sleep 1
    if page_has / '/landing/landing.css' && { $LANDING_ONLY || page_has /hoy 'id="root"'; } \
      && { [ -z "$img" ] || curl -fs -o /dev/null --max-time 3 "http://127.0.0.1:$PORT$img"; }; then
      return 0
    fi
  done
  return 1
}

mkdir -p "$WEB_DIR"
chmod 700 "$APP_DIR"
# A deploy cut between the two renames below leaves the good site in previous/ and no live/: put it back first.
if [ ! -d "$WEB_DIR/live" ] && [ -d "$WEB_DIR/previous" ]; then mv "$WEB_DIR/previous" "$WEB_DIR/live"; fi
rm -rf "$WEB_DIR/next" "$WEB_DIR/previous" "$WEB_DIR/failed"

# Stage the new version next to the live one (same filesystem), so publishing it is a rename.
mkdir "$WEB_DIR/next"
cp -R "$RELEASE/site" "$WEB_DIR/next/site"
cp "$RELEASE/nginx.conf.template" "$WEB_DIR/next/nginx.conf.template"
chmod -R a+rX "$WEB_DIR/next"

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null 2>&1 \
  || docker network inspect "$NETWORK" >/dev/null   # the API deploy may create it at the same moment

say "Comprobando la configuración de nginx"
docker rm -f "$NAME-check" >/dev/null 2>&1 || true
nginx_args "$WEB_DIR/next"
docker run --rm --name "$NAME-check" "${NGINX_ARGS[@]}" "$IMAGE" nginx -t -q

say "Publicando la versión nueva en :$PORT"
docker rm -f "$NAME" >/dev/null 2>&1 || true
if [ -d "$WEB_DIR/live" ]; then mv "$WEB_DIR/live" "$WEB_DIR/previous"; fi
mv "$WEB_DIR/next" "$WEB_DIR/live"

if start && serving; then
  rm -rf "$WEB_DIR/previous"
  say "Web desplegada en http://127.0.0.1:$PORT/"
  if $LANDING_ONLY; then say "Solo landing: la app no está publicada"; exit 0; fi
  if health="$(curl -fs --max-time 5 "http://127.0.0.1:$PORT/api/health")"; then
    say "API a través de nginx: $health"
  else
    echo "::warning::La web está publicada, pero /api/health no responde a través de nginx. ¿Está desplegada sepia-cuaderno-api?"
  fi
  exit 0
fi

echo "nginx no sirve la landing (/, con sus imágenes) o la app (/hoy, salvo en solo landing) en :$PORT. Últimas líneas del registro:" >&2
docker logs --tail 40 "$NAME" >&2 || true
if [ -d "$WEB_DIR/previous" ]; then
  say "Volviendo a la versión anterior"
  mv "$WEB_DIR/live" "$WEB_DIR/failed"
  mv "$WEB_DIR/previous" "$WEB_DIR/live"
  if start && serving; then echo "La versión anterior vuelve a estar publicada." >&2; else echo "La versión anterior tampoco responde." >&2; fi
  rm -rf "$WEB_DIR/failed"
fi
exit 1
