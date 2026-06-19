#!/usr/bin/env bash
#
# Salt Check local dev launcher.
# Brings up MongoDB (if not already running), the FastAPI backend, and the Expo
# dev server. MongoDB is normally kept alive by the launchd agent
# (~/Library/LaunchAgents/com.saltcheck.mongodb.plist); this script starts it as
# a fallback if it's somehow down.
#
# Usage:  ./start.sh        (run from the saltcheck/ folder)
# Stop:   Ctrl+C stops Expo. The backend keeps running; re-run to reuse it.
#
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

is_up() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

echo "🧂 Salt Check — starting local stack…"

# 1) MongoDB (launchd usually handles this; start a fallback if down)
if is_up 27017; then
  echo "  ✓ MongoDB already running (27017)"
else
  echo "  • Starting MongoDB…"
  mkdir -p "$HOME/mongodb-logs"
  "$HOME/mongodb/bin/mongod" --dbpath "$HOME/mongodb-data" --port 27017 \
    --bind_ip 127.0.0.1 --fork --logpath "$HOME/mongodb-logs/mongod.log" >/dev/null
  echo "  ✓ MongoDB up"
fi

# 2) Backend (FastAPI / uvicorn) — background, logs to /tmp
if is_up 8001; then
  echo "  ✓ Backend already running (8001)"
else
  echo "  • Starting backend…"
  cd "$ROOT/backend"
  source .venv/bin/activate
  nohup python -m uvicorn server:app --host 0.0.0.0 --port 8001 \
    >/tmp/saltcheck-backend.log 2>&1 &
  # wait until it answers
  for _ in $(seq 1 20); do is_up 8001 && break; sleep 1; done
  echo "  ✓ Backend up (logs: /tmp/saltcheck-backend.log)"
fi

# 3) Expo dev server (foreground — shows the QR code)
echo "  • Starting Expo… scan the QR with Expo Go."
echo ""
cd "$ROOT/frontend"
exec corepack yarn expo start
