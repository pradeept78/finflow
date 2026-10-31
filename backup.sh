#!/bin/bash
# FinFlow Auto Backup — dumps the DOCKER MySQL container's database (finflow-mysql).
#
# This does NOT cover a native MySQL install used via `application-local.yml` for local
# development; that is a separate database this script never touches.
#
# Credentials come from the container's own environment (set from .env when it was created), not
# from .env here. That keeps the script self-contained, so the nightly job can run an installed copy
# outside ~/Downloads, which macOS blocks background jobs from reading. Install: RUNNING.md › Backup.
# (The password used to be hardcoded here as 'finflow123'; rotating it would have silently broken
# every nightly backup with no error until you needed to restore one.)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/finflow-backups}"
DATE=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/finflow_$DATE.sql"
mkdir -p "$BACKUP_DIR"

# Write to a temp name first so a failed dump never counts as one of the seven kept backups.
docker exec finflow-mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -u"$MYSQL_USER" \
  --no-tablespaces --single-transaction --column-statistics=0 "$MYSQL_DATABASE"' > "$OUT.part"
grep -q '^-- Dump completed' "$OUT.part" || { echo "Backup incomplete: $OUT.part" >&2; exit 1; }
mv "$OUT.part" "$OUT"

# Keep only the last 7 backups.
ls -t "$BACKUP_DIR"/finflow_*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "Backup done: $OUT"
