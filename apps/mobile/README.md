# Yishan Mobile

React Native companion app for Yishan, built with Expo Router, Tamagui, and
TanStack Query.

## Current product shape

- authenticated users land in one shell
- login is direct Google OAuth for installed apps
- shell navigation is a drawer with:
  - organization context
  - project list
  - workspace list
  - organization details
- focus view hosts one selected terminal plus file/diff previews
- `Settings` is a separate full-screen utility route, not a shell side pane

Current backend-aligned resource model:

- `organization`
- `project`
- `workspace`
- `terminal`

Important relationship:

- `project` does not belong to a `node`
- `workspace` belongs to both a `project` and a `node`
- `terminal` belongs to one `workspace`

## Current scope

Implemented now:

- auth restore / refresh / revoke
- direct Google OAuth sign-in
- org list/detail and project list flows
- terminal-first shell UI
- node-aware filtering in mobile shell
- settings: language, theme, notifications, sign out

Not fully productized yet:

- real workspace open / create flow equivalent to desktop
- real terminal open / streaming backed by relay + node daemon
- real file / git remote-control entry points
- server-side node filtering for workspaces and terminals
- node online / presence status
- full user-scoped relay access for mobile

Important implementation note:

- mobile should not own a separate terminal runtime
- the long-term model is:
  - mobile selects `org`
  - mobile selects `node`
  - mobile opens one `workspace`
  - mobile opens one remote `terminal` on that workspace
  - relay + node daemon execute the real work
- current local terminal state exists only to support shell UX before that
  runtime is connected

## Environment

- `EXPO_PUBLIC_API_BASE_URL`
  - required for real backend calls
- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS`
  - required for direct Google sign-in on iOS
- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID`
  - reserved for the future native Google Sign-In / Credential Manager flow on Android
- `EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME`
  - required native URL scheme for the iOS Google OAuth client

The iOS app derives its callback URI from the native scheme and the shared
callback path `oauth/google/callback`. For example:

- iOS scheme `com.googleusercontent.apps.123456`
- callback URI `com.googleusercontent.apps.123456:/oauth/google/callback`

Android does not use this browser callback path. Its Google sign-in integration
must move to a native Credential Manager flow instead.

Legacy `EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI*` env vars and the older
`EXPO_PUBLIC_GOOGLE_OAUTH_SCHEME_IOS` name are still accepted as fallbacks
during migration, but new iOS config should use `EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME`.

## Local commands

From `apps/mobile`:

```bash
bun run dev
bun run typecheck
bun run lint
```

## Docs

- [Architecture](./ARCHITECTURE.md)
- [Agent guide](./AGENTS.md)
- [Remote runtime plan](./docs/remote-runtime-plan.md)
