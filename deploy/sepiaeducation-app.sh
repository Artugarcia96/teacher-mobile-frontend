#!/usr/bin/env bash
# Runs ON THE VPS, called by «Deploy web» (backend repo, deploy-frontend.yml) when app_sepiaeducation is set, after a full
# deploy and deploy/sepiaeducation-certs.sh. Serves https://app.sepiaeducation.com from sepia-cuaderno-web (the owner
# asked for it: nobody uses the previous app there), reusing the sepia-education nginx, its certificate for that name and
# its port-80 server, which stays as it is (http → https and the ACME challenges that renew the certificates). It only:
#   1. connects the sepia-education nginx container to the sepia-cuaderno network (so it reaches sepia-cuaderno-web);
#   2. in its nginx config, edited in place after a copy: renames the server_name of the existing 443 server for
#      app.sepiaeducation.com to a name that never resolves (marked comment on that line), and adds right after that
#      server a marked server block for app.sepiaeducation.com that proxies everything to sepia-cuaderno-web;
#   3. checks the config with `nginx -t` and reloads nginx (no restart).
# If the test fails, sepiaeducation.com or www answer differently afterwards, or app.sepiaeducation.com does not serve our
# landing and /api/health, it puts the saved copy back and fails.
#
#   bash sepiaeducation-app.sh            take over https://app.sepiaeducation.com
#   bash sepiaeducation-app.sh --remove   give it back: the original config, byte for byte
set -euo pipefail

NGINX=sepia-education-nginx-1
NETWORK=sepia-cuaderno
UPSTREAM=http://sepia-cuaderno-web:80
APP=app.sepiaeducation.com
OTHERS=(sepiaeducation.com www.sepiaeducation.com)        # must answer exactly as before
PARKED=app-sepia-education-previous.invalid                # .invalid never resolves (RFC 6761)
PARK_NOTE="# sepia-cuaderno: was $APP"
BACKUPS="$HOME/sepia-cuaderno/backups"
BEGIN="# >>> sepia-cuaderno $APP (teacher-mobile-frontend/deploy/sepiaeducation-app.sh)"
END="# <<< sepia-cuaderno $APP"

say() { printf '\n== %s\n' "$*"; }
die() { echo "::error::$*" >&2; exit 1; }

REMOVE=false
case "${1:-}" in
  "") ;;
  --remove) REMOVE=true ;;
  *) die "uso: sepiaeducation-app.sh [--remove]" ;;
esac

docker inspect "$NGINX" >/dev/null 2>&1 || die "No existe el contenedor $NGINX: no se toca nada."
# The config file nginx really reads: the host side of the mount on /etc/nginx/nginx.conf.
CONF="$(docker inspect "$NGINX" --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/nginx.conf"}}{{.Source}}{{end}}{{end}}')"
[ -n "$CONF" ] && [ -f "$CONF" ] || die "No encuentro el nginx.conf montado en $NGINX: no se toca nada."
[ -w "$CONF" ] || die "$CONF no se puede escribir con este usuario: no se toca nada."

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ORIGINAL="$WORK/original"   # the config without anything of this script (what --remove gives back)
NEW="$WORK/new"

# 1) Without our block, and with the parked line back to its original text.
awk -v begin="$BEGIN" -v end="$END" -v parked="server_name $PARKED; $PARK_NOTE" -v app="$APP" '
  index($0, begin) { skip = 1; next }          # literal match: the markers contain regex characters
  skip && index($0, end) { skip = 0; next }
  skip { next }
  {
    i = index($0, parked)
    if (i > 0 && substr($0, 1, i - 1) ~ /^[ \t]*$/ && length($0) == i - 1 + length(parked)) {
      print substr($0, 1, i - 1) "server_name " app ";"
      next
    }
    print
  }
' "$CONF" > "$ORIGINAL"

# 2) Unless --remove: find the one 443 server whose server_name line is exactly "server_name app.sepiaeducation.com;",
#    park that line and add our server after its closing brace, with its listen and TLS lines (its certificate).
if $REMOVE; then
  cp "$ORIGINAL" "$NEW"
else
  if ! awk -v app="$APP" -v parked="server_name $PARKED; $PARK_NOTE" -v begin="$BEGIN" -v end="$END" \
      -v upstream="$UPSTREAM" -v errfile="$WORK/error" '
    function code(line,   out, i, c, q) {  # the line without comments and quoted strings: braces and directives
      out = ""; q = ""
      for (i = 1; i <= length(line); i++) {
        c = substr(line, i, 1)
        if (q != "") { if (c == "\\") i++; else if (c == q) q = ""; continue }
        if (c == "\"" || c == "\047") { q = c; continue }
        if (c == "#") break
        out = out c
      }
      return out
    }
    function listen_line(c,   n, t, i, out) {  # address, ssl and http2: default_server, reuseport… stay theirs
      n = split(c, t, /[ \t;]+/)
      out = ""
      for (i = 1; i <= n; i++) {
        if (t[i] == "" || t[i] == "listen" || t[i] == "ssl") continue
        if (out == "") out = "listen " t[i] " ssl"
        else if (t[i] == "http2") out = out " http2"
      }
      return out ";"
    }
    NR == FNR {
      c = code($0)
      if (!inside && c ~ /^[ \t]*server[ \t]*\{/) {
        inside = 1; sdepth = depth; start = FNR; is443 = 0; appline = 0; mentions = 0; nkeep = 0; h2 = 0; cert = 0
        indent = $0; sub(/[^ \t].*$/, "", indent)
      }
      d = depth
      tmp = c; opens = gsub(/\{/, "", tmp); tmp = c; closes = gsub(/\}/, "", tmp)
      depth += opens - closes
      if (c ~ /^[ \t]*resolver[ \t]/ && !inside) resolver_at[d] = 1
      if (inside && d == sdepth + 1) {          # directives of the server itself (not of its locations)
        if (c ~ /^[ \t]*listen[ \t]/ && c ~ /[ \t:]443([ \t;]|$)/ && c !~ /[ \t]quic([ \t;]|$)/) {  # TCP 443
          is443 = 1
          keep[++nkeep] = listen_line(c); if (c ~ /[ \t]http2([ \t;]|$)/) h2 = 1
        } else if (c ~ /^[ \t]*http2[ \t]+on[ \t]*;/) {
          keep[++nkeep] = "http2 on;"; h2 = 1
        } else if (c ~ /^[ \t]*ssl_[a-z_]+[ \t]/ || (c ~ /^[ \t]*include[ \t]/ && c ~ /(ssl|letsencrypt)/)) {
          line = c; sub(/^[ \t]+/, "", line); sub(/[ \t]+$/, "", line); keep[++nkeep] = line
          if (c ~ /^[ \t]*ssl_certificate[ \t]/) cert = 1
        }
        t = $0; sub(/^[ \t]*/, "", t)
        if (t == "server_name " app ";") appline = FNR
        else if (c ~ /^[ \t]*server_name[ \t]/ && index(c, app)) mentions = FNR
      }
      if (inside && FNR > start && depth == sdepth) {   # the server block closes on this line
        inside = 0
        if (is443 && appline) {
          found++; b_end = FNR; b_app = appline; b_indent = indent; b_depth = sdepth; b_h2 = h2; b_cert = cert
          nb = nkeep; for (i = 1; i <= nkeep; i++) b_keep[i] = keep[i]
        } else if (is443 && mentions) clash = mentions
      }
      next
    }
    FNR == 1 {
      if (found != 1) { print "servers443=" found > errfile; exit 3 }
      if (clash) { print "clash=" clash > errfile; exit 4 }
    }
    {
      if (FNR == b_app) { i = index($0, "server_name"); print substr($0, 1, i - 1) parked; next }
      print
      if (FNR == b_end) {
        p = b_indent; q = p "    "; r = q "    "
        print p begin
        print p "server {"
        for (i = 1; i <= nb; i++) {
          l = b_keep[i]
          if (!b_h2 && l ~ /^listen /) sub(/;$/, " http2;", l)
          print q l
        }
        print q "server_name " app ";"
        if (!b_cert) {
          print q "ssl_certificate /etc/letsencrypt/live/" app "/fullchain.pem;"
          print q "ssl_certificate_key /etc/letsencrypt/live/" app "/privkey.pem;"
        }
        if (!resolver_at[b_depth]) print q "resolver 127.0.0.11 valid=10s ipv6=off;   # Docker DNS"
        print q "server_tokens off;"
        print q "client_max_body_size 80m;           # scanned exams, photos of textbook pages"
        print q "client_body_timeout 300s;"
        print q "add_header Strict-Transport-Security \"max-age=31536000\" always;"
        print q "add_header X-Content-Type-Options \"nosniff\" always;"
        print q "add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;"
        print q "location / {"
        print r "set $sepia_cuaderno_web " upstream ";   # resolved per request: nginx starts without it"
        print r "proxy_pass $sepia_cuaderno_web;"
        print r "proxy_http_version 1.1;"
        print r "proxy_set_header Host $host;"
        print r "proxy_set_header X-Forwarded-Proto https;"
        print r "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
        print r "proxy_set_header X-Real-IP $remote_addr;"
        print r "proxy_connect_timeout 10s;"
        print r "proxy_send_timeout 300s;"
        print r "proxy_read_timeout 300s;"
        print q "}"
        print p "}"
        print p end
      }
    }
  ' "$ORIGINAL" "$ORIGINAL" > "$NEW"; then
    case "$(cat "$WORK/error" 2>/dev/null)" in
      servers443=0|servers443=) die "No encuentro en $CONF un servidor 443 con la línea exacta «server_name $APP;»: no se toca nada." ;;
      servers443=*) die "Hay más de un servidor 443 con «server_name $APP;» en $CONF: no se toca nada." ;;
      clash=*) die "Otro servidor 443 de $CONF también nombra $APP (línea $(cut -d= -f2 "$WORK/error")): no se toca nada." ;;
      *) die "No he podido preparar el cambio de $CONF: no se toca nada." ;;
    esac
  fi
fi
if [ -n "$(tail -c 1 "$CONF")" ]; then truncate -s -1 "$NEW"; fi   # awk ends with a newline the file may not have

status() {  # status <host> <path>: HTTP code answered by the live nginx for that host (TLS on 127.0.0.1)
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1$2" || echo 000
}
page() { curl -sk --max-time 10 --resolve "$APP:443:127.0.0.1" "https://$APP$1" || true; }

serving_ours() {  # our landing at / and the API behind it, up to ~20 s
  for _ in $(seq 1 10); do
    if [[ "$(page /)" == *"/landing/landing.css"* ]] && [[ "$(page /api/health)" == *'"ok":true'* ]]; then return 0; fi
    sleep 2
  done
  return 1
}

declare -A BEFORE
for h in "${OTHERS[@]}"; do BEFORE[$h]="$(status "$h" /)"; done
say "Antes: $(for h in "${OTHERS[@]}"; do printf 'https://%s/ → %s · ' "$h" "${BEFORE[$h]}"; done)https://$APP/ → $(status "$APP" /)"

if cmp -s "$NEW" "$CONF"; then
  say "La configuración ya estaba así; no hace falta recargar."
else
  if ! $REMOVE; then
    docker network inspect "$NETWORK" >/dev/null 2>&1 || die "No existe la red $NETWORK: despliega antes la web."
    if ! docker inspect "$NGINX" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -qxF "$NETWORK"; then
      say "Conectando $NGINX a la red $NETWORK"
      docker network connect "$NETWORK" "$NGINX"
    fi
  fi

  mkdir -p "$BACKUPS"
  chmod 700 "$BACKUPS"
  BACKUP="$BACKUPS/$(basename "$CONF").$(date -u +%Y%m%dT%H%M%SZ).app"
  cp -p "$CONF" "$BACKUP"
  say "Copia de seguridad: $BACKUP"

  restore() {
    echo "Restaurando la configuración anterior" >&2
    cat "$BACKUP" > "$CONF"      # in place: the file is bind-mounted, a new inode would not be seen by the container
    docker exec "$NGINX" nginx -t -q && docker exec "$NGINX" nginx -s reload || true
  }

  cat "$NEW" > "$CONF"            # in place, same inode
  say "Comprobando la configuración (nginx -t)"
  if ! docker exec "$NGINX" nginx -t -q; then restore; die "nginx -t falla con el cambio; se ha dejado como estaba."; fi
  docker exec "$NGINX" nginx -s reload
  sleep 2
  changed=""
  for h in "${OTHERS[@]}"; do
    after="$(status "$h" /)"
    echo "https://$h/ → $after (antes ${BEFORE[$h]})"
    [ "$after" = "${BEFORE[$h]}" ] || changed="$changed $h"
  done
  if [ -n "$changed" ]; then restore; die "Responde distinto tras el cambio:$changed; se ha dejado como estaba."; fi
  if ! $REMOVE && ! serving_ours; then
    restore; die "https://$APP/ no sirve nuestra landing o /api/health no responde a través de ella; se ha dejado como estaba."
  fi
fi

if $REMOVE; then
  say "Devuelto: https://$APP/ vuelve a la app anterior ($(status "$APP" /)). (La red $NETWORK sigue conectada a $NGINX; no afecta a nada.)"
  exit 0
fi
serving_ours || die "https://$APP/ no sirve nuestra landing o /api/health no responde a través de ella."
say "https://$APP/ sirve Sepia: landing en /, la app en /entrar y /hoy, la API en /api ($(page /api/health))"
