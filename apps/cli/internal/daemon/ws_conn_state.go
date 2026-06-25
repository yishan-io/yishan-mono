package daemon

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"yishan/apps/cli/internal/workspace/terminal"
)

const terminalOutputFlushInterval = 16 * time.Millisecond
const terminalOutputMaxBatchBytes = 32 * 1024
const websocketWriteTimeout = 5 * time.Second

type wsConnState struct {
	conn                            *websocket.Conn
	writeMu                         sync.Mutex
	closeOnce                       sync.Once
	closeHooksMu                    sync.Mutex
	closeHooks                      []func()
	subsMu                          sync.Mutex
	subscriptions                   map[string]subscriptionHandle
	eventsMu                        sync.Mutex
	eventsCancel                    func()
	lastTerminalInputSessionID      string
	lastTerminalInputSessionIDBytes []byte
}

type subscriptionHandle struct {
	sessionID      string
	subscriptionID uint64
	cancel         func(sessionID string, subscriptionID uint64)
}

func newWSConnState(conn *websocket.Conn) *wsConnState {
	return &wsConnState{conn: conn, subscriptions: make(map[string]subscriptionHandle)}
}

func (c *wsConnState) terminalInputSessionID(raw []byte) string {
	if stringBytesEqual(raw, c.lastTerminalInputSessionIDBytes) {
		return c.lastTerminalInputSessionID
	}

	c.lastTerminalInputSessionID = string(raw)
	c.lastTerminalInputSessionIDBytes = append(c.lastTerminalInputSessionIDBytes[:0], raw...)
	return c.lastTerminalInputSessionID
}

func (c *wsConnState) WriteJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := c.conn.SetWriteDeadline(time.Now().Add(websocketWriteTimeout)); err != nil {
		return err
	}
	defer c.conn.SetWriteDeadline(time.Time{})
	return c.conn.WriteJSON(v)
}

// WriteBinary sends a binary WebSocket frame. Used for terminal I/O fast-path
// to avoid JSON marshal overhead on every PTY output chunk.
func (c *wsConnState) WriteBinary(data []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := c.conn.SetWriteDeadline(time.Now().Add(websocketWriteTimeout)); err != nil {
		return err
	}
	defer c.conn.SetWriteDeadline(time.Time{})
	return c.conn.WriteMessage(websocket.BinaryMessage, data)
}

func (c *wsConnState) Notify(method string, params any) error {
	return c.WriteJSON(notification{JSONRPC: "2.0", Method: method, Params: params})
}

func (c *wsConnState) Close() {
	c.closeOnce.Do(func() {
		c.closeHooksMu.Lock()
		hooks := append([]func(){}, c.closeHooks...)
		c.closeHooks = nil
		c.closeHooksMu.Unlock()

		for _, hook := range hooks {
			hook()
		}

		c.subsMu.Lock()
		handles := make([]subscriptionHandle, 0, len(c.subscriptions))
		for key, handle := range c.subscriptions {
			delete(c.subscriptions, key)
			handles = append(handles, handle)
		}
		c.subsMu.Unlock()

		for _, handle := range handles {
			handle.cancel(handle.sessionID, handle.subscriptionID)
		}
		c.DetachEventStream()
		_ = c.conn.Close()
	})
}

func (c *wsConnState) AddCloseHook(hook func()) {
	c.closeHooksMu.Lock()
	c.closeHooks = append(c.closeHooks, hook)
	c.closeHooksMu.Unlock()
}

func (c *wsConnState) AttachSubscription(sessionID string, subscriptionID uint64, events <-chan terminal.Event, cancel func(sessionID string, subscriptionID uint64)) {
	c.subsMu.Lock()
	if current, ok := c.subscriptions[sessionID]; ok {
		delete(c.subscriptions, sessionID)
		current.cancel(current.sessionID, current.subscriptionID)
	}
	c.subscriptions[sessionID] = subscriptionHandle{sessionID: sessionID, subscriptionID: subscriptionID, cancel: cancel}
	c.subsMu.Unlock()

	go func() {
		if err := c.streamTerminalEvents(sessionID, events); err != nil {
			c.DetachSubscription(sessionID)
		}
	}()
}

func (c *wsConnState) streamTerminalEvents(sessionID string, events <-chan terminal.Event) error {
	batcher := newTerminalOutputBatcher(sessionID)
	flushTimer := time.NewTimer(terminalOutputFlushInterval)
	if !flushTimer.Stop() {
		select {
		case <-flushTimer.C:
		default:
		}
	}
	defer flushTimer.Stop()

	var flushTimerC <-chan time.Time

	for {
		select {
		case <-flushTimerC:
			flushTimerC = nil
			if err := batcher.flush(c); err != nil {
				return err
			}
		case event, ok := <-events:
			if !ok {
				return batcher.flush(c)
			}
			shouldArmFlush, err := c.handleTerminalEvent(event, batcher)
			if err != nil {
				return err
			}
			if !shouldArmFlush {
				continue
			}
			if flushTimerC != nil {
				continue
			}
			flushTimer.Reset(terminalOutputFlushInterval)
			flushTimerC = flushTimer.C
		}
	}
}

func (c *wsConnState) handleTerminalEvent(event terminal.Event, batcher *terminalOutputBatcher) (bool, error) {
	switch event.Type {
	case "output":
		if len(event.RawChunk) == 0 {
			return false, nil
		}
		if err := batcher.append(c, event.RawChunk); err != nil {
			return false, err
		}
		return batcher.hasPendingPayload(), nil
	case "exit":
		if err := batcher.flush(c); err != nil {
			return false, err
		}
		return false, c.Notify("terminal.exit", map[string]any{
			"sessionId": event.SessionID,
			"exitCode":  event.ExitCode,
		})
	default:
		return false, nil
	}
}

type terminalOutputBatcher struct {
	outputFramePrefix []byte
	pendingPayload    []byte
}

func newTerminalOutputBatcher(sessionID string) *terminalOutputBatcher {
	sid := []byte(sessionID)
	prefix := make([]byte, 1+len(sid)+1)
	prefix[0] = 0x02
	copy(prefix[1:], sid)
	prefix[1+len(sid)] = 0

	return &terminalOutputBatcher{
		outputFramePrefix: prefix,
		pendingPayload:    make([]byte, 0, terminalOutputMaxBatchBytes),
	}
}

func (b *terminalOutputBatcher) append(conn *wsConnState, chunk []byte) error {
	b.pendingPayload = append(b.pendingPayload, chunk...)
	if len(b.pendingPayload) < terminalOutputMaxBatchBytes {
		return nil
	}
	return b.flush(conn)
}

func (b *terminalOutputBatcher) flush(conn *wsConnState) error {
	if len(b.pendingPayload) == 0 {
		return nil
	}

	frame := make([]byte, len(b.outputFramePrefix)+len(b.pendingPayload))
	copy(frame, b.outputFramePrefix)
	copy(frame[len(b.outputFramePrefix):], b.pendingPayload)
	b.pendingPayload = b.pendingPayload[:0]
	return conn.WriteBinary(frame)
}

func (b *terminalOutputBatcher) hasPendingPayload() bool {
	return len(b.pendingPayload) > 0
}

func (c *wsConnState) DetachSubscription(sessionID string) {
	c.subsMu.Lock()
	handle, ok := c.subscriptions[sessionID]
	if ok {
		delete(c.subscriptions, sessionID)
	}
	c.subsMu.Unlock()

	if ok {
		handle.cancel(handle.sessionID, handle.subscriptionID)
	}
}

func (c *wsConnState) AttachEventStream(events <-chan frontendEvent, cancel func()) {
	c.eventsMu.Lock()
	previousCancel := c.eventsCancel
	c.eventsCancel = cancel
	c.eventsMu.Unlock()

	if previousCancel != nil {
		previousCancel()
	}

	go func() {
		for event := range events {
			if err := c.Notify(MethodFrontendEventsStream, map[string]any{
				"topic":   event.Topic,
				"payload": event.Payload,
			}); err != nil {
				c.DetachEventStream()
				return
			}
		}
	}()
}

func (c *wsConnState) DetachEventStream() {
	c.eventsMu.Lock()
	cancel := c.eventsCancel
	c.eventsCancel = nil
	c.eventsMu.Unlock()

	if cancel != nil {
		cancel()
	}
}

func stringBytesEqual(value []byte, candidate []byte) bool {
	if len(value) != len(candidate) {
		return false
	}
	for index := range value {
		if value[index] != candidate[index] {
			return false
		}
	}
	return true
}
