package dsh

import (
	"context"
	"errors"
	"os/exec"
	"sync"
	"testing"
	"time"
)

func TestSupervisor_Start_RetriesInitialCreationFailure(t *testing.T) {
	var mu sync.Mutex
	attempts := 0
	backoffStarted := make(chan time.Duration, 1)
	allowRetry := make(chan struct{})
	supervisor := newTestSupervisor(Config{
		Command:      initialCreationFailureCommand(&mu, &attempts),
		RestartLimit: 1,
		RestartWait:  blockingRestartWait(backoffStarted, allowRetry),
	})
	defer supervisor.Close()

	assertStartFails(t, supervisor)
	assertRestartBackoff(t, backoffStarted)
	close(allowRetry)
	waitFor(t, func() bool { return supervisor.Health().IsReady })
	if got := supervisor.Health().Incarnation; got != "dsh-1" {
		t.Fatalf("retry incarnation = %q, want dsh-1", got)
	}
	assertAttempts(t, &mu, attempts, 2)
}

func TestSupervisor_Start_RetriesStartFailureUntilLimit(t *testing.T) {
	const restartLimit = 2
	attempts := make(chan struct{}, restartLimit+1)
	restartWaits := make(chan struct{}, restartLimit)
	supervisor := newTestSupervisor(Config{
		Command:      invalidPathCommand(attempts),
		RestartLimit: restartLimit,
		RestartWait:  countingRestartWait(restartWaits),
	})
	defer supervisor.Close()

	assertStartFails(t, supervisor)
	waitForSignals(t, attempts, restartLimit+1)
	assertSignalCount(t, restartWaits, restartLimit)
	if supervisor.Health().IsReady {
		t.Fatal("supervisor became ready after retry exhaustion")
	}
}

func initialCreationFailureCommand(mu *sync.Mutex, attempts *int) CommandFactory {
	return func(context.Context) (*exec.Cmd, error) {
		mu.Lock()
		defer mu.Unlock()
		*attempts++
		if *attempts == 1 {
			return nil, errors.New("initial creation failed")
		}
		return helperCommand("ready")(context.Background())
	}
}

func invalidPathCommand(attempts chan<- struct{}) CommandFactory {
	return func(context.Context) (*exec.Cmd, error) {
		attempts <- struct{}{}
		return exec.Command("dsh-command-that-does-not-exist"), nil
	}
}

func blockingRestartWait(started chan<- time.Duration, allowRetry <-chan struct{}) func(context.Context, time.Duration) {
	return func(ctx context.Context, backoff time.Duration) {
		started <- backoff
		select {
		case <-allowRetry:
		case <-ctx.Done():
		}
	}
}

func countingRestartWait(restartWaits chan<- struct{}) func(context.Context, time.Duration) {
	return func(context.Context, time.Duration) {
		select {
		case restartWaits <- struct{}{}:
		default:
		}
	}
}

func assertStartFails(t *testing.T, supervisor *Supervisor) {
	t.Helper()
	if err := supervisor.Start(context.Background()); err == nil {
		t.Fatal("Start succeeded after a startup failure")
	}
}

func assertRestartBackoff(t *testing.T, backoffStarted <-chan time.Duration) {
	t.Helper()
	select {
	case backoff := <-backoffStarted:
		if backoff != defaultRestartBackoff {
			t.Fatalf("restart backoff = %s, want %s", backoff, defaultRestartBackoff)
		}
	case <-time.After(time.Second):
		t.Fatal("initial failure did not schedule a retry")
	}
}

func assertAttempts(t *testing.T, mu *sync.Mutex, attempts, want int) {
	t.Helper()
	mu.Lock()
	defer mu.Unlock()
	if attempts != want {
		t.Fatalf("command attempts = %d, want %d", attempts, want)
	}
}

func waitForSignals(t *testing.T, signals <-chan struct{}, want int) {
	t.Helper()
	for range want {
		select {
		case <-signals:
		case <-time.After(time.Second):
			t.Fatal("expected retry attempt was not made")
		}
	}
}

func assertSignalCount(t *testing.T, signals <-chan struct{}, want int) {
	t.Helper()
	got := 0
	for {
		select {
		case <-signals:
			got++
		default:
			if got != want {
				t.Fatalf("restart loops = %d, want %d", got, want)
			}
			return
		}
	}
}

func TestSupervisor_Close_CancelsInitialFailureBackoff(t *testing.T) {
	backoffStarted := make(chan struct{}, 1)
	backoffCanceled := make(chan struct{}, 1)
	attempts := make(chan struct{}, 2)
	supervisor := newTestSupervisor(Config{
		Command: func(context.Context) (*exec.Cmd, error) {
			attempts <- struct{}{}
			return nil, errors.New("creation failed")
		},
		RestartWait: func(ctx context.Context, _ time.Duration) {
			backoffStarted <- struct{}{}
			<-ctx.Done()
			backoffCanceled <- struct{}{}
		},
	})
	if err := supervisor.Start(context.Background()); err == nil {
		t.Fatal("Start succeeded after creation failure")
	}
	select {
	case <-backoffStarted:
	case <-time.After(time.Second):
		t.Fatal("initial failure did not begin backoff")
	}
	assertRetryBackoffCanceled(t, supervisor, backoffCanceled)
	select {
	case <-attempts:
	default:
		t.Fatal("initial command was not attempted")
	}
	select {
	case <-attempts:
		t.Fatal("Close allowed a retry after canceling backoff")
	default:
	}
}

func assertRetryBackoffCanceled(t *testing.T, supervisor *Supervisor, backoffCanceled <-chan struct{}) {
	t.Helper()
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	select {
	case <-backoffCanceled:
	case <-time.After(time.Second):
		t.Fatal("Close did not cancel backoff")
	}
}

func TestSupervisor_Start_DoesNotDuplicatePendingRetry(t *testing.T) {
	attempts := make(chan struct{}, 2)
	restartWaits := make(chan struct{}, 2)
	supervisor := newTestSupervisor(Config{
		Command:     retryFailureCommand(attempts),
		RestartWait: blockingCountingRestartWait(restartWaits),
	})
	assertStartFails(t, supervisor)
	waitForSignals(t, restartWaits, 1)

	if err := supervisor.Start(context.Background()); err == nil {
		t.Fatal("Start succeeded while retry was pending")
	}
	waitForSignals(t, attempts, 1)
	assertSignalCount(t, restartWaits, 0)
	assertSignalCount(t, attempts, 0)
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func retryFailureCommand(attempts chan<- struct{}) CommandFactory {
	return func(context.Context) (*exec.Cmd, error) {
		attempts <- struct{}{}
		return nil, errors.New("creation failed")
	}
}

func blockingCountingRestartWait(restartWaits chan<- struct{}) func(context.Context, time.Duration) {
	return func(ctx context.Context, _ time.Duration) {
		countRestartWait(restartWaits)
		<-ctx.Done()
	}
}

func countRestartWait(restartWaits chan<- struct{}) {
	select {
	case restartWaits <- struct{}{}:
	default:
	}
}

func TestSupervisor_Start_RetriesImmediateBackoffUnderContention(t *testing.T) {
	const supervisorCount = 16
	supervisors := make([]*Supervisor, supervisorCount)
	var starts sync.WaitGroup
	starts.Add(supervisorCount)
	for index := range supervisors {
		var mu sync.Mutex
		attempts := 0
		supervisors[index] = newTestSupervisor(Config{
			Command: func(context.Context) (*exec.Cmd, error) {
				mu.Lock()
				defer mu.Unlock()
				attempts++
				if attempts == 1 {
					return nil, errors.New("initial creation failed")
				}
				return helperCommand("ready")(context.Background())
			},
			RestartLimit: 1,
			RestartWait:  func(context.Context, time.Duration) {},
		})
		go func(supervisor *Supervisor) {
			defer starts.Done()
			assertStartFails(t, supervisor)
		}(supervisors[index])
	}
	starts.Wait()
	t.Cleanup(func() {
		for _, supervisor := range supervisors {
			if err := supervisor.Close(); err != nil {
				t.Errorf("Close: %v", err)
			}
		}
	})
	waitFor(t, func() bool {
		for _, supervisor := range supervisors {
			if !supervisor.Health().IsReady {
				return false
			}
		}
		return true
	})
}

func TestSupervisor_Start_RetriesInitialInitializeFailure(t *testing.T) {
	var mu sync.Mutex
	attempts := 0
	supervisor := newTestSupervisor(Config{
		Command: func(context.Context) (*exec.Cmd, error) {
			mu.Lock()
			defer mu.Unlock()
			attempts++
			if attempts == 1 {
				return helperCommand("no-initialize")(context.Background())
			}
			return helperCommand("ready")(context.Background())
		},
		RestartLimit:   1,
		RestartWait:    func(context.Context, time.Duration) {},
		StartupTimeout: time.Second,
	})
	defer supervisor.Close()

	if err := supervisor.Start(context.Background()); err == nil {
		t.Fatal("Start succeeded after initial initialize failure")
	}
	waitFor(t, func() bool { return supervisor.Health().IsReady })
	mu.Lock()
	defer mu.Unlock()
	if attempts != 2 {
		t.Fatalf("command attempts = %d, want 2", attempts)
	}
}
