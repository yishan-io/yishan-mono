package session

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/process"
)

func TestRegistry_AttachPreservesCanonicalWorkspace(t *testing.T) {
	r := NewRegistry()
	r.Register("s1", nil, &process.Session{}, "tab-1", "ws-1", "/tmp", false)
	if _, err := r.Attach("s1", nil, "tab-2", "ws-2", "/other"); !errors.Is(err, ErrWorkspaceMismatch) {
		t.Fatalf("Attach mismatch error = %v, want ErrWorkspaceMismatch", err)
	}
	state, ok := r.Get("s1")
	if !ok || state.WorkspaceID != "ws-1" || state.TabID != "tab-1" {
		t.Fatalf("canonical ownership mutated: %#v", state)
	}
}

func TestRegistry_BeginWorkspaceCleanupBlocksAdmissionAndClaimsOnlyOwner(t *testing.T) {
	r := NewRegistry()
	r.Register("owned", nil, &process.Session{}, "", "ws-1", "", false)
	r.Register("other", nil, &process.Session{}, "", "ws-2", "", false)
	_, claims, err := r.BeginWorkspaceCleanup(context.Background(), "ws-1")
	if err != nil || len(claims) != 1 || claims[0].SessionID() != "owned" {
		t.Fatalf("claims = %#v, %v", claims, err)
	}
	if _, err := r.Admit("ws-1"); !errors.Is(err, ErrWorkspaceClosing) {
		t.Fatalf("Admit = %v", err)
	}
	if _, err := r.Admit("ws-2"); err != nil {
		t.Fatalf("unrelated admission: %v", err)
	}
	if _, err := r.Attach("owned", nil, "", "", ""); !errors.Is(err, ErrWorkspaceClosing) {
		t.Fatalf("Attach = %v", err)
	}
}

func TestRegistry_BeginWorkspaceCleanupWaitsForCrossingAdmission(t *testing.T) {
	r := NewRegistry()
	admission, err := r.Admit("ws-1")
	if err != nil {
		t.Fatal(err)
	}
	markerInstalled := make(chan struct{})
	completed := make(chan struct{})
	r.afterWorkspaceCleanupMarkerInstalled = func() { close(markerInstalled) }
	go func() { _, _, _ = r.BeginWorkspaceCleanup(context.Background(), "ws-1"); close(completed) }()
	<-markerInstalled // Cleanup installed its admission-blocking marker.
	if _, markerErr := r.Admit("ws-1"); !errors.Is(markerErr, ErrWorkspaceClosing) {
		t.Fatalf("Admit after cleanup marker = %v, want ErrWorkspaceClosing", markerErr)
	}
	select {
	case <-completed:
		t.Fatal("cleanup completed before crossing admission released")
	default:
	}
	if r.RegisterAdmission(admission, "s1", nil, &process.Session{}, "", "", false) {
		t.Fatal("crossing start was admitted")
	}
	r.ReleaseAdmission(admission)
	<-completed
}

func TestRegistry_RejectAdmissionConsumesTokenOnce(t *testing.T) {
	r := NewRegistry()
	first, err := r.Admit("ws")
	if err != nil {
		t.Fatal(err)
	}
	second, err := r.Admit("ws")
	if err != nil {
		t.Fatal(err)
	}
	cleanupMarkerInstalled := make(chan struct{})
	r.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(cleanupMarkerInstalled) })
	cleanupDone := make(chan struct{})
	go func() {
		_, _, _ = r.BeginWorkspaceCleanup(context.Background(), "ws")
		close(cleanupDone)
	}()
	<-cleanupMarkerInstalled
	r.RejectAdmission(first, "", nil, nil, "", "", false, nil)
	r.ReleaseAdmission(first) // A deferred release after rejection must be a no-op.
	select {
	case <-cleanupDone:
		t.Fatal("cleanup completed while another admission remained")
	case <-time.After(50 * time.Millisecond):
	}
	r.ReleaseAdmission(second)
	select {
	case <-cleanupDone:
	case <-time.After(time.Second):
		t.Fatal("cleanup did not complete after all admissions released")
	}
}

func TestRegistry_StopClaimCoalesces(t *testing.T) {
	r := NewRegistry()
	r.Register("s1", nil, &process.Session{}, "", "ws", "", false)
	first, _, _ := r.ClaimStop("s1")
	second, _, _ := r.ClaimStop("s1")
	if !first.IsOwner() || second.IsOwner() {
		t.Fatal("stop ownership was not coalesced")
	}
	r.CompleteStop(first, nil)
	if err := second.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, exists := r.Get("s1"); exists {
		t.Fatal("successful stop retained session")
	}
}

type sessionConnectionStub struct{}

func (sessionConnectionStub) Notify(string, any) error { return nil }
func (sessionConnectionStub) IsOpen() bool             { return true }

type processManagerBarrier struct {
	process  *process.Session
	visible  chan struct{}
	release  chan struct{}
	returned chan struct{}
	once     sync.Once
}

func (m *processManagerBarrier) Session(string) (*process.Session, bool) {
	m.once.Do(func() {
		close(m.visible)
		<-m.release
		close(m.returned)
	})
	return m.process, true
}

func (m *processManagerBarrier) Starting(string) bool { return false }

func TestRegistry_WaitForStartWaitsForManagerRegisterGap(t *testing.T) {
	r := NewRegistry()
	proc := &process.Session{}
	manager := &processManagerBarrier{
		process: proc, visible: make(chan struct{}), release: make(chan struct{}), returned: make(chan struct{}),
	}
	result := make(chan bool, 1)
	go func() { result <- r.WaitForStart(context.Background(), manager, "s1") }()
	<-manager.visible // The process is manager-visible but has no registry entry.
	close(manager.release)
	<-manager.returned
	r.Register("s1", nil, proc, "", "ws", "", false)
	if waited := <-result; !waited {
		t.Fatal("WaitForStart did not observe the registry insert")
	}
}

type replacementStartManager struct {
	firstSessionRead  chan struct{}
	secondSessionRead chan struct{}
	allowStarting     chan struct{}
	process           *process.Session
	secondReadOnce    sync.Once
}

func (m *replacementStartManager) Session(string) (*process.Session, bool) {
	select {
	case <-m.firstSessionRead:
		m.secondReadOnce.Do(func() { close(m.secondSessionRead) })
		return m.process, m.process != nil
	default:
		close(m.firstSessionRead)
		return nil, false
	}
}

func (m *replacementStartManager) Starting(string) bool {
	<-m.allowStarting
	return false
}

func TestRegistry_WaitForStartDoesNotMissManagerVisibilityBetweenReads(t *testing.T) {
	r := NewRegistry()
	manager := &replacementStartManager{
		firstSessionRead:  make(chan struct{}),
		secondSessionRead: make(chan struct{}),
		allowStarting:     make(chan struct{}),
		process:           &process.Session{},
	}
	result := make(chan bool, 1)
	go func() { result <- r.WaitForStart(context.Background(), manager, "s1") }()
	<-manager.firstSessionRead
	close(manager.allowStarting) // The manager is now visible and no longer starting.
	<-manager.secondSessionRead  // WaitForStart rechecked manager visibility before waiting for metadata.
	r.Register("s1", nil, manager.process, "", "ws", "", false)
	if waited := <-result; !waited {
		t.Fatal("WaitForStart did not observe registry admission")
	}
}

type processManagerState struct {
	process  *process.Session
	starting bool
}

func (m processManagerState) Session(string) (*process.Session, bool) {
	return m.process, m.process != nil
}

func (m processManagerState) Starting(string) bool { return m.starting }

func TestRegistry_WaitForStopRetiresCompletedGenerationWhenReplacementBegins(t *testing.T) {
	tests := []struct {
		name    string
		manager processManagerState
	}{
		{name: "replacement is reserved", manager: processManagerState{starting: true}},
		{name: "replacement is live", manager: processManagerState{process: &process.Session{}}},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			r := NewRegistry()
			stoppedProcess := &process.Session{}
			r.Register("s1", nil, stoppedProcess, "", "ws", "", false)
			claim, _, _ := r.ClaimStop("s1")
			r.CompleteStop(claim, nil)

			if r.WaitForStop(context.Background(), testCase.manager, "s1") {
				t.Fatal("stale completed stop authorized a replacement start")
			}
			if _, exists := r.completedStops["s1"]; exists {
				t.Fatal("replacement did not retire the completed stop record")
			}
		})
	}
}

func TestRegistry_WaitForStopDoesNotConsumeCompletedStopWhenReplacementStarts(t *testing.T) {
	r := NewRegistry()
	oldProcess := &process.Session{}
	r.Register("s1", nil, oldProcess, "", "ws", "", false)
	claim, _, _ := r.ClaimStop("s1")
	r.CompleteStop(claim, nil)
	manager := &replacementStartManager{
		firstSessionRead:  make(chan struct{}),
		secondSessionRead: make(chan struct{}),
		allowStarting:     make(chan struct{}),
	}
	result := make(chan bool, 1)
	go func() { result <- r.WaitForStop(context.Background(), manager, "s1") }()
	<-manager.firstSessionRead
	manager.process = &process.Session{} // Replacement becomes live before Starting is read.
	close(manager.allowStarting)
	if reused := <-result; reused {
		t.Fatal("completed stop authorized a replacement generation")
	}
}

func TestRegistry_BeginWorkspaceCleanupReturnsCrossingStopFailure(t *testing.T) {
	r := NewRegistry()
	admission, err := r.Admit("ws")
	if err != nil {
		t.Fatal(err)
	}
	changed := r.waitChange()
	result := make(chan error, 1)
	claimsResult := make(chan []*StopClaim, 1)
	go func() {
		_, claims, cleanupErr := r.BeginWorkspaceCleanup(context.Background(), "ws")
		claimsResult <- claims
		result <- cleanupErr
	}()
	<-changed // BeginWorkspaceCleanup set the closing marker.
	if r.RegisterAdmission(admission, "s1", nil, &process.Session{}, "", "", false) {
		t.Fatal("crossing manager start was registered")
	}
	stopFailure := errors.New("crossing process stop failed")
	r.RejectAdmission(admission, "s1", nil, &process.Session{}, "", "", false, stopFailure)
	claims := <-claimsResult
	if len(claims) != 1 || claims[0].SessionID() != "s1" {
		t.Fatalf("claims = %#v, want failed crossing session", claims)
	}
	if cleanupErr := <-result; !errors.Is(cleanupErr, stopFailure) {
		t.Fatalf("BeginWorkspaceCleanup error = %v, want %v", cleanupErr, stopFailure)
	}
}

func TestRegistry_StopClaimCannotDeleteReplacementGeneration(t *testing.T) {
	r := NewRegistry()
	oldProcess := &process.Session{}
	newProcess := &process.Session{}
	r.Register("s1", nil, oldProcess, "", "ws", "", false)
	claim, _, _ := r.ClaimStop("s1")
	r.Register("s1", nil, newProcess, "", "ws", "", false)
	r.CompleteStop(claim, nil)
	state, exists := r.Get("s1")
	if !exists || state.Process != newProcess {
		t.Fatalf("stale stop removed replacement: %#v", state)
	}
	if claim.Process() != oldProcess {
		t.Fatal("stop claim was not bound to the original process")
	}
}

func TestRegistry_AttachRejectsStopClaimWithoutMutation(t *testing.T) {
	r := NewRegistry()
	original := sessionConnectionStub{}
	r.Register("s1", original, &process.Session{}, "tab-1", "ws", "/old", false)
	r.ClaimStop("s1")
	if _, err := r.Attach("s1", nil, "tab-2", "ws", "/new"); !errors.Is(err, ErrSessionStopping) {
		t.Fatalf("Attach error = %v, want ErrSessionStopping", err)
	}
	state, _ := r.Get("s1")
	if state.Conn != original || state.TabID != "tab-1" || state.CWD != "/old" {
		t.Fatalf("stop-claim attach mutated state: %#v", state)
	}
}

func TestRegistry_StopStatusPrunesExpiredCompletedStop(t *testing.T) {
	r := NewRegistry()
	stoppedProcess := &process.Session{}
	r.completedStops["s1"] = completedStop{
		key:         stopKey{sessionID: "s1", generation: 1},
		process:     stoppedProcess,
		completedAt: time.Now().Add(-completedStopRetention),
	}

	_, _, _, hasCompleted, _ := r.stopStatus("s1")
	if hasCompleted {
		t.Fatal("expired completed stop remained available")
	}
	if _, exists := r.completedStops["s1"]; exists {
		t.Fatal("expired completed stop retained its process reference")
	}
}

func TestRegistry_ExpireCompletedStopRemovesProcessReference(t *testing.T) {
	r := NewRegistry()
	completedAt := time.Now()
	completed := completedStop{
		key:         stopKey{sessionID: "s1", generation: 1},
		process:     &process.Session{},
		completedAt: completedAt,
	}
	r.completedStops["s1"] = completed

	r.expireCompletedStop("s1", completed.key, completedAt)
	if _, exists := r.completedStops["s1"]; exists {
		t.Fatal("expired completed stop retained its process reference")
	}
}

func TestRegistry_CommitPreventsStaleAbortFromReopeningWorkspace(t *testing.T) {
	r := NewRegistry()
	cleanup, _, err := r.BeginWorkspaceCleanup(context.Background(), "ws")
	if err != nil {
		t.Fatal(err)
	}
	r.CommitWorkspaceCleanup(cleanup)
	r.AbortWorkspaceCleanup(cleanup)
	if _, err := r.Admit("ws"); !errors.Is(err, ErrWorkspaceClosing) {
		t.Fatalf("committed workspace admission = %v, want ErrWorkspaceClosing", err)
	}
}

func TestRegistry_StaleAbortCannotReopenReplacementCleanup(t *testing.T) {
	r := NewRegistry()
	first, _, err := r.BeginWorkspaceCleanup(context.Background(), "ws")
	if err != nil {
		t.Fatal(err)
	}
	r.AbortWorkspaceCleanup(first)
	second, _, err := r.BeginWorkspaceCleanup(context.Background(), "ws")
	if err != nil {
		t.Fatal(err)
	}
	r.AbortWorkspaceCleanup(first)
	if _, err := r.Admit("ws"); !errors.Is(err, ErrWorkspaceClosing) {
		t.Fatalf("stale abort reopened replacement cleanup: %v", err)
	}
	r.AbortWorkspaceCleanup(second)
	if admission, err := r.Admit("ws"); err != nil {
		t.Fatalf("current abort did not reopen admission: %v", err)
	} else {
		r.ReleaseAdmission(admission)
	}
}
