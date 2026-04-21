#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Create a GitHub issue using this repo's Work Item template structure.

Usage:
  create-work-item-issue.sh --title "<title>" --type <type> --summary "<text>" --acceptance "<criterion>" [options]

Required:
  --title <text>               Issue title. "[Work] " prefix is added automatically when missing.
  --type <bug|feature|refactor|documentation|other>
  --summary <text>             One short paragraph.
  --acceptance <text>          Acceptance criterion (repeatable).

Optional:
  --context <text>
  --scope <text>
  --out-of-scope <text>
  --validation <text>
  --risks <text>
  --additional <text>
  --label <name>               Repeatable.
  --assignee <login>           Repeatable.
  --repo <owner/name>          Target repository.
  --dry-run                    Print generated body only.
EOF
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

TITLE=""
TYPE=""
SUMMARY=""
CONTEXT="TBD"
SCOPE="TBD"
OUT_OF_SCOPE="TBD"
VALIDATION="TBD"
RISKS="None known."
ADDITIONAL="N/A"
REPO=""
DRY_RUN=0

declare -a ACCEPTANCE=()
declare -a LABELS=()
declare -a ASSIGNEES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    --type)
      TYPE="${2:-}"
      shift 2
      ;;
    --summary)
      SUMMARY="${2:-}"
      shift 2
      ;;
    --context)
      CONTEXT="${2:-}"
      shift 2
      ;;
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --out-of-scope)
      OUT_OF_SCOPE="${2:-}"
      shift 2
      ;;
    --validation)
      VALIDATION="${2:-}"
      shift 2
      ;;
    --risks)
      RISKS="${2:-}"
      shift 2
      ;;
    --additional)
      ADDITIONAL="${2:-}"
      shift 2
      ;;
    --acceptance)
      ACCEPTANCE+=("${2:-}")
      shift 2
      ;;
    --label)
      LABELS+=("${2:-}")
      shift 2
      ;;
    --assignee)
      ASSIGNEES+=("${2:-}")
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TITLE" || -z "$TYPE" || -z "$SUMMARY" || ${#ACCEPTANCE[@]} -eq 0 ]]; then
  echo "Missing required arguments." >&2
  usage
  exit 1
fi

case "$TYPE" in
  bug|feature|refactor|documentation|other)
    ;;
  *)
    echo "Invalid --type: $TYPE (must be bug|feature|refactor|documentation|other)" >&2
    exit 1
    ;;
esac

if [[ "$TITLE" != "[Work]"* ]]; then
  TITLE="[Work] $TITLE"
fi

type_checkbox() {
  local candidate="$1"
  local current="$2"
  if [[ "$candidate" == "$current" ]]; then
    echo "- [x] $3"
  else
    echo "- [ ] $3"
  fi
}

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

{
  echo "## Summary"
  echo
  echo "$SUMMARY"
  echo
  echo "## Type"
  echo
  type_checkbox "$TYPE" "bug" "Bug"
  type_checkbox "$TYPE" "feature" "Feature"
  type_checkbox "$TYPE" "refactor" "Refactor"
  type_checkbox "$TYPE" "documentation" "Documentation"
  type_checkbox "$TYPE" "other" "Other"
  echo
  echo "## Problem / Context"
  echo
  echo "$CONTEXT"
  echo
  echo "## Scope"
  echo
  echo "$SCOPE"
  echo
  echo "## Out of Scope"
  echo
  echo "$OUT_OF_SCOPE"
  echo
  echo "## Acceptance Criteria"
  echo
  for criterion in "${ACCEPTANCE[@]}"; do
    echo "- [ ] $criterion"
  done
  echo
  echo "## Validation Plan"
  echo
  echo "$VALIDATION"
  echo
  echo "## Risks / Dependencies"
  echo
  echo "$RISKS"
  echo
  echo "## Additional Context"
  echo
  echo "$ADDITIONAL"
} >"$body_file"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Title: $TITLE"
  echo
  cat "$body_file"
  exit 0
fi

require_command gh

cmd=(gh issue create --title "$TITLE" --body-file "$body_file")

if [[ -n "$REPO" ]]; then
  cmd+=(--repo "$REPO")
fi

for label in "${LABELS[@]}"; do
  cmd+=(--label "$label")
done

for assignee in "${ASSIGNEES[@]}"; do
  cmd+=(--assignee "$assignee")
done

issue_url="$("${cmd[@]}")"
echo "Created issue: $issue_url"
