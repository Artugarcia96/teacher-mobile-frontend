#!/usr/bin/env bash
# Runs ON THE VPS, called by «Deploy web» (backend repo, deploy-frontend.yml) when `landing_en_www` is set (the owner asked
# for it). Serves the Sepia landing at https://www.sepiaeducation.com/ (and so at sepiaeducation.com, which redirects
# there) from sepia-cuaderno-web, with «Entrar» / «Crear cuenta» (/entrar…) sent to https://app.sepiaeducation.com.
# Everything else www serves (its other pages and assets) is untouched. It only:
#   1. connects the sepia-education nginx container to the sepia-cuaderno network (on every run: a recreated container
#      loses it while the config keeps the block);
#   2. adds one marked block to the www.sepiaeducation.com server of its nginx config, edited in place: exact "/",
#      "/landing/" and "/entrar" (independent of the block of sepiaeducation-proxy.sh);
#   3. checks the config with `nginx -t` and reloads nginx (no restart).
# If the config test or the reload fails, or www/app answer with another status after the reload, or www does not serve
# the landing, it restores the saved copy and fails.
#
#   bash sepiaeducation-www.sh             serve the landing at https://www.sepiaeducation.com/
#   bash sepiaeducation-www.sh --remove    give www its own home page back
set -euo pipefail

NGINX=sepia-education-nginx-1
NETWORK=sepia-cuaderno
UPSTREAM=http://sepia-cuaderno-web:80
HOST=www.sepiaeducation.com
APP_URL=https://app.sepiaeducation.com
BACKUPS="$HOME/sepia-cuaderno/backups"
BEGIN='# >>> sepia-cuaderno-landing (teacher-mobile-frontend/deploy/sepiaeducation-www.sh)'
END='# <<< sepia-cuaderno-landing'

say() { printf '\n== %s\n' "$*"; }
die() { echo "::error::$*" >&2; exit 1; }

case "${1:-}" in
  --remove) REMOVE=true ;;
  "") REMOVE=false ;;
  *) die "uso: sepiaeducation-www.sh [--remove]" ;;
esac

docker inspect "$NGINX" >/dev/null 2>&1 || die "No existe el contenedor $NGINX: no se toca nada."
CONF="$(docker inspect "$NGINX" --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/nginx.conf"}}{{.Source}}{{end}}{{end}}')"
[ -n "$CONF" ] && [ -f "$CONF" ] || die "No encuentro el nginx.conf montado en $NGINX: no se toca nada."
[ -w "$CONF" ] || die "$CONF no se puede escribir con este usuario: no se toca nada."
[ "$(grep -cxF "        server_name $HOST;" "$CONF")" = 1 ] || die "No encuentro un único bloque server de $HOST en $CONF: no se toca nada."

status() {  # status <host> <path>: HTTP code answered by the live nginx for that host (TLS on 127.0.0.1)
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1$2" || echo 000
}
WWW_BEFORE="$(status "$HOST" /)"
APP_BEFORE="$(status app.sepiaeducation.com /)"
say "Antes: https://$HOST/ → $WWW_BEFORE · https://app.sepiaeducation.com/ → $APP_BEFORE"

mkdir -p "$BACKUPS"
chmod 700 "$BACKUPS"
BACKUP="$BACKUPS/$(basename "$CONF").$(date -u +%Y%m%dT%H%M%SZ).www"
cp -p "$CONF" "$BACKUP"
say "Copia de seguridad: $BACKUP"

NEW="$(mktemp)"
trap 'rm -f "$NEW"' EXIT
awk -v begin="$BEGIN" -v end="$END" -v host="$HOST" -v upstream="$UPSTREAM" -v app="$APP_URL" -v add="$($REMOVE && echo 0 || echo 1)" '
  function proxy(loc) {
    print "        location " loc " {"
    print "            set $sepia_cuaderno_web " upstream ";"
    print "            proxy_pass $sepia_cuaderno_web;"
    print "            proxy_http_version 1.1;"
    print "            proxy_set_header Host $host;"
    print "            proxy_set_header X-Forwarded-Proto $scheme;"
    print "            proxy_set_header X-Real-IP $remote_addr;"
    print "            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    print "        }"
  }
  index($0, begin) { skip = 1; next }          # literal match: the markers contain regex characters
  skip && index($0, end) { skip = 0; next }
  skip { next }
  { print }
  add == 1 && $0 == "        server_name " host ";" && !done {
    print "        " begin
    proxy("= /")
    proxy("^~ /landing/")
    print "        location ^~ /entrar { return 302 " app "$request_uri; }"
    print "        " end
    done = 1
  }
' "$CONF" > "$NEW"
if [ -n "$(tail -c 1 "$CONF")" ]; then truncate -s -1 "$NEW"; fi   # awk ends with a newline the file may not have

if ! $REMOVE; then   # every run: a recreated container loses the network while the config keeps the block
  docker network inspect "$NETWORK" >/dev/null 2>&1 || die "No existe la red $NETWORK: despliega antes la web."
  if ! docker inspect "$NGINX" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -qxF "$NETWORK"; then
    say "Conectando $NGINX a la red $NETWORK"
    docker network connect "$NETWORK" "$NGINX"
  fi
fi

restore() {
  echo "Restaurando la configuración anterior" >&2
  cat "$BACKUP" > "$CONF"      # in place: the file is bind-mounted, a new inode would not be seen by the container
  docker exec "$NGINX" nginx -t -q && docker exec "$NGINX" nginx -s reload || true
}

CHANGED=false
if cmp -s "$NEW" "$CONF"; then
  say "La configuración ya estaba así; no hace falta recargar."
  rm -f "$BACKUP"
else
  CHANGED=true
  cat "$NEW" > "$CONF"            # in place, same inode
  say "Comprobando la configuración (nginx -t)"
  if ! docker exec "$NGINX" nginx -t -q; then restore; die "nginx -t falla con el cambio; se ha dejado como estaba."; fi
  if ! docker exec "$NGINX" nginx -s reload; then restore; die "nginx no ha recargado con el cambio; se ha dejado como estaba."; fi
  sleep 2
  WWW_AFTER="$(status "$HOST" /)"
  APP_AFTER="$(status app.sepiaeducation.com /)"
  say "Después: https://$HOST/ → $WWW_AFTER · https://app.sepiaeducation.com/ → $APP_AFTER"
  if [ "$WWW_AFTER" != 200 ] || [ "$APP_AFTER" != "$APP_BEFORE" ]; then
    restore; die "sepiaeducation.com responde distinto tras el cambio; se ha dejado como estaba."
  fi
fi

if $REMOVE; then
  say "Quitado: https://$HOST/ vuelve a su página de siempre."
  exit 0
fi

page="$(curl -sk --max-time 10 --resolve "$HOST:443:127.0.0.1" "https://$HOST/" || true)"
entrar="$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 --resolve "$HOST:443:127.0.0.1" "https://$HOST/entrar?cuenta=nueva" || true)"
if [[ "$page" == *"landing.css"* ]] && [ "$entrar" = "302 $APP_URL/entrar?cuenta=nueva" ]; then
  say "https://$HOST/ sirve la landing de Sepia; «Entrar» y «Crear cuenta» llevan a $APP_URL"
  exit 0
fi
if $CHANGED; then restore; fi
die "https://$HOST/ no sirve la landing (o /entrar responde «$entrar»)$($CHANGED && echo '; se ha dejado como estaba')."
