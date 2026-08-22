package session

import "time"

func (r *Registry) scheduleCompletedStopExpiry(sessionID string, completed completedStop) {
	key := completed.key
	completedAt := completed.completedAt
	time.AfterFunc(completedStopRetention, func() {
		r.expireCompletedStop(sessionID, key, completedAt)
	})
}

func (r *Registry) expireCompletedStop(sessionID string, key stopKey, completedAt time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	completed, exists := r.completedStops[sessionID]
	if exists && completed.key == key && completed.completedAt.Equal(completedAt) {
		delete(r.completedStops, sessionID)
		r.signalLocked()
	}
}

func (r *Registry) pruneCompletedStopsLocked(now time.Time) {
	for sessionID, completed := range r.completedStops {
		if now.Sub(completed.completedAt) >= completedStopRetention {
			delete(r.completedStops, sessionID)
		}
	}
	for len(r.completedStops) > maxCompletedStops {
		r.deleteOldestCompletedStopLocked()
	}
}

func (r *Registry) deleteOldestCompletedStopLocked() {
	var oldestSessionID string
	var oldestCompletedAt time.Time
	for sessionID, completed := range r.completedStops {
		if oldestSessionID == "" || completed.completedAt.Before(oldestCompletedAt) {
			oldestSessionID = sessionID
			oldestCompletedAt = completed.completedAt
		}
	}
	delete(r.completedStops, oldestSessionID)
}
