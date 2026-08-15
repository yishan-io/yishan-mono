package rpc

import (
	internalevents "yishan/apps/cli/internal/events"
)

// Event is a frontend event streamed to clients (topic + payload). It aliases
// the internal event hub's event type so subscriptions flow without copies.
type Event = internalevents.Event

// AttachEventStream forwards frontend events to the client as notifications on
// the given method until the stream is detached (or the connection closes).
func (c *Connection) AttachEventStream(events <-chan Event, method string, cancel func()) {
	c.eventsMu.Lock()
	previousCancel := c.eventsCancel
	c.eventsCancel = cancel
	c.eventsMu.Unlock()

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
