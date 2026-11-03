package sqlite

import (
	"context"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskStore_ConcurrentLinksReuseOriginal(t *testing.T) {
	store, workspaceStore := openTestLocalTaskStore(t)
	task := createTestLocalTask(t, store, "Concurrent pair")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	ctx := context.Background()
	request := localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusDone}
	const callers = 12
	results := make(chan localtask.WorkspaceLink, callers)
	failures := make(chan error, callers)
	start := make(chan struct{})
	for range callers {
		go func() {
			<-start
			link, err := store.LinkWorkspace(ctx, request)
			results <- link
			failures <- err
		}()
	}
	close(start)
	original := <-results
	for range callers {
		if err := <-failures; err != nil {
			t.Errorf("concurrent link: %v", err)
		}
	}
	for range callers - 1 {
		if link := <-results; link != original {
			t.Errorf("link = %#v, want %#v", link, original)
		}
	}
	links, err := store.ListTaskLinks(ctx, task.ID)
	if err != nil || len(links) != 1 || original.ID == "" || original.LinkedAt == "" {
		t.Fatalf("links = %#v, %v", links, err)
	}
}

func TestLocalTaskStore_RepeatedLinksPreserveEveryStatus(t *testing.T) {
	for _, status := range []localtask.Status{localtask.StatusNew, localtask.StatusProgressing, localtask.StatusDone, localtask.StatusCancelled} {
		t.Run(string(status), func(t *testing.T) {
			store, workspaceStore := openTestLocalTaskStore(t)
			task := createTestLocalTask(t, store, "Preserve original")
			createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
			ctx := context.Background()
			request := localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: status}
			original, err := store.LinkWorkspace(ctx, request)
			if err != nil {
				t.Fatal(err)
			}
			const linkedAt = "2020-01-01 00:00:00"
			if _, err := store.database.ExecContext(ctx, `UPDATE local_task_workspace_links SET linked_at = ? WHERE id = ?`, linkedAt, original.ID); err != nil {
				t.Fatal(err)
			}
			original.LinkedAt = linkedAt
			request.Status = localtask.StatusProgressing
			repeated, err := store.LinkWorkspace(ctx, request)
			if err != nil || repeated != original {
				t.Fatalf("repeat = %#v, %v, want %#v", repeated, err, original)
			}
		})
	}
}

func TestLocalTaskStore_LinksRemainManyToMany(t *testing.T) {
	store, workspaceStore := openTestLocalTaskStore(t)
	first := createTestLocalTask(t, store, "First")
	second := createTestLocalTask(t, store, "Second")
	for _, workspaceID := range []string{"workspace-1", "workspace-2"} {
		if err := workspaceStore.Create(context.Background(), &Workspace{ID: workspaceID, ProjectID: workspaceID, Kind: "folder", Status: "active", LocalPath: "/tmp/" + workspaceID, State: "active"}); err != nil {
			t.Fatal(err)
		}
		for _, task := range []localtask.Task{first, second} {
			_, err := store.LinkWorkspace(context.Background(), localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: workspaceID, Status: localtask.StatusProgressing})
			if err != nil {
				t.Fatal(err)
			}
		}
		links, err := store.ListWorkspaceLinks(context.Background(), workspaceID)
		if err != nil || len(links) != 2 || hasUnlinkedWorkspaceLink(links) {
			t.Fatalf("workspace links = %#v, %v", links, err)
		}
	}
	for _, task := range []localtask.Task{first, second} {
		links, err := store.ListTaskLinks(context.Background(), task.ID)
		if err != nil || len(links) != 2 || hasUnlinkedWorkspaceLink(links) {
			t.Fatalf("task links = %#v, %v", links, err)
		}
	}
}

func TestLocalTaskStore_LinkUnlinkInterleavingReturnsActiveSnapshot(t *testing.T) {
	store, workspaceStore := openTestLocalTaskStore(t)
	task := createTestLocalTask(t, store, "Interleaved pair")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	request := localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusDone}
	original, err := store.LinkWorkspace(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	var callers sync.WaitGroup
	start := make(chan struct{})
	for _, shouldUnlink := range []bool{false, true} {
		callers.Add(1)
		go func() {
			defer callers.Done()
			<-start
			exerciseWorkspaceLinkInterleaving(t, ctx, store, request, original.ID, shouldUnlink)
		}()
	}
	close(start)
	callers.Wait()
	links, err := store.ListTaskLinks(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	active := 0
	for _, link := range links {
		if link.UnlinkedAt == nil {
			active++
		}
	}
	if active != 1 || len(links) != 301 {
		t.Fatalf("active links = %d, history rows = %d, want 1 and 301", active, len(links))
	}
}

func exerciseWorkspaceLinkInterleaving(t *testing.T, ctx context.Context, store *LocalTaskStore, request localtask.WorkspaceLink, linkID string, shouldUnlink bool) {
	t.Helper()
	for range 300 {
		if shouldUnlink {
			if err := store.UnlinkWorkspace(ctx, linkID); err != nil {
				t.Errorf("interleaved unlink: %v", err)
				return
			}
		}
		link, err := store.LinkWorkspace(ctx, request)
		if err != nil {
			t.Errorf("interleaved link: %v", err)
			return
		}
		if link.ID == "" || link.LinkedAt == "" || link.UnlinkedAt != nil || link.Status != request.Status {
			t.Errorf("link returned non-active snapshot: %#v", link)
			return
		}
		linkID = link.ID
	}
}
