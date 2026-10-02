# Relay Service

`apps/relay` is a Go relay that brokers outbound-only daemon connections and carries manual scheduled-job dispatch over those relay sessions.

## What it does

- Accepts daemon WebSocket connections on `GET /ws` with node-scoped JWT auth.
- Tracks node session lifecycle (`connected`, `disconnected`, `replaced`).
- Dispatches manual Run Now requests to specific nodes over relay (`job.run`).
- Processes daemon callbacks (`job.ack`, `job.result`).
- Applies at-least-once retries for missing ack/timeouts.
- Uses the API-created `runId` as the idempotency key. Distinct manual Run Now requests dispatch independently, including within the same minute.
- Records explicit offline behavior as `skipped_offline`.
- Exposes basic observability endpoints for connected nodes and queue metrics.

## Endpoints

- `GET /healthz` - liveness.
- `GET /ws` - daemon relay socket (JWT bearer required).
- `GET /client/ws?nodeId=<nodeId>` - client relay socket for terminal/jsonrpc passthrough (API bearer required).
- `POST /api/v1/dispatch` - dispatch a run to `nodeId` (API bearer required).
- `GET /api/v1/runs/{runId}` - run state lookup (API bearer required).
- `GET /api/v1/metrics` - relay + queue metrics (API bearer required).

## Environment

The relay automatically loads `apps/relay/.env` on startup if present.
Values already exported in the shell take precedence over `.env` values.

Required:

- `JWT_SECRET`: shared secret used to verify daemon JWTs.
- `RELAY_API_TOKEN`: bearer token for server-side dispatch/metrics APIs.

Optional:

- `HOST` (default `0.0.0.0`)
- `PORT` (default `8788`)
- `JWT_ISSUER` (default `https://yishan.io`)
- `JWT_AUDIENCE` (default `api-service`)
- `JOB_ACK_TIMEOUT` (default `30s`)
- `JOB_RESULT_TIMEOUT` (default `5m`)
- `JOB_MAX_RETRIES` (default `3`)
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
JOB_ACK_TIMEOUT=30s
JOB_RESULT_TIMEOUT=5m
JOB_MAX_RETRIES=3
LOG_LEVEL=info
```

## Dispatch example

```bash
curl -X POST http://localhost:8788/api/v1/dispatch \
  -H 'Authorization: Bearer dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "runId":"run_123",
    "jobId":"job_cleanup",
    "nodeId":"node_abc",
    "scheduledFor":"2026-05-11T12:30:00Z",
    "payload":{"task":"cleanup"}
  }'
```

## Troubleshooting

- `401 unauthorized` on `/ws`: validate JWT signature, `iss`, `aud`, `exp`, and required `nodeId` claim.
- `401 unauthorized` on `/client/ws`: verify `Authorization: Bearer <RELAY_API_TOKEN>`.
- No terminal output on relay client: verify daemon node is connected and client is using the same `nodeId`.
- `skipped_offline`: target node has no active relay session.
- Frequent retries: inspect ack/result timeouts and daemon handling of `job.run`.
- Repeated dispatches must use the original `runId`; the relay does not dispatch it twice. A reused `runId` with different job, node, or scheduled time is rejected.
