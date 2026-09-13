package rpc

import (
	"yishan/apps/cli/internal/events"
)

// Event is a frontend event streamed to clients (topic + payload). It aliases
// the internal event hub's event type so subscriptions flow without copies.
type Event = eventbus.Event

// AttachEventStream forwards frontend events to the client as notifications on
// the given method until the stream is detached (or the connection closes).
func (c *Connection) AttachEventStream(events <-chan Event, method string, cancel func()) {
	previousCancel, isAttached := c.registerEventStream(cancel)
	if !isAttached {
		cancel()
		return
	}
	if previousCancel != nil {
		previousCancel()
	}

	go func() {
		for event := range events {
			if err := c.Notify(method, map[string]any{
				"topic":   event.Topic,
				"payload": event.Payload,
			}); err != nil {
				c.DetachEventStream()
				return
			}
		}
	}()
}

func (c *Connection) registerEventStream(cancel func()) (func(), bool) {
	c.closeHooksMu.Lock()
	defer c.closeHooksMu.Unlock()
	if c.isClosed {
		return nil, false
	}
	c.eventsMu.Lock()
	defer c.eventsMu.Unlock()
	previousCancel := c.eventsCancel
	c.eventsCancel = cancel
	return previousCancel, true
}

// DetachEventStream cancels the active event stream, if any.
func (c *Connection) DetachEventStream() {
	c.eventsMu.Lock()
	cancel := c.eventsCancel
	c.eventsCancel = nil
	c.eventsMu.Unlock()

	if cancel != nil {
		cancel()
	}
}
