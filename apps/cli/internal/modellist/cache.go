package modellist

import (
	"sync"
	"time"
)

type cachedEntry struct {
	List      AgentModelList
	ExpiresAt time.Time
}

type cache struct {
	mu    sync.RWMutex
	ttl   time.Duration
	items map[string]*cachedEntry
}

func newCache(ttl time.Duration) *cache {
	if ttl <= 0 {
		ttl = DefaultCacheTTL
	}
	return &cache{
		ttl:   ttl,
		items: make(map[string]*cachedEntry),
	}
}

func (c *cache) get(agentKind string) (AgentModelList, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.items[agentKind]
	if !ok {
		return AgentModelList{}, false
	}
	if time.Now().After(entry.ExpiresAt) {
		return AgentModelList{}, false
	}
	return entry.List, true
}

func (c *cache) set(agentKind string, list AgentModelList) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[agentKind] = &cachedEntry{
		List:      list,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}
