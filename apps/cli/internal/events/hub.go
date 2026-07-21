package events

import (
	"sync"
	"sync/atomic"

	"github.com/rs/zerolog/log"
)

type Event struct {
	Topic   string
	Payload any
}

type Hub struct {
	mu          sync.Mutex
	nextID      atomic.Uint64
	subscribers map[uint64]chan Event
}

func NewHub() *Hub {
	return &Hub{subscribers: make(map[uint64]chan Event)}
}

func (h *Hub) Subscribe() (uint64, <-chan Event) {
	id := h.nextID.Add(1)
	events := make(chan Event, 128)

	h.mu.Lock()
	h.subscribers[id] = events
	h.mu.Unlock()

	return id, events
}

func (h *Hub) Unsubscribe(id uint64) {
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

func (h *Hub) Publish(event Event) {
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
