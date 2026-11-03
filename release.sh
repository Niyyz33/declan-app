#!/bin/bash
# One command to ship an update: tests, stamps a fresh version (so phones never run stale code),
# commits and pushes to GitHub Pages. Usage: ./release.sh "what changed"
set -e
cd "$(dirname "$0")"
node deductions.test.js
node --check app.js && node --check sw.js
V="$(date +%Y.%m.%d.%H%M)"
sed -i '' "s/APP_VERSION: '[^']*'/APP_VERSION: '$V'/" config.js
sed -i '' "s/declan-app-[A-Za-z0-9.]*'/declan-app-$V'/" sw.js
git add -A
git commit -m "${1:-Update} (v$V)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
echo "Released v$V"
