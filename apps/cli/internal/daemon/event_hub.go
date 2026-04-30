package daemon

import (
	"sync"
	"sync/atomic"
)

type frontendEvent struct {
	Topic   string
	Payload any
}

type eventHub struct {
	mu          sync.Mutex
	nextID      atomic.Uint64
	subscribers map[uint64]chan frontendEvent
}

func newEventHub() *eventHub {
	return &eventHub{subscribers: make(map[uint64]chan frontendEvent)}
}

func (h *eventHub) Subscribe() (uint64, <-chan frontendEvent) {
	id := h.nextID.Add(1)
	events := make(chan frontendEvent, 32)

	h.mu.Lock()
	h.subscribers[id] = events
	h.mu.Unlock()

	return id, events
}

func (h *eventHub) Unsubscribe(id uint64) {
	h.mu.Lock()
	events, ok := h.subscribers[id]
	if ok {
		delete(h.subscribers, id)
	}
	h.mu.Unlock()

	if ok {
		close(events)
	}
}

func (h *eventHub) Publish(event frontendEvent) {
	h.mu.Lock()
	deferredUnsubscribe := make([]uint64, 0)
	for id, subscriber := range h.subscribers {
		select {
		case subscriber <- event:
		default:
			deferredUnsubscribe = append(deferredUnsubscribe, id)
		}
	}
	h.mu.Unlock()

	for _, id := range deferredUnsubscribe {
		h.Unsubscribe(id)
	}
}
