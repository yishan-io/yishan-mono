package daemon

import (
	"errors"
	"os"
	"testing"
	"time"
)

func TestPlanStartDecisions(t *testing.T) {
	liveState := &RuntimeState{PID: 200, Host: "127.0.0.1", Port: 43123}
	otherState := &RuntimeState{PID: 300, Host: "127.0.0.1", Port: 43124}

	tests := []struct {
		name         string
		lockHeld     bool
		holderPID    int
		holderAlive  bool
		state        *RuntimeState
		stateHealthy bool
		wantDecision startDecision
		wantPID      int
	}{
		{
			name:         "no lock and no state starts fresh",
			lockHeld:     false,
			holderPID:    0,
			holderAlive:  false,
			state:        nil,
			stateHealthy: false,
			wantDecision: startFresh,
			wantPID:      0,
		},
		{
			name:         "no lock with live state record replaces legacy daemon",
			lockHeld:     false,
			holderPID:    0,
			holderAlive:  false,
			state:        liveState,
			stateHealthy: true,
			wantDecision: startReplace,
			wantPID:      200,
		},
		{
			name:         "no lock with unhealthy state record replaces legacy daemon",
			lockHeld:     false,
			holderPID:    0,
			holderAlive:  false,
			state:        liveState,
			stateHealthy: false,
			wantDecision: startReplace,
			wantPID:      200,
		},
		{
			name:         "healthy verified lock holder is adopted",
			lockHeld:     true,
			holderPID:    200,
			holderAlive:  true,
			state:        liveState,
			stateHealthy: true,
			wantDecision: startAdopt,
			wantPID:      0,
		},
		{
			name:         "live holder with unhealthy state is replaced",
			lockHeld:     true,
			holderPID:    200,
			holderAlive:  true,
			state:        liveState,
			stateHealthy: false,
			wantDecision: startReplace,
			wantPID:      200,
		},
		{
			name:         "live holder with missing state is recovered by replacement",
			lockHeld:     true,
			holderPID:    200,
			holderAlive:  true,
			state:        nil,
			stateHealthy: false,
			wantDecision: startReplace,
			wantPID:      200,
		},
		{
			name:         "live holder with state recording a different pid is replaced via holder",
			lockHeld:     true,
			holderPID:    200,
			holderAlive:  true,
			state:        otherState,
			stateHealthy: true,
			wantDecision: startReplace,
			wantPID:      200,
		},
		{
			name:         "held lock with unusable holder record trusts healthy state",
			lockHeld:     true,
			holderPID:    0,
			holderAlive:  false,
			state:        otherState,
			stateHealthy: true,
			wantDecision: startAdopt,
			wantPID:      0,
		},
		{
			name:         "held lock with unusable holder record and stale state replaces via state",
			lockHeld:     true,
			holderPID:    0,
			holderAlive:  false,
			state:        otherState,
			stateHealthy: false,
			wantDecision: startReplace,
			wantPID:      300,
		},
		{
			name:         "held lock with dead recorded holder pid and no state refuses start",
			lockHeld:     true,
			holderPID:    200,
			holderAlive:  false,
			state:        nil,
			stateHealthy: false,
			wantDecision: startRefuse,
			wantPID:      0,
		},
		{
			name:         "held lock with no holder record and no state refuses start",
			lockHeld:     true,
			holderPID:    0,
			holderAlive:  false,
			state:        nil,
			stateHealthy: false,
			wantDecision: startRefuse,
			wantPID:      0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			decision, pid := planStart(tt.lockHeld, tt.holderPID, tt.holderAlive, tt.state, tt.stateHealthy)
			if decision != tt.wantDecision {
				t.Fatalf("planStart: got decision %v, want %v", decision, tt.wantDecision)
			}
			if pid != tt.wantPID {
				t.Fatalf("planStart: got pid %d, want %d", pid, tt.wantPID)
			}
		})
	}
}

func TestStopPIDRejectsInvalidPID(t *testing.T) {
	if err := stopPID(0, time.Second); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("stopPID(0): got %v, want ErrNotRunning", err)
	}
	if err := stopPID(-1, time.Second); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("stopPID(-1): got %v, want ErrNotRunning", err)
	}
}

func TestStopPIDReturnsNotRunningForDeadPID(t *testing.T) {
	if err := stopPID(999999, time.Second); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("stopPID(dead pid): got %v, want ErrNotRunning", err)
	}
}

func TestResolveStopPIDPrefersLiveLockHolder(t *testing.T) {
	dir := t.TempDir()
	lockPath := dir + "/" + lockFileName
	statePath := dir + "/" + StateFileName

	lock, err := acquireDaemonLock(lockPath)
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	defer lock.Release()

	pid := resolveStopPID(lockPath, statePath)
	if pid != os.Getpid() {
		t.Fatalf("resolveStopPID: got %d, want lock holder pid %d", pid, os.Getpid())
	}
}

func TestResolveStopPIDFallsBackToStateRecordWithoutLock(t *testing.T) {
	dir := t.TempDir()
	lockPath := dir + "/" + lockFileName
	statePath := dir + "/" + StateFileName

	state := RuntimeState{PID: os.Getpid(), Host: "127.0.0.1", Port: 43123}
	if err := saveState(statePath, state); err != nil {
		t.Fatalf("save state: %v", err)
	}

	if pid := resolveStopPID(lockPath, statePath); pid != os.Getpid() {
		t.Fatalf("resolveStopPID: got %d, want state-recorded pid %d", pid, os.Getpid())
	}
}

func TestResolveStopPIDReturnsZeroWhenNothingOwnsProfile(t *testing.T) {
	dir := t.TempDir()
	if pid := resolveStopPID(dir+"/"+lockFileName, dir+"/"+StateFileName); pid != 0 {
		t.Fatalf("resolveStopPID: got %d, want 0", pid)
	}
}
