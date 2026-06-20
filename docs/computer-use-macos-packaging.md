# Computer Use macOS Packaging Notes

## Current State

The daemon-owned Computer Use runtime now lives in Go + cgo under `apps/cli/internal/computer/darwin/` and links against:

- `ApplicationServices`
- `CoreGraphics`
- `CoreFoundation`
- `Foundation`
- `AppKit`
- `ScreenCaptureKit`

## Packaging Requirements

The shipping daemon binary needs:

1. A stable install path.
2. A stable signed identity across updates.
3. Screen Recording and Accessibility permission behavior documented for upgrades.
4. Entitlements appropriate for `ScreenCaptureKit` and global input events.

## Follow-up Work

Packaging/signing is not fully implemented in code yet. Before release, the build/release pipeline must be updated to:

1. Sign the daemon binary with the final Developer ID identity.
2. Verify permission retention after moving from an unsigned or differently signed daemon.
3. Test clean install, upgrade, and downgrade behavior on macOS.
4. Record the designated requirement used by the daemon binary.
