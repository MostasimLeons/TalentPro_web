#!/usr/bin/env bash
# Auto commit + push for the TalentPro redesign (Claude Code "Stop" hook).
# Runs when Claude finishes a turn. Safety rules:
#   - only on branch redesign-3d (never main), never --force, never retries
#   - aborts the commit if staged changes look like they contain secrets
#   - on any failure it reports the reason and does nothing else
# Turn off: create an empty file .claude/hooks/AUTOPUSH_OFF  (or remove the
# "Stop" entry from .claude/settings.json).

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
BRANCH="redesign-3d"

say() {  # message shown to the user in Claude Code
  local msg=${1//\\/\\\\}; msg=${msg//\"/\\\"}; msg=${msg//$'\n'/ | }
  printf '{"systemMessage":"[auto-push] %s"}\n' "$msg"
  exit 0
}

[ -f .claude/hooks/AUTOPUSH_OFF ] && exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

current=$(git symbolic-ref --short HEAD 2>/dev/null)
[ "$current" = "$BRANCH" ] || say "skipped: on branch '$current', only $BRANCH is auto-pushed."

git add -A
if ! git diff --cached --quiet; then
  if git diff --cached -U0 | grep -E '^\+' | grep -qEi \
     '(BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|xox[bp]-|AIza[0-9A-Za-z_-]{30,}|DB_PASSWORD|define\( *.(AUTH|SECURE_AUTH|LOGGED_IN|NONCE)_(KEY|SALT))'; then
    git reset -q
    say "NOT committed: staged changes look like they contain a secret/key. Check 'git diff' and .gitignore."
  fi
  files=$(git diff --cached --name-only | head -n 3 | xargs -n1 basename 2>/dev/null | paste -sd, -)
  n=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -q -m "Auto-save: ${n} file(s) – ${files}" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
    || say "commit failed (check git status)."
fi

# Push only if there is something unpushed.
ahead=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 1)
[ "$ahead" = "0" ] && exit 0

if out=$(git push origin "$BRANCH" 2>&1); then
  say "pushed $(git rev-parse --short HEAD) to origin/$BRANCH."
else
  say "PUSH FAILED (not retried): $(printf '%s' "$out" | tail -n 3)"
fi
