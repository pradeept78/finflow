#!/bin/bash
# Run for local (non-Docker) backend runs, once per fresh terminal:
#
#   source local-env.sh
#   cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=local
#
# Deliberately exports ONLY JWT_SECRET / JWT_EXPIRATION from .env — never the SPRING_DATASOURCE_*
# vars. Those live in application-local.yml instead (root / 127.0.0.1:3306 for your native MySQL).
# If SPRING_DATASOURCE_* ever end up in your shell environment too (e.g. from `set -a && . ./.env`,
# which pulls in everything), they will silently override application-local.yml — env vars always
# outrank profile-specific yaml files in Spring's property precedence. That's what caused the
# "Communications link failure" / "Access denied for user 'finflow'@'localhost'" errors earlier:
# the app was quietly using Docker's datasource credentials against your native database.
#
# NOTE: must be `source`d (not executed) so the exports land in your current shell, not a
# throwaway subshell. Run it from anywhere — the path below is absolute, so cwd doesn't matter.

ENV_FILE="/Users/Pradeep_1/Downloads/finflow-clean/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env at $ENV_FILE — copy .env.example and fill it in first." >&2
  return 1 2>/dev/null || exit 1
fi

export JWT_SECRET=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)
export JWT_EXPIRATION=$(grep '^JWT_EXPIRATION=' "$ENV_FILE" | cut -d= -f2-)

if [ -z "$JWT_SECRET" ]; then
  echo "JWT_SECRET came back empty — check it's actually set in $ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi
if [ -z "$JWT_EXPIRATION" ]; then
  echo "JWT_EXPIRATION came back empty — check it's actually set in $ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi

echo "JWT_SECRET set (${#JWT_SECRET} chars), JWT_EXPIRATION=$JWT_EXPIRATION"
echo "SPRING_DATASOURCE_* left untouched — application-local.yml owns those for local runs."
