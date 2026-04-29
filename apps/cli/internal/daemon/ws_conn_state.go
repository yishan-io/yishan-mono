package daemon

import (
	"sync"

	"github.com/gorilla/websocket"
	"yishan/apps/cli/internal/workspace/terminal"
)

type wsConnState struct {
	conn          *websocket.Conn
	writeMu       sync.Mutex
	closeOnce     sync.Once
	subsMu        sync.Mutex
	subscriptions map[string]subscriptionHandle
}

type subscriptionHandle struct {
	sessionID      string
	subscriptionID uint64
	cancel         func(sessionID string, subscriptionID uint64)
}

func newWSConnState(conn *websocket.Conn) *wsConnState {
	return &wsConnState{conn: conn, subscriptions: make(map[string]subscriptionHandle)}
}

func (c *wsConnState) WriteJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteJSON(v)
}

func (c *wsConnState) Notify(method string, params any) error {
	return c.WriteJSON(notification{JSONRPC: "2.0", Method: method, Params: params})
}

func (c *wsConnState) Close() {
	c.closeOnce.Do(func() {
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
		_ = c.conn.Close()
	})
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
		for event := range events {
			switch event.Type {
			case "output":
				if err := c.Notify("terminal.output", map[string]any{
					"sessionId": event.SessionID,
					"chunk":     event.Chunk,
				}); err != nil {
					c.DetachSubscription(sessionID)
					return
				}
			case "exit":
				if err := c.Notify("terminal.exit", map[string]any{
					"sessionId": event.SessionID,
					"exitCode":  event.ExitCode,
				}); err != nil {
					c.DetachSubscription(sessionID)
					return
				}
			}
		}
	}()
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
