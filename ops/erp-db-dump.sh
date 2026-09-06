#!/usr/bin/env bash
# erp-db-dump.sh — ERPNext (Frappe) DB dump on the VPS → gzip archive → Kuma push
# Runs on the VPS (<internal-ip>) where the ERP docker stack lives. Uses
# `docker compose exec` against the mariadb container (loopback-only DB).
# Optional envs: ERP_DB=erpnext (database), ERP_DB_USER (default erpnext),
# ERP_DB_PASS (required — set in the caller's env), KUMA_PUSH_URL.
# Schedule via VPS cron (e.g. nightly 02:00); ping the heartbeat on success.

set -euo pipefail

readonly SCRIPT_NAME=$(basename "$0")
readonly TS=$(date '+%Y%m%d-%H%M%S')
readonly STACK_DIR="${ERP_STACK_DIR:-/home/ubuntu/services/erpnext}"
readonly BACKUP_DIR="${BACKUP_DIR:-./backups}"
readonly KEEP="${BACKUP_KEEP:-7}"
readonly DB_NAME="${ERP_DB:-erpnext}"
readonly DB_USER="${ERP_DB_USER:-erpnext}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]
Dumps the ERPNext database (mysqldump via docker compose exec) into
\$BACKUP_DIR as a gzipped SQL archive, prunes old archives, pings the
Kuma heartbeat when KUMA_PUSH_URL is set.

Env:
  ERP_STACK_DIR    compose dir        (default: /home/ubuntu/services/erpnext)
  BACKUP_DIR       archive directory  (default: ./backups)
  BACKUP_KEEP      archives to keep   (default: 7)
  ERP_DB           database name      (default: erpnext)
  ERP_DB_USER      db user            (default: erpnext)
  ERP_DB_PASS      db password        (REQUIRED)
  KUMA_PUSH_URL    full Kuma push URL incl. token
Options:
  -h, --help       Show this help
EOF
}

push_heartbeat() {
  local url="${KUMA_PUSH_URL:-}"
  [ -z "$url" ] && return 0
  local ping=$(( $(date +%s) ))
  curl -fsS -G --data-urlencode "status=$1" --data-urlencode "msg=$2" --data-urlencode "ping=$ping" "${url}" >/dev/null 2>&1 || log "WARN: heartbeat ping failed (non-fatal)"
}

main() {
  [ -n "${ERP_DB_PASS:-}" ] || error "ERP_DB_PASS is required"
  [ -d "$STACK_DIR" ] || error "stack dir not found: $STACK_DIR"
  mkdir -p "$BACKUP_DIR" || error "cannot create $BACKUP_DIR"
  log "Dumping ERPNext DB '$DB_NAME' from $STACK_DIR…"

  local archive="$BACKUP_DIR/erp-db-${TS}.sql.gz"
  # DB is loopback-only by design; dump from inside the compose network.
  # shellcheck disable=SC2016
  docker compose -f "$STACK_DIR/docker-compose.yml" exec -T -e MYSQL_PWD="$ERP_DB_PASS" \
    db sh -c "mysqldump --single-transaction --quick -u'$DB_USER' '$DB_NAME'" 2>/dev/null | gzip -9 > "$archive"
  [ -s "$archive" ] || { rm -f "$archive"; error "dump produced an empty archive"; }
  log "Archived: $archive ($(du -h "$archive" | cut -f1))"

  ls -1t "$BACKUP_DIR"/erp-db-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "$old" && log "Pruned: $old"
  done

  push_heartbeat "up" "erp-db-backup-ok"
  log "Backup complete."
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac
main "$@"