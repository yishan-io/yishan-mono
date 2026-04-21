#!/usr/bin/env bash
set -euo pipefail

# Collect review context for a change range.
# Usage:
#   collect-review-context.sh                   # defaults to origin/main...HEAD
#   collect-review-context.sh main             # compare main...HEAD
#   collect-review-context.sh origin/main HEAD # custom range

BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"

resolve_ref() {
  local ref="$1"
  if git rev-parse --verify "$ref" >/dev/null 2>&1; then
    echo "$ref"
    return 0
  fi
  return 1
}

if ! BASE_REF="$(resolve_ref "$BASE_REF")"; then
  if BASE_REF="$(resolve_ref "main")"; then
    :
  else
    echo "Unable to resolve base ref: $BASE_REF" >&2
    exit 1
  fi
fi

if ! HEAD_REF="$(resolve_ref "$HEAD_REF")"; then
  echo "Unable to resolve head ref: $HEAD_REF" >&2
  exit 1
fi

MERGE_BASE="$(git merge-base "$BASE_REF" "$HEAD_REF")"
RANGE="$MERGE_BASE..$HEAD_REF"

echo "Review context"
echo "-------------"
echo "Base ref      : $BASE_REF"
echo "Head ref      : $HEAD_REF"
echo "Merge base    : $MERGE_BASE"
echo "Range         : $RANGE"
echo

echo "Commits"
echo "-------"
git log --no-merges --reverse --pretty=format:'- %h %s (%an, %ad)' --date=short "$RANGE"
echo
echo

echo "Changed files"
echo "-------------"
git diff --name-status "$RANGE"
echo

echo "Diffstat"
echo "--------"
git diff --stat "$RANGE"
echo

echo "Potentially missing tests signal"
echo "--------------------------------"
code_file_count="$(
  git diff --name-only "$RANGE" | (rg -N '\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift)$' || true) | wc -l | tr -d ' '
)"
test_file_count="$(
  git diff --name-only "$RANGE" | (rg -N '(^|/)(test|tests|__tests__|spec)(/|\.|$)|\.(test|spec)\.' || true) | wc -l | tr -d ' '
)"
echo "Changed code files : ${code_file_count}"
echo "Changed test files : ${test_file_count}"
if [[ "$code_file_count" -gt 0 && "$test_file_count" -eq 0 ]]; then
  echo "Warning: code changed but no test files changed."
fi
