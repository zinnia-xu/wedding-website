#!/bin/bash
# Run this any time you want to save a snapshot of the website.
# Usage: bash save-snapshot.sh "what changed"

MSG="${1:-Manual snapshot}"
cd "$(dirname "$0")"
git add -A
git diff --cached --quiet && echo "Nothing new to save." && exit 0
git commit -m "$MSG"
echo "✅ Saved: $MSG"
echo ""
git log --oneline -5
