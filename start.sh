#!/bin/sh
# Start Tavern Screen on a machine that has Node 20 or newer (22 recommended).
# First run installs the packages; later runs start straight away.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is needed. Install it from https://nodejs.org, or use the Docker image (see README)." >&2
  exit 1
fi
if [ ! -d node_modules ]; then npm ci --omit=dev; fi
exec node server.js
