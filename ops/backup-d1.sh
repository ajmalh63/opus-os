#!/usr/bin/env bash
# backup-d1.sh — OpusOS D1 export → local archive (+ optional R2) → Kuma push
# Ownership: ops (Wave 5 DR). Uses the OFFICIAL path: `wrangler d1 export --remote`
# (Cloudflare docs 2026). Retention: keep the N newest archives (default 7).
# Optional envs: R2_BUCKET=opusos-vault  KUMA_PUSH_URL=https://<kuma>/api/push/<token>
# Schedule via cron/GitHub Actions; ping the heartbeat so silent failures surface.

set -euo pipefail

readonly SCRIPT_NAME=$(basename "$0")
readonly TS=$(date '+%Y%m%d-%H%M%S')
readonly DB_NAME="${D1_DB_NAME:-opusos-db}"
readonly BACKUP_DIR="${BACKUP_DIR:-./backups}"
readonly KEEP="${BACKUP_KEEP:-7}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]
Backs up the remote D1 database (\`wrangler d1 export --remote\`) into
\$BACKUP_DIR as gzipped SQL, prunes old archives, optionally uploads to R2
(R2_BUCKET set) and pings the Kuma heartbeat (KUMA_PUSH_URL set).

Env:
  D1_DB_NAME      D1 database name   (default: opusos-db)
  BACKUP_DIR      archive directory  (default: ./backups)
  BACKUP_KEEP     archives to keep   (default: 7)
  R2_BUCKET       upload each archive here, key d1/<name>
  KUMA_PUSH_URL   full Kuma push URL incl. token
Options:
  -h, --help      Show this help
EOF
}

push_heartbeat() { # status msg
  local url="${KUMA_PUSH_URL:-}"
  [ -z "$url" ] && return 0
  local ping=$(( $(date +%s) ))
  # shellcheck disable=SC2034
  curl -fsS "${url}${url%%\?*}" >/dev/null 2>&1 || true
  curl -fsS -G --data-urlencode "status=$1" --data-urlencode "msg=$2" --data-urlencode "ping=$ping" "${url}" >/dev/null 2>&1 || log "WARN: heartbeat ping failed (non-fatal)"
}

main() {
  local db
  db=$(command -v wrangler || command -v npx) || error "wrangler not on PATH"
  mkdir -p "$BACKUP_DIR" || error "cannot create $BACKUP_DIR"
  log "Exporting D1 '$DB_NAME' (remote)…"

  local archive="$BACKUP_DIR/d1-${TS}.sql.gz"
  # Export to a temp file first (the documented --output form), then gzip —
  # the stdout (-) form is not part of the stable contraction.
  local tmp
  tmp=$(mktemp -d) || error "cannot create temp dir"
  trap 'rm -rf "$tmp"' EXIT
  if command -v wrangler >/dev/null 2>&1; then
    wrangler d1 export "$DB_NAME" --remote --output "$tmp/export.sql" 2>/dev/null || error "d1 export failed"
  else
    npx wrangler d1 export "$DB_NAME" --remote --output "$tmp/export.sql" 2>/dev/null || error "d1 export failed"
  fi
  gzip -9 -c "$tmp/export.sql" > "$archive"
  [ -s "$archive" ] || { rm -f "$archive"; error "export produced an empty archive"; }
  log "Archived: $archive ($(du -h "$archive" | cut -f1))"

  # Retention: keep the $KEEP newest
  ls -1t "$BACKUP_DIR"/d1-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "$old" && log "Pruned: $old"
  done

  if [ -n "${R2_BUCKET:-}" ]; then
    log "Uploading to R2 bucket '${R2_BUCKET}'…"
    if command -v wrangler >/dev/null 2>&1; then
      wrangler r2 object put "${R2_BUCKET}/d1/$(basename "$archive")" --file="$archive" >/dev/null
    else
      npx wrangler r2 object put "${R2_BUCKET}/d1/$(basename "$archive")" --file="$archive" >/dev/null
    fi
    log "R2 upload complete."
  fi

  push_heartbeat "up" "d1-backup-ok"
  log "Backup complete."
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac
main "$@"