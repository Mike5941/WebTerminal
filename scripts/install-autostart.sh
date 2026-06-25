#!/bin/sh
# Install the WebTerminal launchd agent so the server starts at login (macOS).
# Resolves this repo's path automatically — no manual editing needed.
#
# Usage:   sh scripts/install-autostart.sh
# Remove:  launchctl unload ~/Library/LaunchAgents/local.webterminal.plist
#          rm ~/Library/LaunchAgents/local.webterminal.plist

set -eu

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATE="$REPO_DIR/scripts/webterminal-launchd.plist.template"
AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET="$AGENTS_DIR/local.webterminal.plist"

if [ ! -f "$TEMPLATE" ]; then
  echo "template not found: $TEMPLATE" >&2
  exit 1
fi

mkdir -p "$AGENTS_DIR"

# Substitute the placeholder with this machine's actual repo path.
sed "s|__WEBTERMINAL_DIR__|$REPO_DIR|g" "$TEMPLATE" > "$TARGET"

# Ensure dependencies are installed
echo "Installing dependencies..."
(cd "$REPO_DIR" && npm install)

# Reload if already installed.
launchctl unload "$TARGET" 2>/dev/null || true
launchctl load "$TARGET"

echo "Installed and loaded: $TARGET"
echo "WebTerminal will start at login on http://127.0.0.1:3000"
