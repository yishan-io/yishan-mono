package workspace

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func newPathReconciliationFixture(t *testing.T) (*Service, *sqlite.WorkspaceStore, workspace.Workspace) {
	t.Helper()
	s, store := newFolderHandler(t)
	s.deps.Store = sqlite.NewStore(store)
	repoPath := filepath.Join(t.TempDir(), "original")
	if output, err := exec.Command("git", "init", repoPath).CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, output)
	}
	branch, name := "main", "My project"
	row := sqlite.Workspace{ID: "primary-rename", OrganizationID: "org-1", ProjectID: "proj-1",
		NodeID: "node-1", Kind: "primary", Status: "active", LocalPath: repoPath,
		Branch: &branch, SourceBranch: &branch, Name: &name}
	if err := store.Create(context.Background(), &row); err != nil {
		t.Fatal(err)
	}
	ws, err := s.Open(workspace.OpenRequest{ID: row.ID, Path: repoPath, OrgID: row.OrganizationID,
		ProjectID: row.ProjectID, Kind: workspace.KindPrimary})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.WatchAndTrack(ws); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.deps.PRTracker.Stop)
	return s, store, ws
}

func TestWorkspaceOpenProject_RenamedPath(t *testing.T) {
	for _, isMissing := range []bool{false, true} {
		t.Run(map[bool]string{false: "active", true: "missing-after-hydration"}[isMissing], func(t *testing.T) {
			s, store, before := newPathReconciliationFixture(t)
			oldRow, err := store.Get(context.Background(), before.ID)
			if err != nil {
				t.Fatal(err)
			}
			newPath := filepath.Join(filepath.Dir(before.Path), "renamed")
			if err := os.Rename(before.Path, newPath); err != nil {
				t.Fatal(err)
			}
			if isMissing {
				if err := s.Hydrate(context.Background()); err != nil {
					t.Fatal(err)
				}
				broken, _ := s.GetWorkspace(before.ID)
				if broken.Health != workspace.HealthPathMissing {
					t.Fatalf("missing health = %q", broken.Health)
				}
			}
			result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{WorkspaceID: before.ID,
				WorktreePath: newPath, ProjectID: before.ProjectID, OrgID: before.OrgID, Kind: "primary"})
			if len(result.Errors) != 0 || len(result.Opened) != 1 {
				t.Fatalf("open result: %#v", result)
			}
			assertReconciledPath(t, s, store, before, oldRow, newPath)
		})
	}
}

func TestWorkspaceOpenProject_InvalidChangedPathPreservesState(t *testing.T) {
	for _, target := range []string{"missing", "file"} {
		t.Run(target, func(t *testing.T) {
			s, store, before := newPathReconciliationFixture(t)
			oldRow, err := store.Get(context.Background(), before.ID)
			if err != nil {
				t.Fatal(err)
			}
			invalidPath := filepath.Join(t.TempDir(), target)
			if target == "file" {
				if err := os.WriteFile(invalidPath, []byte("not a directory"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{WorkspaceID: before.ID,
				WorktreePath: invalidPath, ProjectID: before.ProjectID, OrgID: before.OrgID, Kind: "primary"})
			if len(result.Errors) != 1 || len(result.Opened) != 0 || len(result.Skipped) != 0 {
				t.Fatalf("invalid target result = %#v", result)
			}
			after, _ := s.GetWorkspace(before.ID)
			newRow, err := store.Get(context.Background(), before.ID)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(after, before) || !reflect.DeepEqual(newRow, oldRow) {
				t.Fatal("invalid target changed prior state")
			}
			if !s.deps.Watchers.IsWatching(before.Path) {
				t.Error("prior watcher removed")
			}
		})
	}
}

func assertReconciledPath(t *testing.T, s *Service, store *sqlite.WorkspaceStore, before workspace.Workspace, oldRow sqlite.Workspace, newPath string) {
	t.Helper()
	after, err := s.GetWorkspace(before.ID)
	if err != nil {
		t.Fatal(err)
	}
	expected := before
	expected.Path = newPath
	if !reflect.DeepEqual(after, expected) {
		t.Errorf("runtime = %#v, want %#v", after, expected)
	}
	newRow, err := store.Get(context.Background(), before.ID)
	if err != nil {
		t.Fatal(err)
	}
	oldRow.LocalPath, oldRow.UpdatedAt = newPath, newRow.UpdatedAt
	oldRow.State, oldRow.Health = "active", newRow.Health
	if !reflect.DeepEqual(newRow, oldRow) {
		t.Errorf("row = %#v, want %#v", newRow, oldRow)
	}
	if newRow.Health != nil && *newRow.Health != "" {
		t.Errorf("health = %q", *newRow.Health)
	}
	if s.deps.Watchers.IsWatching(before.Path) {
		t.Error("old watcher remains")
	}
	if !s.deps.Watchers.IsWatching(newPath) {
		t.Error("new watcher missing")
	}
	if _, ok := s.deps.Registry.GetByPath(before.Path); ok {
		t.Error("old runtime path remains")
	}
}
