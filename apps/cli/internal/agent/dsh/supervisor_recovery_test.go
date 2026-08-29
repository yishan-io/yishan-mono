package dsh

import (
	"context"
	"os/exec"
	"sync"
	"testing"
	"time"
)

func TestSupervisor_Restart_WaitsForReplacementAfterCallerCancellation(t *testing.T) {
	replacementStarted, releaseReplacement := make(chan struct{}, 1), make(chan struct{})
	supervisor := newTestSupervisor(Config{Command: gatedCommandFactory(helperCommand("ready"), helperCommand("ready"), replacementStarted, releaseReplacement)})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	restartDone := make(chan error, 1)
	go func() { restartDone <- supervisor.Restart(ctx) }()
	<-replacementStarted
	cancel()
	select {
	case err := <-restartDone:
		t.Fatalf("Restart returned before replacement completed: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	close(releaseReplacement)
	if err := <-restartDone; err != nil {
		t.Fatalf("Restart: %v", err)
	}
}

func TestSupervisor_Restart_WaitsForReplacementAfterStopError(t *testing.T) {
	replacementStarted, releaseReplacement := make(chan struct{}, 1), make(chan struct{})
	supervisor := newTestSupervisor(Config{Command: gatedCommandFactory(helperCommand("shutdown-error"), helperCommand("ready"), replacementStarted, releaseReplacement)})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	restartDone := make(chan error, 1)
	go func() { restartDone <- supervisor.Restart(context.Background()) }()
	<-replacementStarted
	select {
	case err := <-restartDone:
		t.Fatalf("Restart returned before replacement completed: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	close(releaseReplacement)
	if err := <-restartDone; err != nil {
		t.Fatalf("Restart: %v", err)
	}
}

func gatedCommandFactory(first, second CommandFactory, started chan<- struct{}, release <-chan struct{}) CommandFactory {
	var commandMu sync.Mutex
	isReplacement := false
	return func(ctx context.Context) (*exec.Cmd, error) {
		commandMu.Lock()
		shouldGate := isReplacement
		command := first
		if shouldGate {
			command = second
		} else {
			isReplacement = true
		}
		commandMu.Unlock()
		if shouldGate {
			started <- struct{}{}
			<-release
		}
		return command(ctx)
	}
}

func TestSupervisor_RestartRepeatedlyDoesNotConsumeCrashBudget(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("ready"), RestartLimit: 1})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	initialInstanceID := supervisor.Health().InstanceID
	for range 2 {
		if err := supervisor.Restart(context.Background()); err != nil {
			t.Fatalf("Restart: %v", err)
		}
		if !supervisor.Health().IsReady {
			t.Fatal("supervisor is not ready after requested restart")
		}
	}
	health := supervisor.Health()
	if health.RestartCount != 0 {
		t.Fatalf("RestartCount = %d, want crash budget unchanged", health.RestartCount)
	}
	if health.InstanceID == initialInstanceID {
		t.Fatalf("instanceId = %q, want a replacement runtime", health.InstanceID)
	}
}
