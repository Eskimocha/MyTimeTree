#!/bin/zsh
# Launch AI Builder MCP with Node from ~/.local/node and token from project .env
set -euo pipefail

NODE_BIN="$HOME/.local/node/bin"
export PATH="$NODE_BIN:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${AI_BUILDER_TOKEN:-}" || "${AI_BUILDER_TOKEN}" == your_* ]]; then
  echo "AI_BUILDER_TOKEN missing or placeholder. Set it in $ROOT/.env" >&2
  exit 1
fi

exec "$NODE_BIN/mcp-coach-server"
