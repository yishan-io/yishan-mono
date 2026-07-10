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
- relay-backed terminal session list/start/stop
- relay-backed terminal streaming, input, and resize
- relay-backed workspace file tree / file / diff / git reads
- relay-backed frontend event fan-out for workspace freshness and notifications
- node-aware filtering in mobile shell
- settings: language, theme, notifications, sign out

Not fully productized yet:

- real workspace open / create flow equivalent to desktop
- server-side node filtering for workspaces and terminals
- node online / presence status
- Android browser-based Google OAuth is not wired
- pull request history is still API-backed rather than relay-backed

Important implementation note:

- mobile uses `apps/api-service` for the authenticated bearer session and
  control-plane data
- mobile exchanges that bearer session for a short-lived node-scoped relay token
  before opening `/client/ws`
- relay request/response calls reuse pooled per-node clients
- relay frontend events reuse one shared per-node stream and fan out inside the
  app
- live terminal streaming still runs on a dedicated session connection
- pull-request list/refresh stays on API for now

## Environment

- `EXPO_PUBLIC_API_BASE_URL`
  - required for auth, control-plane data, and minting node-scoped relay tokens
- `EXPO_PUBLIC_RELAY_URL`
  - required for relay transport after the API-to-relay token exchange
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`
  - required for direct Google sign-in on iOS
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`
  - reserved for the future native Google Sign-In / Credential Manager flow on Android
- `EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME`
  - required native URL scheme for the iOS Google OAuth client

For local development:

- iOS Simulator on the same Mac should use `http://127.0.0.1:<port>` for both API and relay
- a physical phone should use the current Mac LAN IP, for example `http://192.168.50.238:<port>`

The iOS app derives its callback URI from the native scheme and the shared
callback path `oauth/google/callback`. For example:

- iOS scheme `com.googleusercontent.apps.123456`
- callback URI `com.googleusercontent.apps.123456:/oauth/google/callback`

Android does not use this browser callback path. Its Google sign-in integration
must move to a native Credential Manager flow instead.

## Communication boundary

Current backend split:

- API: auth, session refresh, org/project/node/workspace registry, pull-request
  read side
- Relay: workspace file/diff/git reads, terminal lifecycle, terminal streaming,
  frontend events

The current relay auth contract is node-scoped rather than user-scoped:

- mobile signs in with API-issued bearer tokens
- mobile requests `POST /nodes/:nodeId/relay-token`
- mobile opens relay `/client/ws` with that short-lived relay token
- relay validates the requested `nodeId` against the token claims

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
