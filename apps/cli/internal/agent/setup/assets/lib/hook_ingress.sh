#!/usr/bin/env bash
# Hook-ingress-specific wrapper helpers.

set -u

if [ -z "${_WRAPPER_ROOT_DIR:-}" ]; then
  readonly _WRAPPER_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  readonly _WRAPPER_ROOT_DIR="$(cd "${_WRAPPER_LIB_DIR}/.." && pwd)"
fi

readonly NOTIFY_SCRIPT_PATH="${_WRAPPER_ROOT_DIR}/notify.sh"

notify_event() {
  local agent="$1"
  local event="$2"

  if [ ! -x "$NOTIFY_SCRIPT_PATH" ]; then
    return 0
  fi

  "$NOTIFY_SCRIPT_PATH" --agent "$agent" --event "$event" </dev/null >/dev/null 2>&1 || true
}
