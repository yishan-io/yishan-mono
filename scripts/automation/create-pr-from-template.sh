#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Create a GitHub PR body that matches .github/pull_request_template.md and open the PR.

Usage:
  create-pr-from-template.sh --title "<title>" --summary "<text>" --type <type> --testing "<notes>" --issue <number> [options]

Required:
  --title <text>
  --summary <text>
  --type <bug|feature|refactor|documentation|other>
  --testing <text>

Issue policy:
  By default, an issue is required:
    --issue <number>
  To create without issue (explicit confirmation):
    --allow-no-issue --no-issue-reason "<why no issue>"

Optional:
  --base <branch>              Default: main
  --head <branch>              Default: current branch
  --repo <owner/name>
  --release-label <label>      Override auto-mapped release label
  --skip-release-notes         Apply skip-release-notes label
  --no-release-label           Do not set any release label
  --draft
  --dry-run
  --validated-typecheck
  --validated-lint
  --validated-test-unit
  --updated-tests
  --cla-agreed                 Default: checked
EOF
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

checkbox() {
  local selected="$1"
  local value="$2"
  local label="$3"
  if [[ "$selected" == "$value" ]]; then
    echo "- [x] $label"
  else
    echo "- [ ] $label"
  fi
}

checked_line() {
  local enabled="$1"
  local label="$2"
  if [[ "$enabled" -eq 1 ]]; then
    echo "- [x] $label"
  else
    echo "- [ ] $label"
  fi
}

release_label_for_type() {
  local type="$1"
  case "$type" in
    bug) echo "release:fix" ;;
    feature) echo "release:feature" ;;
    documentation) echo "release:docs" ;;
    refactor|other) echo "release:improvement" ;;
    *) echo "" ;;
  esac
}

TITLE=""
SUMMARY=""
TYPE=""
TESTING=""
ISSUE_NUMBER=""
ALLOW_NO_ISSUE=0
NO_ISSUE_REASON=""
BASE_BRANCH="main"
HEAD_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
REPO=""
DRAFT=0
DRY_RUN=0
AUTO_RELEASE_LABEL=1
RELEASE_LABEL=""

VALIDATED_TYPECHECK=0
VALIDATED_LINT=0
VALIDATED_TEST_UNIT=0
UPDATED_TESTS=0
CLA_AGREED=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    --summary)
      SUMMARY="${2:-}"
      shift 2
      ;;
    --type)
      TYPE="${2:-}"
      shift 2
      ;;
    --testing)
      TESTING="${2:-}"
      shift 2
      ;;
    --issue)
      ISSUE_NUMBER="${2:-}"
      shift 2
      ;;
    --allow-no-issue)
      ALLOW_NO_ISSUE=1
      shift
      ;;
    --no-issue-reason)
      NO_ISSUE_REASON="${2:-}"
      shift 2
      ;;
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --head)
      HEAD_BRANCH="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --release-label)
      RELEASE_LABEL="${2:-}"
      AUTO_RELEASE_LABEL=0
      shift 2
      ;;
    --no-release-label)
      RELEASE_LABEL=""
      AUTO_RELEASE_LABEL=0
      shift
      ;;
    --skip-release-notes)
      RELEASE_LABEL="skip-release-notes"
      AUTO_RELEASE_LABEL=0
      shift
      ;;
    --draft)
      DRAFT=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --validated-typecheck)
      VALIDATED_TYPECHECK=1
      shift
      ;;
    --validated-lint)
      VALIDATED_LINT=1
      shift
      ;;
    --validated-test-unit)
      VALIDATED_TEST_UNIT=1
      shift
      ;;
    --updated-tests)
      UPDATED_TESTS=1
      shift
      ;;
    --cla-agreed|--cla-signed)
      CLA_AGREED=1
      shift
      ;;
    --cla-not-agreed|--cla-unsigned)
      CLA_AGREED=0
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

if [[ -z "$TITLE" || -z "$SUMMARY" || -z "$TYPE" || -z "$TESTING" ]]; then
  echo "Missing required arguments." >&2
  usage
  exit 1
fi

case "$TYPE" in
  bug|feature|refactor|documentation|other)
    ;;
  *)
    echo "Invalid --type: $TYPE (must be bug|feature|refactor|documentation|other)." >&2
    exit 1
    ;;
esac

related_issues_line=""
if [[ -n "$ISSUE_NUMBER" ]]; then
  if [[ ! "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "--issue must be a numeric issue number." >&2
    exit 1
  fi
  related_issues_line="closes #${ISSUE_NUMBER}"
else
  if [[ "$ALLOW_NO_ISSUE" -ne 1 ]]; then
    echo "Issue is required. Provide --issue <number>, or confirm with --allow-no-issue --no-issue-reason \"...\"." >&2
    exit 1
  fi
  if [[ -z "$NO_ISSUE_REASON" ]]; then
    echo "--no-issue-reason is required when --allow-no-issue is used." >&2
    exit 1
  fi
  related_issues_line="N/A - ${NO_ISSUE_REASON}"
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

if [[ "$AUTO_RELEASE_LABEL" -eq 1 ]]; then
  RELEASE_LABEL="$(release_label_for_type "$TYPE")"
fi

{
  echo "## Summary"
  echo
  echo "$SUMMARY"
  echo
  echo "## Related Issues"
  echo
  echo "$related_issues_line"
  echo
  echo "## Type of Change"
  echo
  checkbox "$TYPE" "bug" "Bug fix"
  checkbox "$TYPE" "feature" "New feature"
  checkbox "$TYPE" "documentation" "Documentation"
  checkbox "$TYPE" "refactor" "Refactor"
  checkbox "$TYPE" "other" "Other (describe in Summary)"
  echo
  echo "## Testing Notes"
  echo
  echo "$TESTING"
  echo
  echo "## Validation"
  echo
  checked_line "$VALIDATED_TYPECHECK" "\`bun run typecheck\`"
  checked_line "$VALIDATED_LINT" "\`bun run lint\`"
  checked_line "$VALIDATED_TEST_UNIT" "\`bun run test:unit\`"
  checked_line "$UPDATED_TESTS" "Added/updated tests for behavior changes"
  echo
  echo "## Compliance"
  echo
  checked_line 1 "I have read \`CONTRIBUTING.md\`"
  checked_line "$CLA_AGREED" "I agree to the Contributor License Agreement terms in \`docs/legal/ICLA.md\` or \`docs/legal/CCLA.md\`"
  checked_line 1 "I agree this contribution may be licensed under this repository's license terms"
} >"$body_file"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Title: $TITLE"
  echo "Base : $BASE_BRANCH"
  echo "Head : $HEAD_BRANCH"
  echo
  cat "$body_file"
  exit 0
fi

require_command gh

cmd=(gh pr create --title "$TITLE" --body-file "$body_file" --base "$BASE_BRANCH" --head "$HEAD_BRANCH")

if [[ -n "$REPO" ]]; then
  cmd+=(--repo "$REPO")
fi

if [[ "$DRAFT" -eq 1 ]]; then
  cmd+=(--draft)
fi

if [[ -n "$RELEASE_LABEL" ]]; then
  cmd+=(--label "$RELEASE_LABEL")
fi

pr_url="$("${cmd[@]}")"
echo "Created PR: $pr_url"
