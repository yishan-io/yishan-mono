package rpc

import (
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskUpdateLinkStatusParams_DecodeTypedStatus(t *testing.T) {
	var params LocalTaskUpdateLinkStatusParams
	if err := json.Unmarshal([]byte(`{"linkId":"link-1","status":"paused"}`), &params); err != nil {
		t.Fatal(err)
	}
	if params.LinkID != "link-1" || params.Status != localtask.StatusPaused {
		t.Fatalf("params = %#v", params)
	}
}

func TestLocalTaskContextDetails_UsesV1DocumentFields(t *testing.T) {
	details := localtask.ContextDetails{
		Directory: "/context/task-1", PlanPath: "/context/task-1/plan.md",
		NotesPath: "/context/task-1/notes.md", OutcomePath: "/context/task-1/outcome.md",
	}
	encoded, err := json.Marshal(details)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"directory":"/context/task-1","planPath":"/context/task-1/plan.md","notesPath":"/context/task-1/notes.md","outcomePath":"/context/task-1/outcome.md"}`
	if string(encoded) != want {
		t.Fatalf("encoded details = %s, want %s", encoded, want)
	}
}

func TestLocalTaskWirePayloads_MatchDesktopContract(t *testing.T) {
	projectID := "project-1"
	completedAt := "2026-08-25"
	unlinkedAt := "2026-08-26"
	payloads := []struct {
		name     string
		value    any
		expected string
	}{
		{
			name:     "task",
			value:    localtask.Task{ID: "task-1", ProjectID: &projectID, Title: "Imported", Description: "Legacy metadata", Status: localtask.StatusCompleted, Priority: localtask.PriorityMedium, CreatedAt: "2026-08-24", UpdatedAt: "2026-08-26", CompletedAt: &completedAt},
			expected: `{"id":"task-1","projectId":"project-1","title":"Imported","description":"Legacy metadata","status":"completed","priority":"medium","createdAt":"2026-08-24","updatedAt":"2026-08-26","completedAt":"2026-08-25"}`,
		},
		{
			name:     "workspace link",
			value:    localtask.WorkspaceLink{ID: "link-1", LocalTaskID: "task-1", WorkspaceID: "workspace-1", Role: localtask.LinkRolePrimary, Status: localtask.StatusCompleted, LinkedAt: "2026-08-24", UnlinkedAt: &unlinkedAt},
			expected: `{"id":"link-1","localTaskId":"task-1","workspaceId":"workspace-1","role":"primary","status":"completed","linkedAt":"2026-08-24","unlinkedAt":"2026-08-26"}`,
		},
	}
	for _, payload := range payloads {
		t.Run(payload.name, func(t *testing.T) {
			encoded, err := json.Marshal(payload.value)
			if err != nil {
				t.Fatal(err)
			}
			if string(encoded) != payload.expected {
				t.Fatalf("encoded payload = %s, want %s", encoded, payload.expected)
			}
		})
	}
}
