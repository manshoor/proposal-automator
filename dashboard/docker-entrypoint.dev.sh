#!/bin/sh
set -e

echo "[entrypoint] Checking dependencies..."

# Check for a known package directory — most reliable indicator
if [ ! -d "/app/node_modules/next" ]; then
  echo "[entrypoint] Installing dependencies (this may take a moment)..."
  cd /app
  npm install
  echo "[entrypoint] Done."
else
  echo "[entrypoint] Dependencies present."
fi

exec "$@"
