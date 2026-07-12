# Yishan Mobile

React Native companion app for Yishan, built with Expo Router, Tamagui, and
TanStack Query.

## Current scope

This first mobile slice supports:

- restoring, refreshing, and revoking an API-issued bearer-token session
- direct Google OAuth sign-in on iOS
- canonical OAuth callback routing at `oauth/google/callback`
- secure local session storage
- an authenticated placeholder screen after sign-in

Workspace, shell, terminal, notifications, and account-management screens are
intentionally left for later feature PRs.

## Environment

- `EXPO_PUBLIC_API_BASE_URL`
  - required for auth and session refresh/revoke
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`
  - required for direct Google sign-in on iOS
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`
  - reserved for the future native Google Sign-In / Credential Manager flow on Android
- `EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME`
  - required native URL scheme for the iOS Google OAuth client

For local iOS Simulator development on the same Mac, use
`http://127.0.0.1:<port>` for the API base URL. A physical phone should use the
current Mac LAN IP instead.

The iOS app derives its callback URI from the native scheme and the shared
callback path `oauth/google/callback`. For example:

- iOS scheme `com.googleusercontent.apps.123456`
- callback URI `com.googleusercontent.apps.123456:/oauth/google/callback`

Android does not use this browser callback path. Its Google sign-in integration
must move to a native Credential Manager flow instead.

## Local commands

From `apps/mobile`:

```bash
bun run dev
bun run typecheck
bun run test:unit
```
