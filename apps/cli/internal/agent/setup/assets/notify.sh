#!/usr/bin/env bash
# yishan agent hook notify bridge

set -u

agent_arg=""
event_arg=""
input_arg=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent)
      shift
      agent_arg="${1:-}"
      ;;
    --event)
      shift
      event_arg="${1:-}"
      ;;
    *)
      if [ -z "$input_arg" ]; then
        input_arg="$1"
      fi
      ;;
  esac
  shift || true
done

workspace_id="${YISHAN_WORKSPACE_ID:-}"
tab_id="${YISHAN_TAB_ID:-}"
pane_id="${YISHAN_PANE_ID:-}"
ingress_url="${YISHAN_HOOK_INGRESS_URL:-}"

if [ -z "$workspace_id" ] || [ -z "$tab_id" ] || [ -z "$pane_id" ] || [ -z "$ingress_url" ]; then
  exit 0
fi

escape_json() {
  local raw="${1-}"
  raw="${raw//\/\\}"
  raw="${raw//\"/\\\"}"
  raw="${raw//$'\n'/\\n}"
  raw="${raw//$'\r'/\\r}"
  raw="${raw//$'\t'/\\t}"
  printf '%s' "$raw"
}

build_fast_body() {
  local agent="$1"
  local event="$2"
  local workspace="$3"
  local tab="$4"
  local pane="$5"
  local now_seconds
  local ts_millis

  now_seconds="$(date +%s 2>/dev/null || printf '0')"
  ts_millis=$((now_seconds * 1000))

  printf '{"agent":"%s","rawEventType":"%s","ts":%s,"workspaceId":"%s","tabId":"%s","paneId":"%s","payload":{}}' \
    "$(escape_json "${agent:-unknown}")" \
    "$(escape_json "${event:-unknown}")" \
    "$ts_millis" \
    "$(escape_json "$workspace")" \
    "$(escape_json "$tab")" \
    "$(escape_json "$pane")"
}

build_raw_body() {
  local agent="$1"
  local event="$2"
  local workspace="$3"
  local tab="$4"
  local pane="$5"
  local input_raw="$6"
  local now_seconds
  local ts_millis

  now_seconds="$(date +%s 2>/dev/null || printf '0')"
  ts_millis=$((now_seconds * 1000))

  printf '{"agent":"%s","rawEventType":"%s","ts":%s,"workspaceId":"%s","tabId":"%s","paneId":"%s","payloadRaw":"%s"}' \
    "$(escape_json "${agent:-unknown}")" \
    "$(escape_json "$event")" \
    "$ts_millis" \
    "$(escape_json "$workspace")" \
    "$(escape_json "$tab")" \
    "$(escape_json "$pane")" \
    "$(escape_json "$input_raw")"
}

if [ -n "$event_arg" ] && [ -z "$input_arg" ]; then
  input_raw=""
elif [ -n "$input_arg" ]; then
  input_raw="$input_arg"
elif [ ! -t 0 ]; then
  input_raw="$(cat)"
else
  input_raw=""
fi

if [ -n "$event_arg" ] && [ -z "$input_raw" ]; then
  request_body="$(build_fast_body "$agent_arg" "$event_arg" "$workspace_id" "$tab_id" "$pane_id")"
else
  request_body="$(build_raw_body "$agent_arg" "$event_arg" "$workspace_id" "$tab_id" "$pane_id" "$input_raw")"
fi

if [ -z "$request_body" ]; then
  exit 0
fi

token="${YISHAN_OBSERVER_TOKEN:-}"

if [ -n "${YISHAN_DEBUG_HOOKS:-}" ]; then
  echo "[yishan-hook] agent=${agent_arg:-unknown} event=${event_arg:-unknown} ingress=${ingress_url}" >&2
fi

if [ -n "$token" ]; then
  curl -sS -X POST "$ingress_url" \
    --connect-timeout 1 \
    --max-time 2 \
    -H "content-type: application/json" \
    -H "x-hook-version: v1" \
    -H "authorization: Bearer ${token}" \
    --data "$request_body" \
    >/dev/null 2>&1 || true
else
  curl -sS -X POST "$ingress_url" \
    --connect-timeout 1 \
    --max-time 2 \
    -H "content-type: application/json" \
    -H "x-hook-version: v1" \
    --data "$request_body" \
    >/dev/null 2>&1 || true
fi

exit 0
