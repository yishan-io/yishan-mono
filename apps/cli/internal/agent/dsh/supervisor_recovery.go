// Package dsh owns the lifecycle of one DSH SDK JSON-RPC runtime process.
package dsh

import (
	"context"
	"errors"
)

// Recover starts a stopped runtime after a failed managed replacement has restored
// its prior configuration. It intentionally does not stop or replace a live runtime.
func (s *Supervisor) Recover(ctx context.Context) error {
	return s.Start(ctx)
}

// Restart replaces a running runtime after a successful managed mutation.
// A requested restart bypasses the crash restart budget. Once it stops the
// current runtime, it ignores caller cancellation until the replacement ends.
func (s *Supervisor) Restart(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	if s.isClosing || s.process == nil {
		s.mu.Unlock()
		return ErrRuntimeUnavailable
	}
	if s.restartProcess != nil {
		s.mu.Unlock()
		return errors.New("DSH runtime restart is already in progress")
	}
	process := s.process
	restartDone := make(chan error, 1)
	s.restartProcess = process
	s.restartDone = restartDone
	s.mu.Unlock()
	_ = s.stopProcess(process) // The replacement outcome determines the mutation transaction.
	return <-restartDone
}

func (s *Supervisor) startReplacement() error {
	if err := s.reserveStart(); err != nil {
		return err
	}
	defer s.releaseStart()
	return s.startProcessWithRetry(s.ctx, false)
}
