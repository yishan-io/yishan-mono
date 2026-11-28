# Relay Service

`apps/relay` is a Go relay that brokers outbound-only daemon connections so a remote client can control the user's own daemon.

## What it does

- Accepts daemon WebSocket connections on `GET /ws` with node-scoped JWT auth.
- Tracks node session lifecycle (`connected`, `disconnected`, `replaced`).
- Forwards client `/client/ws` traffic to the daemon session and daemon output back to the clients.
- Sends heartbeat pings to daemons.
- Exposes basic observability metrics for connected nodes.

## Endpoints

- `GET /healthz` - liveness.
- `GET /ws` - daemon relay socket (JWT bearer required).
- `GET /client/ws?nodeId=<nodeId>` - client relay socket for terminal/jsonrpc passthrough (API bearer required).
- `GET /api/v1/metrics` - relay metrics (API bearer required).

## Environment

The relay automatically loads `apps/relay/.env` on startup if present.
Values already exported in the shell take precedence over `.env` values.

Required:

- `JWT_SECRET`: shared secret used to verify daemon JWTs.
- `RELAY_API_TOKEN`: bearer token for client socket and metrics APIs.

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

- `401 unauthorized` on `/ws`: validate JWT signature, `iss`, `aud`, `exp`, and required `nodeId` claim.
- `401 unauthorized` on `/client/ws`: verify `Authorization: Bearer <RELAY_API_TOKEN>`.
- No terminal output on relay client: verify daemon node is connected and client is using the same `nodeId`.
