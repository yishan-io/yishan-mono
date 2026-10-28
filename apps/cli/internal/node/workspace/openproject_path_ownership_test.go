package workspace

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestWorkspaceOpenProject_ChangedPathRejectsOwnershipConflict(t *testing.T) {
	for _, source := range []string{"runtime", "sqlite", "sqlite-without-runtime"} {
		for _, field := range []string{"project", "org"} {
			t.Run(source+"/"+field, func(t *testing.T) {
				s, store, before := newPathReconciliationFixture(t)
				entry := rpc.WorkspaceOpenProjectEntry{WorkspaceID: before.ID, WorktreePath: t.TempDir(),
					ProjectID: before.ProjectID, OrgID: before.OrgID, Kind: "primary"}
				if field == "project" {
					entry.ProjectID = "other-project"
				} else {
					entry.OrgID = "other-org"
				}
				if source == "runtime" {
					row, _ := store.Get(context.Background(), before.ID)
					row.ProjectID, row.OrganizationID = entry.ProjectID, entry.OrgID
					if err := store.Delete(context.Background(), before.ID); err != nil {
						t.Fatal(err)
					}
					if err := store.Create(context.Background(), &row); err != nil {
						t.Fatal(err)
					}
				} else if source == "sqlite" {
					s.deps.Registry.Open(workspace.Workspace{ID: before.ID, Path: before.Path,
						ProjectID: entry.ProjectID, OrgID: entry.OrgID, Kind: before.Kind, State: before.State})
				} else {
					s.deps.Registry.Remove(before.ID)
				}
				assertRejectedOpenPreservesPaths(t, s, store, entry)
			})
		}
	}
}

func TestWorkspaceOpenProject_ChangedPathRejectsOccupiedDestination(t *testing.T) {
	for _, source := range []string{"runtime", "sqlite", "both"} {
		t.Run(source, func(t *testing.T) {
			s, store, before := newPathReconciliationFixture(t)
			destination := evalSymlinks(t, t.TempDir())
			if source != "sqlite" {
				if _, err := s.Open(workspace.OpenRequest{ID: "destination-owner", Path: destination,
					ProjectID: before.ProjectID, OrgID: before.OrgID}); err != nil {
					t.Fatal(err)
				}
			}
			if source != "runtime" {
				row := sqlite.Workspace{ID: "destination-owner", LocalPath: destination,
					OrganizationID: before.OrgID, ProjectID: before.ProjectID, NodeID: "node-1", Kind: "primary", Status: "active"}
				if err := store.Create(context.Background(), &row); err != nil {
					t.Fatal(err)
				}
			}
			assertRejectedOpenPreservesPaths(t, s, store, rpc.WorkspaceOpenProjectEntry{WorkspaceID: before.ID,
				WorktreePath: filepath.Join(destination, "."), ProjectID: before.ProjectID, OrgID: before.OrgID, Kind: "primary"})
		})
	}
}

func assertRejectedOpenPreservesPaths(t *testing.T, s *Service, store *sqlite.WorkspaceStore, entry rpc.WorkspaceOpenProjectEntry) {
	t.Helper()
	rows, err := store.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	runtime := s.deps.Registry.List()
	result := callOpenProject(t, s, entry)
	if len(result.Errors) != 1 || len(result.Opened) != 0 || len(result.Skipped) != 0 {
		t.Errorf("conflicting open result = %#v", result)
	}
	afterRows, err := store.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(rows, afterRows) {
		t.Error("rejected open changed SQLite rows")
	}
	for _, before := range runtime {
		after, ok := s.deps.Registry.Get(before.ID)
		if !ok || !reflect.DeepEqual(before, after) {
			t.Errorf("runtime workspace %s changed", before.ID)
		}
	}
	if len(runtime) != len(s.deps.Registry.List()) {
		t.Error("runtime workspace count changed")
	}
}

func TestWorkspaceOpenProject_ChangedPathPreservesOmittedOwnership(t *testing.T) {
	for _, hasRuntime := range []bool{true, false} {
		t.Run(map[bool]string{true: "runtime", false: "sqlite-only"}[hasRuntime], func(t *testing.T) {
			s, store, before := newPathReconciliationFixture(t)
			if !hasRuntime {
				s.deps.Registry.Remove(before.ID)
			}
			destination := evalSymlinks(t, t.TempDir())
			result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{WorkspaceID: before.ID,
				WorktreePath: destination, Kind: "primary"})
			if len(result.Errors) != 0 || len(result.Opened) != 1 {
				t.Fatalf("open = %#v", result)
			}
			after, _ := s.GetWorkspace(before.ID)
			row, err := store.Get(context.Background(), before.ID)
			if err != nil {
				t.Fatal(err)
			}
			if after.ProjectID != before.ProjectID || after.OrgID != before.OrgID ||
				row.ProjectID != before.ProjectID || row.OrganizationID != before.OrgID {
				t.Fatalf("ownership lost: runtime=%#v row=%#v", after, row)
			}
		})
	}
}

func TestWorkspaceOpenProject_ChangedPathReconcilesMissingMetadata(t *testing.T) {
	for _, source := range []string{"runtime", "sqlite", "both"} {
		t.Run(source, func(t *testing.T) {
			s, store, before := newPathReconciliationFixture(t)
			if source != "sqlite" {
				s.deps.Registry.Remove(before.ID)
				s.deps.Registry.Open(workspace.Workspace{ID: before.ID, Path: before.Path,
					Kind: before.Kind, State: before.State})
			}
			if source != "runtime" {
				row, err := store.Get(context.Background(), before.ID)
				if err != nil {
					t.Fatal(err)
				}
				row.ProjectID, row.OrganizationID = "", ""
				if err := store.Delete(context.Background(), before.ID); err != nil {
					t.Fatal(err)
				}
				if err := store.Create(context.Background(), &row); err != nil {
					t.Fatal(err)
				}
			}
			result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{WorkspaceID: before.ID,
				WorktreePath: t.TempDir(), ProjectID: before.ProjectID, OrgID: before.OrgID, Kind: "primary"})
			if len(result.Errors) != 0 || len(result.Opened) != 1 {
				t.Fatalf("open = %#v", result)
			}
			after, _ := s.GetWorkspace(before.ID)
			if after.ProjectID != before.ProjectID || after.OrgID != before.OrgID {
				t.Fatalf("missing metadata not reconciled: %#v", after)
			}
		})
	}
}
