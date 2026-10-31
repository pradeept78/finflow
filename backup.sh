#!/bin/bash
# FinFlow Auto Backup — dumps the DOCKER MySQL container's database (finflow-mysql).
#
# This does NOT cover a native MySQL install used via `application-local.yml` for local
# development; that is a separate database this script never touches. If your real data lives
# there instead of in Docker, back it up separately with a plain `mysqldump` against localhost:3306.
#
# Install as a cron job pointing at THIS PATH (not a copy in $HOME — see REPO_DIR below):
#   0 2 * * * /path/to/finflow-clean/backup.sh
set -euo pipefail

# cron runs with a minimal environment and an unpredictable cwd, so this cannot assume it starts
# in the repo. Resolve the script's own directory instead, which is where .env actually lives.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env at $ENV_FILE — copy .env.example and fill it in first." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a && . "$ENV_FILE" && set +a

: "${MYSQL_USER:?MYSQL_USER not set in .env}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not set in .env}"
: "${MYSQL_DATABASE:=finflow}"

BACKUP_DIR="${BACKUP_DIR:-$HOME/finflow-backups}"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# The password used to be hardcoded here as 'finflow123' — the exact value baked into the repo
# before secrets were externalised. Rotating it in .env alone would have silently broken every
# nightly backup from that day on, with no error until you actually needed to restore one.
docker exec finflow-mysql mysqldump \
  -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  --no-tablespaces --single-transaction --column-statistics=0 \
  "$MYSQL_DATABASE" > "$BACKUP_DIR/finflow_$DATE.sql"

# Keep only the last 7 backups.
ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "Backup done: $BACKUP_DIR/finflow_$DATE.sql"
