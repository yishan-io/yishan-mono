# Relay Service

`apps/relay` is a Go relay that brokers outbound-only daemon connections so a remote client can control the user's own daemon.

## What it does

- Accepts daemon WebSocket connections on `GET /ws` with a relay token (JWT with `type: "relay"`, `sub` and `nodeId`).
- Tracks node session lifecycle (`connected`, `disconnected`, `replaced`).
- Forwards client `/client/ws` traffic to the daemon session and daemon output back to the clients. Sessions are keyed by (user, node): a client only reaches nodes registered by the same user.
- Sends heartbeat pings to daemons.
- Exposes basic observability metrics for connected nodes.

## Endpoints

- `GET /healthz` - liveness.
- `GET /ws` - daemon relay socket (relay token required).
- `GET /client/ws?nodeId=<nodeId>&token=<access token>` - remote-control client socket for terminal/jsonrpc passthrough. Authenticated with the user's access token (JWT with `type: "access"`); `Authorization: Bearer` also works where headers can be set.
- `GET /api/v1/me/nodes` - the caller's connected nodes (user access token required).
- `GET /api/v1/metrics` - relay metrics for ops (`RELAY_API_TOKEN` required).

## Environment

The relay automatically loads `apps/relay/.env` on startup if present.
Values already exported in the shell take precedence over `.env` values.

Required:

- `JWT_SECRET`: shared secret used to verify relay and access tokens (same as api-service).
- `RELAY_API_TOKEN`: bearer token for the ops metrics API.

Optional:

- `HOST` (default `0.0.0.0`)
- `PORT` (default `8788`)
- `JWT_ISSUER` (default `https://yishan.io`)
- `JWT_AUDIENCE` (default `api-service`)
- `LOG_LEVEL` (default `info`)

## Local run

```bash
cd apps/relay
JWT_SECRET=dev-secret RELAY_API_TOKEN=dev-token go run .
```

Example `.env`:

```dotenv
JWT_SECRET=dev-secret
RELAY_API_TOKEN=dev-token
PORT=8788
JWT_ISSUER=https://yishan.io
JWT_AUDIENCE=api-service
LOG_LEVEL=info
```

## Troubleshooting

- `401 unauthorized` on `/ws`: validate JWT signature, `iss`, `aud`, `exp`, `type: "relay"` and the required `nodeId` claim.
- `401 unauthorized` on `/client/ws` or `/api/v1/me/nodes`: the token must be a user access token (`type: "access"`), not a relay token or `RELAY_API_TOKEN`.
- No terminal output on relay client: verify the daemon node is connected as the same user and the client is using the same `nodeId`.
