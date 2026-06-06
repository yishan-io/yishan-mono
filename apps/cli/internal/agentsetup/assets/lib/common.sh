#!/usr/bin/env bash
# Shared generic helpers for yishan agent CLI wrappers.

set -u

resolve_managed_bin_dir() {
  if [ -n "${MANAGED_BIN_DIR:-}" ]; then
    printf '%s\n' "${MANAGED_BIN_DIR%/}"
    return
  fi

  if [ -n "${HOME:-}" ]; then
    printf '%s\n' "${HOME%/}/.yishan/bin"
    return
  fi

  printf '%s\n' ""
}

sanitized_path() {
  local wrapper_bin_dir="$1"
  local managed_bin_dir="${2:-}"
  local original_path="${PATH:-}"
  local sanitized=""
  local segment=""

  IFS=':' read -r -a _yishan_path_segments <<<"$original_path"
  for segment in "${_yishan_path_segments[@]}"; do
    [ -z "$segment" ] && continue
    segment="${segment%/}"
    if [ "$segment" = "${wrapper_bin_dir%/}" ]; then
      continue
    fi
    if [ -n "$managed_bin_dir" ] && [ "$segment" = "${managed_bin_dir%/}" ]; then
      continue
    fi

    if [ -z "$sanitized" ]; then
      sanitized="$segment"
    else
      sanitized="${sanitized}:$segment"
    fi
  done

  printf '%s\n' "$sanitized"
}

resolve_real_binary() {
  local command_name="$1"
  local wrapper_bin_dir="$2"
  local managed_bin_dir="${3:-}"
  local resolved_path
  local resolved

  resolved_path="$(sanitized_path "$wrapper_bin_dir" "$managed_bin_dir")"
  resolved="$(PATH="$resolved_path" command -v "$command_name" 2>/dev/null || true)"
  if [ -z "$resolved" ]; then
    return 1
  fi

  printf '%s\n' "$resolved"
}
