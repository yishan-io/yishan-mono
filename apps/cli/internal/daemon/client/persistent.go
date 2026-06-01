package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/gorilla/websocket"
)

// PersistentClient holds a long-lived WebSocket connection to the daemon and
// multiplexes JSON-RPC calls over it using unique request IDs. Unlike the
// one-shot Client which dials/closes per call, this client keeps the socket
// open and matches responses by ID — matching the pattern used by the
// desktop renderer (DaemonClient.ts).
type PersistentClient struct {
	url   string
	token string

	conn   *websocket.Conn
	connMu sync.Mutex

	nextID atomic.Int64

	pending   map[int64]chan daemonResponse
	pendingMu sync.Mutex

	closed   chan struct{}
	closeErr error
	closeMu  sync.RWMutex
}

type daemonRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type daemonResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// NewPersistent creates a PersistentClient, connects to the daemon, and
// starts the read loop.
func NewPersistent(ctx context.Context, url string, token string) (*PersistentClient, error) {
	headers := http.Header{}
	if token != "" {
		headers.Set("Authorization", "Bearer "+token)
	}

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, url, headers)
	if err != nil {
		return nil, fmt.Errorf("connect daemon websocket: %w", err)
	}

	c := &PersistentClient{
		url:     url,
		token:   token,
		conn:    conn,
		pending: make(map[int64]chan daemonResponse),
		closed:  make(chan struct{}),
	}

	go c.readLoop()

	return c, nil
}

// Call sends a JSON-RPC request over the persistent connection and waits for
// the matching response. It returns an *RPCError if the daemon responds with
// a JSON-RPC error.
func (c *PersistentClient) Call(method string, params any, out any) error {
	if err := c.checkClosed(); err != nil {
		return err
	}

	id := c.nextID.Add(1)
	responseCh := make(chan daemonResponse, 1)

	c.pendingMu.Lock()
	c.pending[id] = responseCh
	c.pendingMu.Unlock()

	defer func() {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
	}()

	if err := c.writeRequest(id, method, params); err != nil {
		return fmt.Errorf("send daemon RPC request: %w", err)
	}

	resp, ok := <-responseCh
	if !ok {
		if err := c.checkClosed(); err != nil {
			return err
		}
		return fmt.Errorf("daemon connection closed while waiting for response")
	}

	if resp.Error != nil {
		return resp.Error
	}

	if out != nil && len(resp.Result) > 0 {
		if err := json.Unmarshal(resp.Result, out); err != nil {
			return fmt.Errorf("decode daemon RPC result: %w", err)
		}
	}

	return nil
}

// Close terminates the WebSocket connection and cancels all pending calls.
// It is safe to call multiple times.
func (c *PersistentClient) Close() error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	select {
	case <-c.closed:
		return c.closeErr
	default:
	}

	c.closeErr = c.conn.Close()
	close(c.closed)

	c.pendingMu.Lock()
	for id, ch := range c.pending {
		close(ch)
		delete(c.pending, id)
	}
	c.pendingMu.Unlock()

	return c.closeErr
}

// ── internal ──────────────────────────────────────────────────────────────────

func (c *PersistentClient) writeRequest(id int64, method string, params any) error {
	c.connMu.Lock()
	defer c.connMu.Unlock()

	return c.conn.WriteJSON(daemonRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	})
}

func (c *PersistentClient) readLoop() {
	defer func() {
		c.Close()
	}()

	for {
		_, payload, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		c.dispatchResponse(payload)
	}
}

func (c *PersistentClient) dispatchResponse(payload []byte) {
	var resp daemonResponse
	if err := json.Unmarshal(payload, &resp); err != nil {
		return
	}

	c.pendingMu.Lock()
	ch, ok := c.pending[resp.ID]
	c.pendingMu.Unlock()

	if ok {
		ch <- resp
	}
}

func (c *PersistentClient) checkClosed() error {
	c.closeMu.RLock()
	defer c.closeMu.RUnlock()
	select {
	case <-c.closed:
		if c.closeErr != nil {
			return fmt.Errorf("daemon connection closed: %w", c.closeErr)
		}
		return fmt.Errorf("daemon connection closed")
	default:
		return nil
	}
}
