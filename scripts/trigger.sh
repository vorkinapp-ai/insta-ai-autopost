#!/bin/bash
# Starts the right GitHub Actions job (GitHub's own cron never fired for this repo, so the Mac kicks it off).
# Usage: scripts/trigger.sh quote|health|story|engage   — the jobs themselves skip if already posted (--if-due).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO=vorkinapp-ai/insta-ai-autopost
case "$1" in
  quote)  gh workflow run "Daily cards" --repo $REPO -f type=quote ;;
  health) gh workflow run "Daily cards" --repo $REPO -f type=health ;;
  story)  gh workflow run "Daily Telugu story" --repo $REPO ;;
  engage) gh workflow run "Reply to comments" --repo $REPO ;;
  *) echo "usage: $0 quote|health|story|engage"; exit 1 ;;
esac
echo "$(date '+%F %T') triggered $1 (exit $?)"
