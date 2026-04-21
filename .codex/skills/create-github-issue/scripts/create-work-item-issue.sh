#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
exec bash "${repo_root}/scripts/automation/create-work-item-issue.sh" "$@"
