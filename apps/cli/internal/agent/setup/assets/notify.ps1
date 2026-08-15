#!/usr/bin/env pwsh
# yishan agent hook notify bridge (powershell)

Set-StrictMode -Version 3

$agentArg = ""
$eventArg = ""
$inputArg = ""

for ($index = 0; $index -lt $args.Length; $index++) {
  $arg = $args[$index]
  if ($arg -eq "--agent" -and $index + 1 -lt $args.Length) {
    $index++
    $agentArg = [string]$args[$index]
    continue
  }

  if ($arg -eq "--event" -and $index + 1 -lt $args.Length) {
    $index++
    $eventArg = [string]$args[$index]
    continue
  }

  if ([string]::IsNullOrEmpty($inputArg)) {
    $inputArg = [string]$arg
  }
}

$workspaceId = [string]$env:YISHAN_WORKSPACE_ID
$tabId = [string]$env:YISHAN_TAB_ID
$paneId = [string]$env:YISHAN_PANE_ID
$ingressUrl = [string]$env:YISHAN_HOOK_INGRESS_URL

if ([string]::IsNullOrWhiteSpace($workspaceId) -or
    [string]::IsNullOrWhiteSpace($tabId) -or
    [string]::IsNullOrWhiteSpace($paneId) -or
    [string]::IsNullOrWhiteSpace($ingressUrl)) {
  exit 0
}

if (-not [string]::IsNullOrEmpty($eventArg) -and [string]::IsNullOrEmpty($inputArg)) {
  $inputRaw = ""
} elseif (-not [string]::IsNullOrEmpty($inputArg)) {
  $inputRaw = $inputArg
} elseif ([Console]::IsInputRedirected) {
  $inputRaw = [Console]::In.ReadToEnd()
} else {
  $inputRaw = ""
}

$body = @{
  agent = if ([string]::IsNullOrWhiteSpace($agentArg)) { "unknown" } else { $agentArg }
  rawEventType = $eventArg
  ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  workspaceId = $workspaceId
  tabId = $tabId
  paneId = $paneId
}

if (-not [string]::IsNullOrEmpty($eventArg) -and [string]::IsNullOrEmpty($inputRaw)) {
  $body.payload = @{}
} else {
  $body.payloadRaw = $inputRaw
}

$headers = @{
  "content-type" = "application/json"
  "x-hook-version" = "v1"
}

$token = [string]$env:YISHAN_OBSERVER_TOKEN
if (-not [string]::IsNullOrWhiteSpace($token)) {
  $headers["x-hook-token"] = $token
}

if (-not [string]::IsNullOrWhiteSpace([string]$env:YISHAN_DEBUG_HOOKS)) {
  [Console]::Error.WriteLine("[yishan-hook] agent=$agentArg event=$eventArg ingress=$ingressUrl")
}

try {
  Invoke-RestMethod -Method Post -Uri $ingressUrl -Headers $headers -Body ($body | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 2 | Out-Null
} catch {
}

exit 0
