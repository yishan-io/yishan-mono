package dsh

import (
	"context"
	"time"
)

func waitForRestart(ctx context.Context, backoff time.Duration) {
	timer := time.NewTimer(backoff)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}

func (s *Supervisor) scheduleRestart() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosing || s.isRestartScheduled || s.health.RestartCount >= s.config.RestartLimit {
		return
	}
	s.health.RestartCount++
	s.isRestartScheduled = true
	go s.restartAfterBackoff(s.config.RestartBackoff)
}

func (s *Supervisor) restartAfterBackoff(backoff time.Duration) {
	s.config.RestartWait(s.ctx, backoff)
	if !s.waitForStartRelease() || !s.beginRestart() {
		return
	}
	_ = s.startProcess(s.ctx) // failures schedule their own bounded retry
	s.releaseStart()
}

func (s *Supervisor) waitForStartRelease() bool {
	for {
		s.mu.RLock()
		isClosing := s.isClosing
		isStarting := s.isStarting
		startDone := s.startDone
		s.mu.RUnlock()
		if isClosing {
			return false
		}
		if !isStarting {
			return true
		}
		select {
		case <-s.ctx.Done():
			return false
		case <-startDone:
		}
	}
}

func (s *Supervisor) beginRestart() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isRestartScheduled = false
	if s.isClosing || s.isStarting || s.process != nil {
		return false
	}
	s.isStarting = true
	s.startDone = make(chan struct{})
	return true
}
