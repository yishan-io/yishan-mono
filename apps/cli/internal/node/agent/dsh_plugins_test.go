package agent

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/agent/dsh/plugins"
	"yishan/apps/cli/internal/rpc"
)

type snapshotDSHPluginManager struct {
	mu             sync.Mutex
	snapshot       string
	previous       string
	captureCount   int
	restoreCount   int
	firstMutation  chan struct{}
	secondMutation chan struct{}
}

func (m *snapshotDSHPluginManager) List(context.Context) (plugins.Inventory, error) {
	return plugins.Inventory{}, nil
}
func (m *snapshotDSHPluginManager) ListOfficial() []plugins.ApprovedBundle { return nil }
func (m *snapshotDSHPluginManager) Install(context.Context, string) (plugins.Inventory, error) {
	return plugins.Inventory{}, nil
}
func (m *snapshotDSHPluginManager) SetEnabled(_ context.Context, name string, _ bool) (plugins.Inventory, error) {
	m.mu.Lock()
	m.snapshot = name
	m.mu.Unlock()
	switch name {
	case "first":
		m.firstMutation <- struct{}{}
	case "second":
		m.secondMutation <- struct{}{}
	}
	return plugins.Inventory{Plugins: []plugins.Plugin{{Name: name}}}, nil
}
func (m *snapshotDSHPluginManager) Remove(context.Context, string) (plugins.Inventory, error) {
	return plugins.Inventory{}, nil
}
func (m *snapshotDSHPluginManager) Update(context.Context, string) (plugins.Inventory, error) {
	return plugins.Inventory{}, nil
}
func (m *snapshotDSHPluginManager) CaptureSnapshot(context.Context) (plugins.Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.previous = m.snapshot
	m.captureCount++
	return plugins.Snapshot{}, nil
}
func (m *snapshotDSHPluginManager) RestoreSnapshot(context.Context, plugins.Snapshot) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.snapshot = m.previous
	m.restoreCount++
	return nil
}

func (m *snapshotDSHPluginManager) currentSnapshot() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshot
}

type snapshotDSHPluginRuntime struct {
	manager             *snapshotDSHPluginManager
	mu                  sync.Mutex
	appliedSnapshot     string
	firstRestartStarted chan struct{}
	releaseFirstRestart chan struct{}
}

func (r *snapshotDSHPluginRuntime) Restart(context.Context) error {
	snapshot := r.manager.currentSnapshot()
	if snapshot == "first" {
		r.firstRestartStarted <- struct{}{}
		<-r.releaseFirstRestart
	}
	r.mu.Lock()
	r.appliedSnapshot = snapshot
	r.mu.Unlock()
	return nil
}

func (r *snapshotDSHPluginRuntime) Recover(ctx context.Context) error {
	return r.Restart(ctx)
}

func (r *snapshotDSHPluginRuntime) applied() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.appliedSnapshot
}

func startDSHPluginEnableMutation(service *Service, name string) <-chan error {
	done := make(chan error, 1)
	go func() {
		result, err := service.DSHSetPluginEnabled(context.Background(), rpc.DSHSetPluginEnabledParams{Name: name})
		if err == nil {
			if _, ok := result.(rpc.DSHPluginListResult); !ok {
				err = errors.New("plugin mutation returned an untyped RPC result")
			}
		}
		done <- err
	}()
	return done
}

func TestService_DSHPluginMutationsQueueSnapshotAndRuntimeRestart(t *testing.T) {
	manager := &snapshotDSHPluginManager{firstMutation: make(chan struct{}, 1), secondMutation: make(chan struct{}, 1)}
	runtime := &snapshotDSHPluginRuntime{manager: manager, firstRestartStarted: make(chan struct{}, 1), releaseFirstRestart: make(chan struct{})}
	service := NewService(Deps{DSHPlugins: manager, DSHPluginRuntime: runtime})
	firstDone := startDSHPluginEnableMutation(service, "first")
	<-manager.firstMutation
	<-runtime.firstRestartStarted

	secondDone := startDSHPluginEnableMutation(service, "second")
	select {
	case <-manager.secondMutation:
		t.Fatal("second snapshot mutation started before the first runtime restart finished")
	case <-time.After(20 * time.Millisecond):
	}

	close(runtime.releaseFirstRestart)
	if err := <-firstDone; err != nil {
		t.Fatalf("first mutation: %v", err)
	}
	if err := <-secondDone; err != nil {
		t.Fatalf("second mutation: %v", err)
	}
	if got := runtime.applied(); got != "second" {
		t.Fatalf("runtime applied snapshot = %q, want second", got)
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.restoreCount != 0 {
		t.Fatalf("snapshot restores = %d, want 0 after successful restarts", manager.restoreCount)
	}
}

type failingDSHPluginRuntime struct{ err error }

func (r failingDSHPluginRuntime) Restart(context.Context) error { return r.err }
func (r failingDSHPluginRuntime) Recover(context.Context) error { return r.err }

type rollbackSnapshotDSHPluginRuntime struct {
	manager   *snapshotDSHPluginManager
	errors    []error
	mu        sync.Mutex
	snapshots []string
	contexts  []context.Context
	cancel    context.CancelFunc
}

func (r *rollbackSnapshotDSHPluginRuntime) Restart(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.snapshots = append(r.snapshots, r.manager.currentSnapshot())
	r.contexts = append(r.contexts, ctx)
	if len(r.snapshots) == 1 && r.cancel != nil {
		r.cancel()
	}
	return r.errors[len(r.snapshots)-1]
}

func (r *rollbackSnapshotDSHPluginRuntime) Recover(ctx context.Context) error {
	return r.Restart(ctx)
}

func TestService_DSHPluginMutation_RecoversRestoredSnapshotAfterReplacementFailure(t *testing.T) {
	manager := &snapshotDSHPluginManager{snapshot: "prior", firstMutation: make(chan struct{}, 1), secondMutation: make(chan struct{}, 1)}
	ctx, cancel := context.WithCancel(context.Background())
	runtime := &rollbackSnapshotDSHPluginRuntime{
		manager: manager, errors: []error{context.Canceled, errors.New("rollback restart failed")}, cancel: cancel,
	}
	service := NewService(Deps{DSHPlugins: manager, DSHPluginRuntime: runtime})

	_, err := service.DSHSetPluginEnabled(ctx, rpc.DSHSetPluginEnabledParams{Name: "replacement"})
	if err == nil || !strings.Contains(err.Error(), "recover dsh runtime after restoring snapshot: rollback restart failed") {
		t.Fatalf("mutation error = %v, want rollback restart failure", err)
	}
	if got := manager.currentSnapshot(); got != "prior" {
		t.Fatalf("active snapshot = %q, want restored prior snapshot", got)
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if got := runtime.snapshots; len(got) != 2 || got[0] != "replacement" || got[1] != "prior" {
		t.Fatalf("restart snapshots = %#v, want [replacement prior]", got)
	}
	if err := runtime.contexts[1].Err(); err != nil {
		t.Fatalf("rollback restart context error = %v, want nil", err)
	}
}

func TestService_DSHPluginMutationRestoresSnapshotWhenRuntimeUnavailable(t *testing.T) {
	assertDSHPluginMutationRestoresSnapshot(t, dsh.ErrRuntimeUnavailable)
}

func TestService_DSHPluginMutationRestoresSnapshotWhenRuntimeShutsDown(t *testing.T) {
	assertDSHPluginMutationRestoresSnapshot(t, context.Canceled)
}

func assertDSHPluginMutationRestoresSnapshot(t *testing.T, restartErr error) {
	t.Helper()
	manager := &snapshotDSHPluginManager{
		snapshot:       "prior",
		firstMutation:  make(chan struct{}, 1),
		secondMutation: make(chan struct{}, 1),
	}
	service := NewService(Deps{DSHPlugins: manager, DSHPluginRuntime: failingDSHPluginRuntime{err: restartErr}})

	_, err := service.DSHSetPluginEnabled(context.Background(), rpc.DSHSetPluginEnabledParams{Name: "replacement"})
	if err == nil {
		t.Fatal("mutation succeeded after failed runtime restart")
	}
	if got := manager.currentSnapshot(); got != "prior" {
		t.Fatalf("active snapshot = %q, want prior", got)
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.captureCount != 1 || manager.restoreCount != 1 {
		t.Fatalf("snapshot lifecycle = capture %d, restore %d; want 1, 1", manager.captureCount, manager.restoreCount)
	}
}

func TestService_DSHLocalPluginRegisterRestoresSnapshotWhenRestartFails(t *testing.T) {
	store, bundle := newTestDSHLocalStore(t)
	service := NewService(Deps{DSHLocalPlugins: store, DSHPluginRuntime: failingDSHPluginRuntime{err: dsh.ErrRuntimeUnavailable}})

	_, err := service.DSHRegisterLocalPlugin(context.Background(), rpc.DSHLocalPluginRegisterParams{ID: "replacement", Path: bundle})
	if err == nil {
		t.Fatal("registration succeeded after failed runtime restart")
	}
	bundles, listErr := store.List()
	if listErr != nil {
		t.Fatalf("List: %v", listErr)
	}
	if len(bundles) != 0 {
		t.Fatalf("local bundles = %#v, want restored empty snapshot", bundles)
	}
}

func TestService_DSHLocalPluginRemoveRestoresSnapshotWhenRestartFails(t *testing.T) {
	store, bundle := newTestDSHLocalStore(t)
	if _, err := store.Register("prior", bundle); err != nil {
		t.Fatalf("Register prior: %v", err)
	}
	service := NewService(Deps{DSHLocalPlugins: store, DSHPluginRuntime: failingDSHPluginRuntime{err: context.Canceled}})

	_, err := service.DSHRemoveLocalPlugin(context.Background(), rpc.DSHLocalPluginNameParams{ID: "prior"})
	if err == nil {
		t.Fatal("removal succeeded after failed runtime restart")
	}
	bundles, listErr := store.List()
	if listErr != nil {
		t.Fatalf("List: %v", listErr)
	}
	if len(bundles) != 1 || bundles[0].ID != "prior" {
		t.Fatalf("local bundles = %#v, want restored prior snapshot", bundles)
	}
}

func newTestDSHLocalStore(t *testing.T) (*plugins.LocalStore, string) {
	t.Helper()
	store, err := plugins.NewLocalStore(t.TempDir(), true)
	if err != nil {
		t.Fatalf("NewLocalStore: %v", err)
	}
	bundle := t.TempDir()
	if err := os.WriteFile(filepath.Join(bundle, "yishan.plugin.json"), []byte(`{"version":1,"entries":[]}`), 0o600); err != nil {
		t.Fatalf("write local bundle: %v", err)
	}
	return store, bundle
}
