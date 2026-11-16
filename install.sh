#!/bin/sh
# KEEL — one-command install & run.
# Usage:
#   ./install.sh          install dependencies and start the dev server
#   ./install.sh --build  install dependencies and build for production
set -eu

cd "$(dirname "$0")"

# --- Node.js check ---
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed. Get it from https://nodejs.org (version 20 or newer), then run ./install.sh again."
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "KEEL needs Node.js 20 or newer (you have $(node --version)). Update Node from https://nodejs.org, then run ./install.sh again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm wasn't found alongside Node.js. Reinstall Node.js from https://nodejs.org, then run ./install.sh again."
  exit 1
fi

# --- Install dependencies ---
echo "Installing dependencies (this takes a minute the first time)..."
if [ -f package-lock.json ] && npm ci --no-audit --no-fund 2>/dev/null; then
  :
else
  # No lockfile, or the lockfile is out of sync with package.json —
  # fall back to a regular install, which repairs the lockfile.
  echo "Lockfile out of sync — running a full install to repair it..."
  npm install --no-audit --no-fund
fi

# --- Build only, if asked ---
if [ "${1:-}" = "--build" ]; then
  echo "Building for production..."
  npm run build
  echo ""
  echo "Build done. Preview it with: npm run preview"
  exit 0
fi

# --- Start the dev server ---
echo ""
echo "KEEL is ready — starting the dev server..."
echo "Open http://localhost:8080 in your browser. Press Ctrl+C to stop."
npm run dev
