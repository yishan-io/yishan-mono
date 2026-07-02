package daemon

import (
	"sync"
	"sync/atomic"

	"github.com/rs/zerolog/log"
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
	events := make(chan frontendEvent, 128)

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
	defer h.mu.Unlock()

	for id, subscriber := range h.subscribers {
		select {
		case subscriber <- event:
		default:
			log.Warn().Uint64("subscriberId", id).Str("topic", event.Topic).Msg("frontend event subscriber backlog full; dropping event")
		}
	}
}
