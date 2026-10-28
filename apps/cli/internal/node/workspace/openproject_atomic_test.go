package workspace

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// pauseRelinkConnector keeps real SQLite reads/writes, pausing only the first
// UPDATE so another request can finish its ownership checks before it commits.
type pauseRelinkConnector struct {
	base     driver.Driver
	path     string
	didPause atomic.Bool
	reached  chan struct{}
	release  chan struct{}
}

func (c *pauseRelinkConnector) Connect(context.Context) (driver.Conn, error) {
	conn, err := c.base.Open(c.path)
	if err != nil {
		return nil, err
	}
	return &pauseRelinkConn{Conn: conn, connector: c}, nil
}

func (c *pauseRelinkConnector) Driver() driver.Driver { return c.base }

type pauseRelinkConn struct {
	driver.Conn
	connector *pauseRelinkConnector
}

func (c *pauseRelinkConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	return c.Conn.(driver.QueryerContext).QueryContext(ctx, query, args)
}

func (c *pauseRelinkConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if strings.HasPrefix(query, "UPDATE workspaces") && !c.connector.didPause.Swap(true) {
		close(c.connector.reached)
		select {
		case <-c.connector.release:
		case <-ctx.Done():
		}
	}
	return c.Conn.(driver.ExecerContext).ExecContext(ctx, query, args)
}

func pauseFirstRelinkWrite(t *testing.T, s *Service) (<-chan struct{}, func()) {
	t.Helper()
	var sequence int
	var name, path string
	if err := s.deps.Database.QueryRow("PRAGMA database_list").Scan(&sequence, &name, &path); err != nil {
		t.Fatal(err)
	}
	connector := &pauseRelinkConnector{base: s.deps.Database.Driver(), path: path,
		reached: make(chan struct{}), release: make(chan struct{})}
	database := sql.OpenDB(connector)
	database.SetMaxOpenConns(2)
	t.Cleanup(func() { _ = database.Close() })
	s.deps.Database = database
	var once sync.Once
	release := func() { once.Do(func() { close(connector.release) }) }
	t.Cleanup(release)
	return connector.reached, release
}

func TestWorkspaceOpenProject_ConcurrentRelinksRejectSharedTarget(t *testing.T) {
	s, store, entries := newConcurrentRelinkFixture(t)
	target := entries[0].WorktreePath
	reached, release := pauseFirstRelinkWrite(t, s)
	first := openRelinkAsync(s, entries[0])
	select {
	case <-reached:
	case <-time.After(5 * time.Second):
		t.Fatal("first relink did not reach persistence")
	}
	second := openRelinkAsync(s, entries[1])
	var secondErr error
	select {
	case secondErr = <-second:
		release()
	case <-time.After(250 * time.Millisecond):
		release()
		secondErr = <-second
	}
	firstErr := <-first
	var rejection *workspace.Error
	if firstErr != nil || !errors.As(secondErr, &rejection) || rejection.Code != workspace.ErrCodeInvalidParams {
		t.Fatalf("first = %v, second = %v; want one success and one rejection", firstErr, secondErr)
	}
	assertSingleRelinkOwner(t, s, store, target, entries[0].WorkspaceID)
}

func newConcurrentRelinkFixture(t *testing.T) (*Service, *sqlite.WorkspaceStore, []rpc.WorkspaceOpenProjectEntry) {
	t.Helper()
	s, store := newFolderHandler(t)
	target := evalSymlinks(t, t.TempDir())
	entries := make([]rpc.WorkspaceOpenProjectEntry, 2)
	for index, id := range []string{"relink-first", "relink-second"} {
		row := sqlite.Workspace{ID: id, ProjectID: id, NodeID: "node-1", Kind: "primary", Status: "active", LocalPath: t.TempDir()}
		if err := store.Create(context.Background(), &row); err != nil {
			t.Fatal(err)
		}
		entries[index] = rpc.WorkspaceOpenProjectEntry{WorkspaceID: id, ProjectID: id, WorktreePath: target, Kind: "primary"}
	}
	t.Cleanup(s.deps.PRTracker.Stop)
	return s, store, entries
}

func openRelinkAsync(s *Service, entry rpc.WorkspaceOpenProjectEntry) <-chan error {
	completed := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _, err := s.openProjectWorkspace(ctx, entry)
		completed <- err
	}()
	return completed
}

func assertSingleRelinkOwner(t *testing.T, s *Service, store *sqlite.WorkspaceStore, target, ownerID string) {
	t.Helper()
	rows, err := store.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, row := range rows {
		if row.LocalPath == target {
			count++
		}
	}
	if count != 1 {
		t.Errorf("SQLite target owners = %d, want 1", count)
	}
	owner, ok := s.deps.Registry.GetByPath(target)
	if !ok || owner.ID != ownerID {
		t.Errorf("runtime target owner = %#v, exists = %v", owner, ok)
	}
}
