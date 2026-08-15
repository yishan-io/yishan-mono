package session

import (
	"context"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/process"
)

// fakeProcessManager is a minimal ProcessManager for registry tests.
type fakeProcessManager struct {
	live     map[string]*process.Session
	starting map[string]struct{}
}

func (f *fakeProcessManager) Session(id string) (*process.Session, bool) {
	s, ok := f.live[id]
	return s, ok
}

func (f *fakeProcessManager) Starting(id string) bool {
	_, ok := f.starting[id]
	return ok
}

func TestRegistry_RegisterAttachDelete(t *testing.T) {
	r := NewRegistry()
	proc := &process.Session{}
	r.Register("s1", nil, proc, "tab-1", "ws-1", "/tmp", false)

	state, ok := r.Get("s1")
	if !ok || state.Process != proc || state.TabID != "tab-1" {
		t.Fatalf("unexpected registered state: %+v", state)
	}

	if _, ok := r.Attach("s1", nil, "tab-2", "", ""); !ok {
		t.Fatal("attach failed")
	}
	state, _ = r.Get("s1")
	if state.TabID != "tab-2" {
		t.Fatalf("attach did not rebind tabID, got %q", state.TabID)
	}

	r.Delete("s1")
	if _, ok := r.Get("s1"); ok {
		t.Fatal("session still present after delete")
	}
}

func TestRegistry_StoppingMarkers(t *testing.T) {
	r := NewRegistry()
	r.Register("s1", nil, &process.Session{}, "tab-1", "", "", false)

	if r.IsStopping("s1") {
		t.Fatal("fresh session must not be stopping")
	}
	if !r.MarkStopping("s1") {
		t.Fatal("MarkStopping must report existing session")
	}
	if !r.IsStopping("s1") {
		t.Fatal("expected stopping marker")
	}
	r.UnmarkStopping("s1")
	if r.IsStopping("s1") {
		t.Fatal("expected marker cleared")
	}
	if r.MarkStopping("absent") {
		t.Fatal("MarkStopping must fail for absent session")
	}
}

func TestRegistry_WaitForStopping(t *testing.T) {
	pm := &fakeProcessManager{live: map[string]*process.Session{"s1": {}}}
	r := NewRegistry()

	// Never marked as stopping + live → give up quickly (live session).
	if r.WaitForStopping(context.Background(), pm, "s1") {
		t.Fatal("expected false for a live session never marked stopping")
	}

	// Marked stopping + released → returns true.
	r.MarkStopping("s1")
	delete(pm.live, "s1")
	if !r.WaitForStopping(context.Background(), pm, "s1") {
		t.Fatal("expected true once the session is released")
	}
}

func TestRegistry_WaitForStart(t *testing.T) {
	pm := &fakeProcessManager{live: map[string]*process.Session{}, starting: map[string]struct{}{"s1": {}}}
	r := NewRegistry()

	// Id is starting but not registered yet → keep waiting; then register.
	pm.live["s1"] = &process.Session{}
	go func() {
		time.Sleep(100 * time.Millisecond)
		r.Register("s1", nil, pm.live["s1"], "tab-1", "", "", false)
		delete(pm.starting, "s1")
	}()
	if !r.WaitForStart(context.Background(), pm, "s1") {
		t.Fatal("expected true once the concurrent start finished")
	}

	// Id absent and not starting → immediate false.
	if r.WaitForStart(context.Background(), pm, "absent") {
		t.Fatal("expected false for absent session")
	}
}
