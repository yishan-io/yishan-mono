package relay

import (
	"errors"
	"time"
)

// errNodeOffline is returned when attempting to send to a disconnected node.
var errNodeOffline = errors.New("node is offline")

// WebSocket close codes.
const (
	// wsCloseReplaced is sent to the old connection when a node reconnects with
	// a new WebSocket. 4000 is in the private-use range (4000–4999).
	wsCloseReplaced = 4000
)

// Timing constants.
const (
	// heartbeatInterval is how often relay.ping is sent to connected nodes.
	heartbeatInterval = 30 * time.Second

	// metricsCacheTTL is how long a metrics snapshot is cached before recomputation.
	metricsCacheTTL = 5 * time.Second

	// staleSessionEvictInterval is how often the background eviction loop runs.
	staleSessionEvictInterval = 10 * time.Minute

	// staleSessionMaxAge is the maximum age of a disconnected session before eviction.
	staleSessionMaxAge = 1 * time.Hour

	// wsReadBufferSize and wsWriteBufferSize are the WebSocket buffer sizes.
	wsReadBufferSize  = 4096
	wsWriteBufferSize = 4096

	// writeDeadline is the maximum time allowed for a single WebSocket write.
	writeDeadline = 10 * time.Second

	// shutdownTimeout is the maximum time for graceful HTTP server shutdown.
	shutdownTimeout = 10 * time.Second
)

// Minute-bucket format for idempotency keys.
const minuteBucketFormat = "2006-01-02T15:04"
