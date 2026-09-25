#!/usr/bin/env bash
# Runs ON THE VPS. Renews the Let's Encrypt certificates of sepiaeducation.com, www and app, which nothing on the VPS
# renewed (app.sepiaeducation.com expired: ERR_CERT_DATE_INVALID), the way sepia-education got them: certbot with the
# webroot that its nginx serves on port 80 (/.well-known/acme-challenge/); then reloads that nginx. Called by «Deploy
# web» (backend repo, deploy-frontend.yml) before sepiaeducation-app.sh (app_sepiaeducation), or alone
# (renovar_certificados). It never edits the nginx config.
#
#   bash sepiaeducation-certs.sh               shows how the certificates are set up, checks the challenge path, tries a
#                                              renewal against Let's Encrypt's staging server (not counted in its rate
#                                              limits), renews what is due (certbot renew: within 30 days of expiry;
#                                              a valid certificate is not reissued), reloads nginx, shows the dates
#                                              nginx serves before and after, and installs the renewal job
#   bash sepiaeducation-certs.sh --cron        the renewal job (crontab, twice a day): renew what is due and reload nginx
#                                              only if something was renewed
#   bash sepiaeducation-certs.sh --remove-cron remove the renewal job
set -euo pipefail

NGINX=sepia-education-nginx-1
HOSTS=(sepiaeducation.com www.sepiaeducation.com app.sepiaeducation.com)
CERTBOT_IMAGE=certbot/certbot:v5.8.0           # pinned; a certbot/certbot image already on the VPS is used instead
APP_DIR="$HOME/sepia-cuaderno"
BACKUPS="$APP_DIR/backups"
JOB="$APP_DIR/bin/sepiaeducation-certs.sh"      # the copy the renewal job runs
LOG="$APP_DIR/logs/certs.log"
MARK='# sepia-cuaderno-certs'
CRON_LINE="23 4,16 * * * bash $JOB --cron >> $LOG 2>&1 $MARK"

say() { printf '\n== %s%s\n' "$($CRON && date -u '+%F %T UTC · ' || true)" "$*"; }
die() { echo "::error::$*" >&2; exit 1; }

CRON=false
case "${1:-}" in
  "") ;;
  --cron) CRON=true ;;
  --remove-cron)
    current="$(crontab -l 2>/dev/null || true)"
    if printf '%s\n' "$current" | grep -qF "$MARK"; then
      printf '%s\n' "$current" | { grep -vF "$MARK" || true; } | crontab -
      echo "Tarea de renovación quitada del crontab."
    else
      echo "No había tarea de renovación de sepia-cuaderno."
    fi
    rm -f "$JOB"
    exit 0 ;;
  *) die "uso: sepiaeducation-certs.sh [--cron | --remove-cron]" ;;
esac

docker inspect "$NGINX" >/dev/null 2>&1 || die "No existe el contenedor $NGINX: no se toca nada."

# ── Where sepia-education keeps them: its nginx config (nginx -T, includes too) and the mounts of its container ──
NGINX_T="$(docker exec "$NGINX" nginx -T 2>/dev/null)" || die "nginx -T falla en $NGINX: no se toca nada."
mounts() { docker inspect "$NGINX" --format '{{range .Mounts}}{{.Destination}}|{{.Source}}{{"\n"}}{{end}}'; }
host_path() {  # host_path <path in the nginx container>: the host path behind it (longest mount prefix), or nothing
  local best="" src="" d s
  while IFS='|' read -r d s; do
    [ -n "$d" ] || continue
    if [ "$1" = "$d" ] || [[ "$1" == "$d"/* ]]; then
      if [ "${#d}" -gt "${#best}" ]; then best="$d"; src="$s"; fi
    fi
  done < <(mounts)
  [ -z "$best" ] || printf '%s%s\n' "$src" "${1#"$best"}"
}
LE_IN="$(grep -oE 'ssl_certificate[ \t]+[^;]*/live/' <<< "$NGINX_T" | head -n 1 | sed -E 's/^ssl_certificate[ \t]+//; s#/live/$##')"
LE_IN="${LE_IN:-/etc/letsencrypt}"
WEBROOT_IN="$(awk '/location[^{]*\/\.well-known\/acme-challenge/ { inside = 1 }
  inside && match($0, /(^|[ \t{;])(root|alias)[ \t]+[^;]+;/) {
    v = substr($0, RSTART, RLENGTH); sub(/^[ \t{;]*/, "", v); alias = (v ~ /^alias/)
    sub(/^(root|alias)[ \t]+/, "", v); sub(/;$/, "", v)
    if (alias) sub(/\/?\.well-known\/acme-challenge\/?$/, "", v)
    print v; exit
  }
  inside && /\}/ { inside = 0 }' <<< "$NGINX_T")"
WEBROOT_IN="${WEBROOT_IN:-/var/www/certbot}"
LE="$(host_path "$LE_IN")"
WEBROOT="$(host_path "$WEBROOT_IN")"
[ -n "$LE" ] && [ -d "$LE" ] || die "No encuentro en el host los certificados que usa $NGINX ($LE_IN): no se toca nada."
[ -n "$WEBROOT" ] && [ -d "$WEBROOT" ] || die "No encuentro en el host el webroot ACME de $NGINX ($WEBROOT_IN): no se toca nada."

# certbot runs as this user when the certificates and the webroot are ours, as root (in its container: the docker group
# allows it) when not.
AS_ME=false
if [ -O "$LE" ] && [ -w "$LE" ] && [ -w "$WEBROOT" ] && { [ ! -e "$LE/live" ] || [ -O "$LE/live" ]; } \
    && { [ ! -e "$LE/archive" ] || [ -O "$LE/archive" ]; }; then
  AS_ME=true
fi
IMAGE="$(docker image ls certbot/certbot --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -v ':<none>$' | head -n 1 || true)"
IMAGE="${IMAGE:-$CERTBOT_IMAGE}"

run_image() {  # run_image <entrypoint> <args>: a throwaway certbot container with sepia-education's certificates and webroot
  local entry="$1" user=()
  shift
  if $AS_ME; then user=(--user "$(id -u):$(id -g)"); fi
  docker run --rm "${user[@]}" -v "$LE:/etc/letsencrypt" -v "$WEBROOT:/var/www/certbot" --entrypoint "$entry" "$IMAGE" "$@"
}
certbot() {  # as this user, certbot needs its work and log folders somewhere writable (root has them in the image)
  if $AS_ME; then run_image certbot "$@" --work-dir /tmp/certbot --logs-dir /tmp/certbot; else run_image certbot "$@"; fi
}
certbot_certificates() {  # name, identifiers and expiry of each certificate (certbot certificates, no secrets)
  certbot certificates 2>&1 | grep -E 'Certificate Name|Domains|Identifiers|Expiry Date|No certificates' | sed 's/^ *//'
}
served() {  # served <host>: the certificate nginx gives for that name (SNI on 127.0.0.1:443): its expiry, or nothing
  { timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$1" </dev/null 2>/dev/null || true; } \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true
}
days_left() { echo $(( ($(date -d "$1" +%s) - $(date +%s)) / 86400 )); }
show_served() {
  local h end
  for h in "${HOSTS[@]}"; do
    end="$(served "$h")"
    if [ -n "$end" ]; then echo "$h: caduca $end ($(days_left "$end") días)"; else echo "$h: sin certificado en 443"; fi
  done
}
reload_nginx() { docker exec "$NGINX" nginx -t -q && docker exec "$NGINX" nginx -s reload; }

if $CRON; then
  mkdir -p "$(dirname "$LOG")"
  if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then  # in place: cron appends to this very file
    tail -n 1000 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"
  fi
  before="$(certbot_certificates)"
  say "certbot renew"
  certbot renew --webroot -w /var/www/certbot --non-interactive --agree-tos || echo "certbot renew ha fallado (arriba, el motivo)."
  if [ "$(certbot_certificates)" != "$before" ]; then
    say "Renovado: recargando nginx"
    reload_nginx
  fi
  show_served
  exit 0
fi

say "Cómo tiene sepia-education sus certificados"
echo "Contenedor $NGINX: certificados en $LE_IN = $LE (host) · webroot ACME $WEBROOT_IN = $WEBROOT (host)"
stat -c '%U:%G %a %n' "$LE" "$LE"/live "$LE"/archive "$LE"/renewal "$LE"/accounts "$WEBROOT" 2>&1 || true
echo "certbot correrá como: $($AS_ME && echo "$(id -un) (los certificados son suyos)" || echo "root, en un contenedor (los certificados no son de $(id -un))")"
echo "Imagen de certbot: $IMAGE"
for f in "$HOME"/sepia-education/docker-compose*.y*ml "$HOME"/sepia-education/compose*.y*ml; do
  [ -f "$f" ] || continue
  if grep -qE '^[[:space:]]+certbot:' "$f"; then
    echo "Servicio certbot en $f:"
    awk '/^[[:space:]]+certbot:/ { on = 1; print; next } on && /^  [A-Za-z0-9_-]+:/ { exit } on' "$f"
  fi
done
docker ps -a --filter name=certbot --format 'Contenedor {{.Names}} ({{.Image}}): {{.Status}}' || true
crontab -l 2>/dev/null | grep -i certbot | sed 's/^/crontab: /' || true
for f in /etc/cron.d/*certbot*; do [ -e "$f" ] && echo "$f"; done
systemctl list-timers --all 2>/dev/null | grep -i certbot || true
run_image sh -c 'for f in /etc/letsencrypt/renewal/*.conf; do [ -f "$f" ] || continue; echo "$f:"
  grep -E "^(authenticator|webroot_path|server|installer) *=|^\[\[webroot_map\]\]|^[a-z0-9.-]+ *= */" "$f" | sed "s/^/  /"; done' \
  2>/dev/null || true

# A copy of their renewal settings before certbot rewrites them (it saves the webroot method it is given).
mkdir -p "$BACKUPS"
chmod 700 "$BACKUPS"
RENEWAL_COPY="$BACKUPS/letsencrypt-renewal.$(date -u +%Y%m%dT%H%M%SZ)"
if [ -r "$LE/renewal" ] && cp -r "$LE/renewal" "$RENEWAL_COPY" 2>/dev/null; then
  echo "Copia de renewal/: $RENEWAL_COPY"
else
  rm -rf "$RENEWAL_COPY"
  docker run --rm -v "$LE:/le:ro" -v "$BACKUPS:/backups" --entrypoint sh "$IMAGE" -c \
    "cp -r /le/renewal /backups/$(basename "$RENEWAL_COPY") && chown -R $(id -u):$(id -g) /backups/$(basename "$RENEWAL_COPY")" \
    && echo "Copia de renewal/: $RENEWAL_COPY" || echo "::warning::No he podido copiar renewal/ (sigo: certbot no borra nada)."
fi

say "Comprobando que el puerto 80 sirve el webroot para los tres nombres"
PROBE="sepia-cuaderno-probe-$(date +%s)-$RANDOM"
run_image sh -c "mkdir -p /var/www/certbot/.well-known/acme-challenge && echo $PROBE > /var/www/certbot/.well-known/acme-challenge/$PROBE"
failed=""
for h in "${HOSTS[@]}"; do
  local_answer="$(curl -s --max-time 10 -H "Host: $h" "http://127.0.0.1/.well-known/acme-challenge/$PROBE" || true)"
  public_answer="$(curl -s --max-time 10 "http://$h/.well-known/acme-challenge/$PROBE" || true)"
  printf '%s: desde el propio VPS %s · por su nombre público %s\n' "$h" \
    "$([ "$local_answer" = "$PROBE" ] && echo bien || echo MAL)" "$([ "$public_answer" = "$PROBE" ] && echo bien || echo MAL)"
  [ "$local_answer" = "$PROBE" ] || failed="$failed $h"
  if [ "$public_answer" != "$PROBE" ]; then
    echo "  ::warning::$h no llega a este VPS por su nombre público (DNS o IPv6): $(getent ahosts "$h" | awk '{ print $1 }' | sort -u | tr '\n' ' ')"
  fi
done
run_image rm -f "/var/www/certbot/.well-known/acme-challenge/$PROBE"
[ -z "$failed" ] || die "El servidor del puerto 80 no sirve el webroot para:$failed. No se pide nada a Let's Encrypt."

say "Antes"
certbot_certificates
show_served

say "Prueba contra el servidor de pruebas de Let's Encrypt (no cuenta para sus límites)"
if ! certbot renew --dry-run --webroot -w /var/www/certbot --no-random-sleep-on-renew --non-interactive --agree-tos \
    --register-unsafely-without-email; then
  die "La prueba falla (arriba, el motivo): no se pide nada al servidor real. No lo relances en bucle: Let's Encrypt limita los intentos fallidos."
fi

say "Renovando los que caducan en menos de 30 días"
renew_ok=true
certbot renew --webroot -w /var/www/certbot --no-random-sleep-on-renew --non-interactive --agree-tos || renew_ok=false
say "Recargando nginx (lee los certificados al recargar)"
reload_nginx
sleep 2

say "Después"
certbot_certificates
show_served
short=""
for h in "${HOSTS[@]}"; do
  end="$(served "$h")"
  if [ -n "$end" ] && [ "$(days_left "$end")" -lt 10 ]; then short="$short $h"; fi
done

# The renewal job: this script, copied where it stays, twice a day (as certbot's own timer) unless an equivalent exists.
say "Renovación automática"
if ! command -v crontab >/dev/null; then
  echo "::warning::No hay crontab en el VPS: la renovación automática no queda instalada (docs/DEPLOY.md)."
else
  mkdir -p "$(dirname "$JOB")" "$(dirname "$LOG")"
  if ! cmp -s "${BASH_SOURCE[0]}" "$JOB"; then cp "${BASH_SOURCE[0]}" "$JOB"; fi
  current="$(crontab -l 2>/dev/null || true)"
  other="$(printf '%s\n' "$current" | grep -vF "$MARK" | grep -v '^[[:space:]]*#' | grep -i certbot | grep -iE 'nginx.*reload|reload.*nginx' || true)"
  if [ -n "$other" ]; then
    echo "Ya hay una tarea equivalente en el crontab; no se añade otra:"
    echo "$other"
  elif printf '%s\n' "$current" | grep -qxF "$CRON_LINE"; then
    echo "La tarea ya estaba: $CRON_LINE"
  else
    { if [ -n "$current" ]; then printf '%s\n' "$current" | grep -vF "$MARK" || true; fi; echo "$CRON_LINE"; } | crontab -
    echo "Instalada en el crontab de $(id -un): $CRON_LINE"
  fi
fi

$renew_ok || die "certbot renew ha fallado para algún certificado (arriba, el motivo)."
[ -z "$short" ] || die "Siguen caducando en menos de 10 días:$short (arriba, el motivo)."
say "Certificados al día"
