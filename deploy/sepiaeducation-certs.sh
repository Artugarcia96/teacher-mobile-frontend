#!/usr/bin/env bash
# Runs ON THE VPS. Renews the Let's Encrypt certificates that the sepia-education nginx serves (sepiaeducation.com, www
# and app), which nothing on the VPS renewed (app.sepiaeducation.com expired: ERR_CERT_DATE_INVALID), the way
# sepia-education got them: certbot with the webroot that its nginx serves on port 80 (/.well-known/acme-challenge/);
# then reloads that nginx. Called by «Deploy web» (backend repo, deploy-frontend.yml) before the web is published with
# app_sepiaeducation, or alone (renovar_certificados). It never edits the nginx config.
#
# Only the certificates nginx uses (ssl_certificate …/live/<name>/) are renewed, one at a time, each with
# `certbot certonly --webroot` for the names it already has: never an installer, hook or webroot map stored in their
# renewal settings, and one certificate that fails does not hold back the others. Any other certificate in the folder is
# listed and left alone.
#
#   bash sepiaeducation-certs.sh               shows how the certificates are set up, checks the challenge path for
#                                              every name, tries each renewal against Let's Encrypt's staging server (not
#                                              counted in its rate limits), renews what is due (within 30 days of expiry:
#                                              a valid certificate is not reissued), reloads nginx, shows the dates nginx
#                                              serves before and after, and installs the renewal job
#   bash sepiaeducation-certs.sh --cron        the renewal job (crontab, twice a day): renews what is due and reloads
#                                              nginx when something was renewed or it still serves a certificate that
#                                              expires within 30 days
#   bash sepiaeducation-certs.sh --remove-cron remove the renewal job
set -euo pipefail

NGINX=sepia-education-nginx-1
HOSTS=(sepiaeducation.com www.sepiaeducation.com app.sepiaeducation.com)
CERTBOT_IMAGE=certbot/certbot:v5.8.0           # pinned; a certbot/certbot image already on the VPS is used instead
PROD_ACCOUNTS=/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory
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

if $CRON; then
  mkdir -p "$(dirname "$LOG")"
  if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then  # in place: cron appends to this very file
    tail -n 1000 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"
  fi
fi

docker inspect "$NGINX" >/dev/null 2>&1 || die "No existe el contenedor $NGINX: no se toca nada."

# ── Where sepia-education keeps them: its nginx config (nginx -T, includes too) and the mounts of its container ──
NGINX_T="$(docker exec "$NGINX" nginx -T 2>/dev/null)" || die "nginx -T falla en $NGINX: no se toca nada."
NGINX_CODE="$(sed -E 's/^[[:space:]]*#.*$//' <<< "$NGINX_T" | tr -d "\"'")"   # without comment lines and quotes
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
LE_IN="$(grep -oE 'ssl_certificate[[:space:]]+[^;]*/live/' <<< "$NGINX_CODE" | head -n 1 | sed -E 's/^ssl_certificate[[:space:]]+//; s#/live/$##')"
LE_IN="${LE_IN:-/etc/letsencrypt}"
WEBROOT_IN="$(awk '/location[^{]*\/\.well-known\/acme-challenge/ { inside = 1 }
  inside && match($0, /(^|[ \t{;])(root|alias)[ \t]+[^;]+;/) {
    v = substr($0, RSTART, RLENGTH); sub(/^[ \t{;]*/, "", v); alias = (v ~ /^alias/)
    sub(/^(root|alias)[ \t]+/, "", v); sub(/;$/, "", v)
    if (alias) sub(/\/?\.well-known\/acme-challenge\/?$/, "", v)
    print v; exit
  }
  inside && /\}/ { inside = 0 }' <<< "$NGINX_CODE")"
WEBROOT_IN="${WEBROOT_IN:-/var/www/certbot}"
LE="$(host_path "$LE_IN")"
WEBROOT="$(host_path "$WEBROOT_IN")"
[ -n "$LE" ] && [ -d "$LE" ] || die "No encuentro en el host los certificados que usa $NGINX ($LE_IN): no se toca nada."
[ -n "$WEBROOT" ] && [ -d "$WEBROOT" ] || die "No encuentro en el host el webroot ACME de $NGINX ($WEBROOT_IN): no se toca nada."

# The certificates (lineages) nginx serves: only these are renewed.
mapfile -t LINEAGES < <(grep -oE 'ssl_certificate[[:space:]]+[^;]*/live/[^/;]+/' <<< "$NGINX_CODE" \
  | sed -E 's#.*/live/([^/]+)/$#\1#' | sort -u)
[ "${#LINEAGES[@]}" -gt 0 ] || die "No encuentro los certificados que usa $NGINX (ssl_certificate …/live/…): no se toca nada."

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
obtain() {  # obtain <lineage> <certbot flags…>: certonly with the webroot for the names that lineage already has. Its
            # key type and names stay; no installer, no hooks (nginx is reloaded here), no stored webroot map.
  local n="$1" d=() x
  shift
  for x in ${NAMES[$n]}; do d+=(-d "$x"); done
  certbot certonly --webroot -w /var/www/certbot --cert-name "$n" "${d[@]}" --no-directory-hooks \
    --non-interactive --agree-tos --register-unsafely-without-email "$@"
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

# The names of each certificate, as certbot has them ("Identifiers:", "Domains:" in older versions).
CERTS="$(certbot certificates 2>&1)" || { echo "$CERTS" | tail -n 5 >&2; die "certbot no funciona en un contenedor de $IMAGE: no se toca nada."; }
declare -A NAMES
while IFS='|' read -r n names; do NAMES[$n]="$names"; done < <(awk '
  /Certificate Name:/ { n = $NF }
  /(Domains|Identifiers):/ && n != "" { sub(/^.*(Domains|Identifiers):[ \t]*/, ""); print n "|" $0; n = "" }' <<< "$CERTS")
# The production account each one was issued with, when it is still there (with several accounts certbot would ask).
declare -A ACCOUNT
while read -r n id; do ACCOUNT[$n]="$id"; done < <(run_image sh -c '
  for n in "$@"; do
    id="$(sed -n "s/^account *= *//p" "/etc/letsencrypt/renewal/$n.conf" 2>/dev/null | head -n 1)"
    if [ -n "$id" ] && [ -d "'"$PROD_ACCOUNTS"'/$id" ]; then echo "$n $id"; fi
  done' sh "${LINEAGES[@]}" 2>/dev/null || true)
account_flag() { if [ -n "${ACCOUNT[$1]:-}" ]; then echo "--account ${ACCOUNT[$1]}"; fi; }

if $CRON; then
  before="$(certbot_certificates)"
  for n in "${LINEAGES[@]}"; do
    if [ -z "${NAMES[$n]:-}" ]; then echo "::error::$n: certbot no lo conoce o no lo da por bueno; no se renueva."; continue; fi
    say "$n (${NAMES[$n]}): solo si caduca en menos de 30 días"
    # shellcheck disable=SC2046
    obtain "$n" --keep-until-expiring $(account_flag "$n") || echo "::error::No se ha renovado $n (arriba, el motivo)."
  done
  need=false
  if [ "$(certbot_certificates)" != "$before" ]; then need=true; fi
  for h in "${HOSTS[@]}"; do   # a renewal whose reload failed before is reloaded now
    end="$(served "$h")"
    if [ -n "$end" ] && [ "$(days_left "$end")" -lt 30 ]; then need=true; fi
  done
  if $need; then
    say "Recargando nginx"
    reload_nginx || echo "::error::nginx no ha recargado: sigue sirviendo los certificados anteriores (se reintenta en la próxima pasada)."
  fi
  show_served
  exit 0
fi

say "Cómo tiene sepia-education sus certificados"
echo "Contenedor $NGINX: certificados en $LE_IN = $LE (host) · webroot ACME $WEBROOT_IN = $WEBROOT (host)"
stat -c '%U:%G %a %n' "$LE" "$LE"/live "$LE"/archive "$LE"/renewal "$LE"/accounts "$WEBROOT" 2>&1 || true
echo "certbot correrá como: $($AS_ME && echo "$(id -un) (los certificados son suyos)" || echo "root, en un contenedor (los certificados no son de $(id -un))")"
echo "Imagen de certbot: $IMAGE"
for n in "${LINEAGES[@]}"; do
  echo "nginx usa $n: ${NAMES[$n]:-(certbot no lo conoce o no lo da por bueno)}$([ -n "${ACCOUNT[$n]:-}" ] && echo " · cuenta ${ACCOUNT[$n]}" || true)"
done
grep -iE 'unexpected error|were invalid' <<< "$CERTS" | sed 's/^ */certbot: /' || true
for n in "${!NAMES[@]}"; do
  if [[ " ${LINEAGES[*]} " != *" $n "* ]]; then echo "Otro certificado en la carpeta, que nginx no usa (no se toca): $n (${NAMES[$n]})"; fi
done
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
  grep -E "^(authenticator|webroot_path|server|installer|account|[a-z_]*_hook) *=|^\[\[webroot_map\]\]|^[a-z0-9.-]+ *= */" "$f" | sed "s/^/  /"; done
  ls /etc/letsencrypt/accounts/*/directory 2>/dev/null | sed "s/^/  cuentas: /"
  for d in pre deploy post; do ls "/etc/letsencrypt/renewal-hooks/$d" 2>/dev/null | sed "s#^#  renewal-hooks/$d (no se ejecutan): #"; done' \
  2>/dev/null || true

# A copy of their renewal settings before certbot rewrites them (a renewal saves the method and account it used).
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

say "Comprobando que el puerto 80 sirve el webroot para cada nombre"
declare -A PROBED
for n in "${LINEAGES[@]}"; do for h in ${NAMES[$n]:-}; do PROBED[$h]=""; done; done
for h in "${HOSTS[@]}"; do PROBED[$h]=""; done
PROBE="sepia-cuaderno-probe-$(date +%s)-$RANDOM"
run_image sh -c "mkdir -p /var/www/certbot/.well-known/acme-challenge && echo $PROBE > /var/www/certbot/.well-known/acme-challenge/$PROBE"
for h in $(printf '%s\n' "${!PROBED[@]}" | sort); do
  local_answer="$(curl -s --max-time 10 -H "Host: $h" "http://127.0.0.1/.well-known/acme-challenge/$PROBE" || true)"
  public_answer="$(curl -s --max-time 10 "http://$h/.well-known/acme-challenge/$PROBE" || true)"
  printf '%s: desde el propio VPS %s · por su nombre público %s\n' "$h" \
    "$([ "$local_answer" = "$PROBE" ] && echo bien || echo MAL)" "$([ "$public_answer" = "$PROBE" ] && echo bien || echo MAL)"
  [ "$local_answer" = "$PROBE" ] && PROBED[$h]=ok
  if [ "$public_answer" != "$PROBE" ]; then
    echo "  ::warning::$h no llega a este VPS por su nombre público (DNS o IPv6): $(getent ahosts "$h" | awk '{ print $1 }' | sort -u | tr '\n' ' ')"
  fi
done
run_image rm -f "/var/www/certbot/.well-known/acme-challenge/$PROBE"

failed=()     # "<lineage> (<why>)"
ready=()      # lineages whose names the port-80 server serves
for n in "${LINEAGES[@]}"; do
  if [ -z "${NAMES[$n]:-}" ]; then failed+=("$n (certbot no lo conoce o no lo da por bueno)"); continue; fi
  bad=""
  for h in ${NAMES[$n]}; do [ "${PROBED[$h]}" = ok ] || bad="$bad $h"; done
  if [ -n "$bad" ]; then failed+=("$n (el puerto 80 no sirve el webroot para$bad)"); else ready+=("$n"); fi
done
[ "${#ready[@]}" -gt 0 ] || die "Nada que pedir a Let's Encrypt:$(printf ' %s;' "${failed[@]}")"

say "Antes"
certbot_certificates
show_served

say "Prueba de cada certificado contra el servidor de pruebas de Let's Encrypt (no cuenta para sus límites)"
tested=()
for n in "${ready[@]}"; do
  echo "-- $n (${NAMES[$n]})"
  if obtain "$n" --dry-run; then tested+=("$n"); else failed+=("$n (falla la prueba: arriba, el motivo)"); fi
done

say "Renovando los que caducan en menos de 30 días"
for n in "${tested[@]}"; do
  echo "-- $n"
  # shellcheck disable=SC2046
  obtain "$n" --keep-until-expiring $(account_flag "$n") || failed+=("$n (falla la renovación: arriba, el motivo)")
done
say "Recargando nginx (lee los certificados al recargar)"
reload_nginx || failed+=("recarga de nginx (sigue sirviendo los certificados anteriores)")
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

[ "${#failed[@]}" -eq 0 ] || die "No se ha renovado todo:$(printf ' %s;' "${failed[@]}") No lo relances en bucle: Let's Encrypt limita los intentos fallidos."
[ -z "$short" ] || die "Siguen caducando en menos de 10 días:$short (arriba, el motivo)."
say "Certificados al día"
