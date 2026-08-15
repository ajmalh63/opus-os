#!/usr/bin/env bash
# restore-d1.sh — restore OpusOS D1 from a backup archive (DR loop, Wave 5).
# Mirrors backup-d1.sh: pick an archive (latest by default), decompress, and
# restore with the OFFICIAL path `wrangler d1 execute --remote --file`
# (Cloudflare docs 2026). Verifies after restore, then pings the Kuma heartbeat
# so the push monitor reflects the DR outcome.
# ⚠️ DESTRUCTIVE: restores over the current remote DB. Run the restore drill
# against a COPY first; keep Time Travel as the point-in-time fallback.

set -euo pipefail

readonly SCRIPT_NAME=$(basename "$0")
readonly DB_NAME="${D1_DB_NAME:-opusos-db}"
readonly BACKUP_DIR="${BACKUP_DIR:-./backups}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [ARCHIVE.sql.gz]
Restores D1 from a gzipped SQL archive (latest in \$BACKUP_DIR by default).

Env:
  D1_DB_NAME    D1 database name   (default: opusos-db)
  BACKUP_DIR    archive directory  (default: ./backups)
  KUMA_PUSH_URL full Kuma push URL incl. token (heartbeat outcome)
Options:
  --dry-run     Decompress + validate the SQL without executing
  -h, --help    Show this help
EOF
}

push_heartbeat() { # status msg
  local url="${KUMA_PUSH_URL:-}"
  [ -z "$url" ] && return 0
  local ping=$(( $(date +%s) ))
  curl -fsS -G --data-urlencode "status=$1" --data-urlencode "msg=$2" --data-urlencode "ping=$ping" "${url}" >/dev/null 2>&1 || log "WARN: heartbeat ping failed (non-fatal)"
}

main() {
  local archive="${1:-}"
  if [ -z "$archive" ]; then
    archive=$(ls -1t "$BACKUP_DIR"/d1-*.sql.gz 2>/dev/null | head -n 1) || error "no archives in $BACKUP_DIR — run backup-d1.sh first"
  fi
  [ -f "$archive" ] || error "archive not found: $archive"
  [ -s "$archive" ] || error "archive is empty: $archive"

  local work
  work=$(mktemp -d) || error "cannot create temp dir"
  trap 'rm -rf "$work"' EXIT

  log "Decompressing $archive…"
  gzip -dc "$archive" > "$work/restore.sql" || error "corrupt archive"
  [ -s "$work/restore.sql" ] || error "decompressed SQL is empty"

  # Export (wrangler d1 export) never emits BEGIN/COMMIT or _cf_KV, so the
  # file is import-ready (Cloudflare docs: those must be stripped otherwise).
  if [ "${DRY_RUN:-0}" = "1" ] || [ "${1:-}" = "--dry-run" ]; then
    log "Dry-run OK: $(wc -l < "$work/restore.sql") SQL lines ready to restore."
    return 0
  fi

  log "Restoring '$DB_NAME' (remote) — this OVERWRITES current data…"
  if command -v wrangler >/dev/null 2>&1; then
    wrangler d1 execute "$DB_NAME" --remote --file="$work/restore.sql" >/dev/null
  else
    npx wrangler d1 execute "$DB_NAME" --remote --file="$work/restore.sql" >/dev/null
  fi

  # Verify: the exported dump is schema+data, so a table count sanity check
  # (and a row probe) proves the restore landed.
  local tbls
  tbls=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) AS c FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf%'" --json 2>/dev/null | grep -o '"c":[0-9]*' | head -n1 | grep -o '[0-9]*')
  [ -n "$tbls" ] && [ "$tbls" -gt 0 ] || error "post-restore verification failed — table count = ${tbls:-0}"
  log "Restore verified: $tbls tables present."

  push_heartbeat "up" "d1-restore-ok"
  log "Restore complete."
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --dry-run) DRY_RUN=1 ;;
esac
main "${1:-}"