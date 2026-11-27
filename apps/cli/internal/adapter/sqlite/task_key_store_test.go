package sqlite

import (
	"context"
	"testing"
)

func TestTaskKeyStoreContinuesAfterExistingKeys(t *testing.T) {
	ctx := context.Background()
	database, _ := openProjectTestStore(t)
	if _, err := database.Exec(`INSERT INTO local_tasks (id, title, status, priority, task_key) VALUES ('t1', 'one', 'new', 'medium', 'PROJ-7'), ('t2', 'two', 'new', 'medium', 'PROJX-40'), ('t3', 'three', 'new', 'medium', 'PERS-2')`); err != nil {
		t.Fatalf("seed tasks: %v", err)
	}
	store := NewTaskKeyStore(database)
	for _, want := range []string{"PROJ-8", "PROJ-9"} {
		key, err := store.Allocate(ctx, ProjectTaskKeyScope("p1"), "PROJ")
		if err != nil || key != want {
			t.Fatalf("allocate: got %q err=%v, want %q", key, err, want)
		}
	}
	if key, _ := store.Allocate(ctx, PersonalTaskKeyScope, "PERS"); key != "PERS-3" {
		t.Fatalf("expected PERS-3, got %q", key)
	}
	if key, _ := store.Allocate(ctx, ProjectTaskKeyScope("p2"), "NEW"); key != "NEW-1" {
		t.Fatalf("expected NEW-1 for a fresh prefix, got %q", key)
	}
}
