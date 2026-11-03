#!/bin/sh
# Render's free plan has no persistent disk, so the container starts with an
# empty filesystem on every deploy and restart. The image therefore ships a
# snapshot of a real workspace (seed/contextbridge.db) and this script copies it
# into place the first time the container boots, before the server starts.
#
# With a persistent disk mounted, the database already exists and this is a
# no-op — new writes are never overwritten.

set -e

DATA_DB="${CONTEXTBRIDGE_DB:-/app/data/contextbridge.db}"
SEED_DB="${SEED_DB:-/app/seed/contextbridge.db}"

case "$DATA_DB" in
  :memory:*)
    ;;
  *)
    if [ -f "$SEED_DB" ] && [ ! -s "$DATA_DB" ]; then
      mkdir -p "$(dirname "$DATA_DB")"
      cp "$SEED_DB" "$DATA_DB"
      echo "Seeded workspace data from $SEED_DB"
    fi
    ;;
esac

exec node server.js
