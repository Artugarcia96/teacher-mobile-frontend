#!/usr/bin/env bash
# Runs ON THE VPS, called by «Deploy web» (backend repo, deploy-frontend.yml) when its field `ruta_sepiaeducation` or
# `redirigir_a_app` is set. Publishes the sepia-cuaderno web under a path of https://www.sepiaeducation.com (e.g.
# /landing_test/), reusing the sepia-education nginx and its HTTPS certificate (the owner asked for it), or turns that
# path into a permanent redirect to https://app.sepiaeducation.com once the app lives there (sepiaeducation-app.sh).
# It only:
#   1. (publishing) connects the sepia-education nginx container to the sepia-cuaderno network (to reach sepia-cuaderno-web),
#      on every run: a recreated container loses it while the config keeps the block;
#   2. adds one marked block to the www.sepiaeducation.com server of its nginx config, edited in place (one at a time:
#      publishing and redirecting replace each other);
#   3. checks the config with `nginx -t` and reloads nginx (no restart).
# If the config test fails, or www/app answer differently after the reload, it restores the saved copy and fails.
#
#   bash sepiaeducation-proxy.sh /landing_test              publish the web at https://www.sepiaeducation.com/landing_test/
#   bash sepiaeducation-proxy.sh --redirect /landing_test   301 from …/landing_test/<x> to https://app.sepiaeducation.com/<x>
#   bash sepiaeducation-proxy.sh --remove                   remove the block
set -euo pipefail

NGINX=sepia-education-nginx-1
NETWORK=sepia-cuaderno
UPSTREAM=http://sepia-cuaderno-web:80
HOST=www.sepiaeducation.com
REDIRECT_TO=https://app.sepiaeducation.com
BACKUPS="$HOME/sepia-cuaderno/backups"
BEGIN='# >>> sepia-cuaderno (teacher-mobile-frontend/deploy/sepiaeducation-proxy.sh)'
END='# <<< sepia-cuaderno'

say() { printf '\n== %s\n' "$*"; }
die() { echo "::error::$*" >&2; exit 1; }

MODE=""
PREFIX=""
case "${1:-}" in
  --remove) MODE=remove ;;
  --redirect) MODE=redirect; PREFIX="${2:-}"; PREFIX="${PREFIX%/}" ;;
  /*) MODE=proxy; PREFIX="${1%/}" ;;
  *) die "uso: sepiaeducation-proxy.sh /ruta | --redirect /ruta | --remove" ;;
esac
REMOVE=false
[ "$MODE" != remove ] || REMOVE=true
if ! $REMOVE && [[ ! "$PREFIX" =~ ^/[A-Za-z0-9_-]+$ ]]; then die "Ruta no válida: «$PREFIX» (solo /letras_numeros-guiones)"; fi

docker inspect "$NGINX" >/dev/null 2>&1 || die "No existe el contenedor $NGINX: no se toca nada."

# The config file nginx really reads: the host side of the mount on /etc/nginx/nginx.conf.
CONF="$(docker inspect "$NGINX" --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/nginx.conf"}}{{.Source}}{{end}}{{end}}')"
[ -n "$CONF" ] && [ -f "$CONF" ] || die "No encuentro el nginx.conf montado en $NGINX: no se toca nada."
[ -w "$CONF" ] || die "$CONF no se puede escribir con este usuario: no se toca nada."
grep -qxF "        server_name $HOST;" "$CONF" || die "No encuentro el bloque server de $HOST en $CONF: no se toca nada."

status() {  # status <host> <path>: HTTP code answered by the live nginx for that host (TLS on 127.0.0.1)
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1$2" || echo 000
}
WWW_BEFORE="$(status "$HOST" /)"
APP_BEFORE="$(status app.sepiaeducation.com /)"
say "Antes: https://$HOST/ → $WWW_BEFORE · https://app.sepiaeducation.com/ → $APP_BEFORE"

mkdir -p "$BACKUPS"
chmod 700 "$BACKUPS"
BACKUP="$BACKUPS/$(basename "$CONF").$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$CONF" "$BACKUP"
say "Copia de seguridad: $BACKUP"

# New content: the file without our block, plus (unless --remove) the block right after "server_name www…;".
NEW="$(mktemp)"
trap 'rm -f "$NEW"' EXIT
awk -v begin="$BEGIN" -v end="$END" -v host="$HOST" -v prefix="$PREFIX" -v upstream="$UPSTREAM" -v mode="$MODE" \
    -v target="$REDIRECT_TO" '
  index($0, begin) { skip = 1; next }          # literal match: the markers contain regex characters
  skip && index($0, end) { skip = 0; next }
  skip { next }
  { print }
  mode != "remove" && $0 == "        server_name " host ";" && !done {
    print "        " begin
    if (mode == "redirect") {
      print "        location = " prefix " { return 301 " target "/; }"
      print "        location ^~ " prefix "/ { rewrite ^" prefix "(/.*)$ " target "$1 permanent; }"
    } else {
      print "        location = " prefix " { return 301 " prefix "/; }"
      print "        location ^~ " prefix "/ {"
      print "            set $sepia_cuaderno_web " upstream ";"
      print "            rewrite ^" prefix "(/.*)$ $1 break;"
      print "            proxy_pass $sepia_cuaderno_web;"
      print "            proxy_http_version 1.1;"
      print "            proxy_set_header Host $host;"
      print "            proxy_set_header X-Forwarded-Prefix " prefix ";"
      print "            proxy_set_header X-Forwarded-Proto $scheme;"
      print "            proxy_set_header X-Real-IP $remote_addr;"
      print "            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        }"
    }
    print "        " end
    done = 1
  }
' "$CONF" > "$NEW"
if [ -n "$(tail -c 1 "$CONF")" ]; then truncate -s -1 "$NEW"; fi   # awk ends with a newline the file may not have

if [ "$MODE" = proxy ]; then   # every run: a recreated container loses the network while the config keeps the block
  docker network inspect "$NETWORK" >/dev/null 2>&1 || die "No existe la red $NETWORK: despliega antes la web."
  if ! docker inspect "$NGINX" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -qxF "$NETWORK"; then
    say "Conectando $NGINX a la red $NETWORK"
    docker network connect "$NETWORK" "$NGINX"
  fi
fi

if cmp -s "$NEW" "$CONF"; then
  say "La configuración ya estaba así; no hace falta recargar."
  rm -f "$BACKUP"
else
  restore() {
    echo "Restaurando la configuración anterior" >&2
    cat "$BACKUP" > "$CONF"      # in place: the file is bind-mounted, a new inode would not be seen by the container
    docker exec "$NGINX" nginx -t -q && docker exec "$NGINX" nginx -s reload || true
  }

  cat "$NEW" > "$CONF"            # in place, same inode
  say "Comprobando la configuración (nginx -t)"
  if ! docker exec "$NGINX" nginx -t -q; then restore; die "nginx -t falla con el cambio; se ha dejado como estaba."; fi
  if ! docker exec "$NGINX" nginx -s reload; then restore; die "nginx no ha recargado con el cambio; se ha dejado como estaba."; fi
  sleep 2
  WWW_AFTER="$(status "$HOST" /)"
  APP_AFTER="$(status app.sepiaeducation.com /)"
  say "Después: https://$HOST/ → $WWW_AFTER · https://app.sepiaeducation.com/ → $APP_AFTER"
  if [ "$WWW_AFTER" != "$WWW_BEFORE" ] || [ "$APP_AFTER" != "$APP_BEFORE" ]; then
    restore; die "sepiaeducation.com responde distinto tras el cambio; se ha dejado como estaba."
  fi
fi

if $REMOVE; then
  say "Quitado. (La red $NETWORK sigue conectada a $NGINX; no afecta a nada y desaparece al recrear ese contenedor.)"
  exit 0
fi

if [ "$MODE" = redirect ]; then
  got="$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 --resolve "$HOST:443:127.0.0.1" "https://$HOST$PREFIX/" || true)"
  if [ "$got" = "301 $REDIRECT_TO/" ]; then
    say "https://$HOST$PREFIX/ redirige a $REDIRECT_TO/"
    exit 0
  fi
  echo "::warning::El bloque está puesto y sepiaeducation.com sigue igual, pero https://$HOST$PREFIX/ responde «$got» en vez de «301 $REDIRECT_TO/»." >&2
  exit 1
fi

say "Comprobando https://$HOST$PREFIX/"
for _ in $(seq 1 10); do
  page="$(curl -sk --max-time 10 --resolve "$HOST:443:127.0.0.1" "https://$HOST$PREFIX/" || true)"
  if [[ "$page" == *"landing.css"* ]]; then
    say "Publicado en https://$HOST$PREFIX/"
    exit 0
  fi
  sleep 1
done
echo "::warning::El bloque está puesto y sepiaeducation.com sigue igual, pero https://$HOST$PREFIX/ aún no sirve la landing." >&2
exit 1
