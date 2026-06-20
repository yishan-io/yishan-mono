# Computer Use macOS Verification

## Purpose

Manual verification checklist for the daemon-owned Computer Use runtime in `apps/cli/internal/computer/darwin/`.

## Preconditions

1. Run `go test ./...` from `apps/cli`.
2. Start the daemon with `yishan daemon start`.
3. Start the MCP server with `yishan mcp`.
4. Use a macOS account where Accessibility and Screen Recording can be granted and revoked.

## Permission Checks

1. Call `computer_permissions` before granting permissions.
Expected: `accessibility` and `screenRecording` are `denied` or `unknown`.
2. Call `computer_permissions` after granting Accessibility.
Expected: `accessibility` becomes `granted`.
3. Call `computer_permissions` after granting Screen Recording.
Expected: `screenRecording` becomes `granted`.
4. Call `computer_open_permission_settings` through the daemon RPC.
Expected: System Settings opens the requested Privacy pane.

## Discovery Checks

1. Call `computer_list_displays`.
Expected: each display returns `id`, `nativeId`, `bounds`, and `scaleFactor`.
2. Call `computer_list_applications` with Terminal, Finder, and Safari open.
Expected: each appears with `pid`, `bundleId`, and `frontmost` state.
3. Call `computer_list_windows`.
Expected: visible windows include bounds, title, layer, and opaque `window_*` ids.

## Capture Checks

1. Call `computer_capture` with `displayId`.
Expected: PNG base64 payload plus width/height metadata.
2. Call `computer_capture` with `windowId`.
Expected: image payload matches the selected window.
3. Repeat with `format=jpeg`, `maxWidth`, and `maxHeight`.
Expected: mime type and output dimensions match the request.

## Accessibility Checks

1. Call `computer_get_ui_tree` against Terminal or Safari.
Expected: rooted tree with `ax_*` ids, roles, titles, frames, actions, and children.
2. Call `computer_find_element` for a known button or text field.
Expected: first matching node is returned.
3. Verify secure text fields.
Expected: secure field values are redacted and typing is blocked.

## Interaction Checks

1. Call `computer_perform_action` with `approved=true` on a safe button.
Expected: AX action succeeds.
2. Call `computer_focus_window` with `approved=true`.
Expected: target window is raised or focused.
3. Call `computer_launch_application` with `approved=true` for Safari or Finder.
Expected: application launches or activates.
4. Call `computer_click`, `computer_drag`, `computer_scroll`, `computer_type`, and `computer_key` with `approved=true`.
Expected: global input events are delivered.

## Policy Checks

1. Call `computer_type` without `approved=true`.
Expected: `approval_required`.
2. Call `computer_clipboard_read` without `approved=true`.
Expected: `approval_required`.
3. Focus a secure text field and call `computer_type` with `approved=true`.
Expected: `sensitive_target`.
4. Front 1Password or Keychain Access and call `computer_click` with `approved=true`.
Expected: `application_blocked`.

## Clipboard Checks

1. Call `computer_clipboard_write` with `approved=true` and a plain text payload.
Expected: general pasteboard contains the text.
2. Call `computer_clipboard_read` with `approved=true`.
Expected: plain text is returned without logging the text value.
3. Call `computer_clipboard_write` with empty text.
Expected: clipboard is cleared.

## Cancellation Checks

1. Start a Computer Use tool through MCP and cancel the request mid-flight.
Expected: the MCP request ends with a cancellation error and no stuck daemon connection.
2. Repeat during capture and during a mutating input action.
Expected: no daemon panic; follow-up operations still succeed.

## Multi-display Checks

1. Attach multiple displays with different scale factors.
2. Verify `computer_list_displays` and display capture for each display.
3. Verify pointer and click coordinates match the captured display bounds.

## Regression Checks

1. Run `go test ./...` from `apps/cli` after any native bridge changes.
2. Re-test OpenCode discovery of `computer_*` MCP tools.
