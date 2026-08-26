package rpc

import (
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskUpdateLinkStatusParams_DecodeTypedStatus(t *testing.T) {
	var params LocalTaskUpdateLinkStatusParams
	if err := json.Unmarshal([]byte(`{"linkId":"link-1","status":"cancelled"}`), &params); err != nil {
		t.Fatal(err)
	}
	if params.LinkID != "link-1" || params.Status != localtask.StatusCancelled {
		t.Fatalf("params = %#v", params)
	}
}

func TestLocalTaskContextDetails_UsesExistingDocumentFields(t *testing.T) {
	details := localtask.ContextDetails{
		Directory: "/context/task-1",
		Files:     []localtask.ContextFile{{Name: "plan.md", Path: "/context/task-1/plan.md"}},
	}
	encoded, err := json.Marshal(details)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"directory":"/context/task-1","files":[{"name":"plan.md","path":"/context/task-1/plan.md"}]}`
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
			name:     "task with tags",
			value:    localtask.Task{ID: "task-1", ProjectID: &projectID, Title: "Imported", Description: "Legacy metadata", Status: localtask.StatusDone, Priority: localtask.PriorityMedium, CreatedAt: "2026-08-24", UpdatedAt: "2026-08-26", CompletedAt: &completedAt, Tags: []string{"first", "second"}, TagRefs: []localtask.TagRef{}},
			expected: `{"id":"task-1","projectId":"project-1","title":"Imported","description":"Legacy metadata","status":"done","priority":"medium","createdAt":"2026-08-24","updatedAt":"2026-08-26","completedAt":"2026-08-25","tags":["first","second"],"tagRefs":[]}`,
		},
		{
			name:     "task without tags",
			value:    localtask.Task{ID: "task-2", Title: "Empty", Status: localtask.StatusProgressing, Priority: localtask.PriorityMedium, Tags: []string{}, TagRefs: []localtask.TagRef{}},
			expected: `{"id":"task-2","projectId":null,"title":"Empty","description":"","status":"progressing","priority":"medium","createdAt":"","updatedAt":"","completedAt":null,"tags":[],"tagRefs":[]}`,
		},
		{
			name:     "workspace link",
			value:    localtask.WorkspaceLink{ID: "link-1", LocalTaskID: "task-1", WorkspaceID: "workspace-1", Status: localtask.StatusDone, LinkedAt: "2026-08-24", UnlinkedAt: &unlinkedAt},
			expected: `{"id":"link-1","localTaskId":"task-1","workspaceId":"workspace-1","status":"done","linkedAt":"2026-08-24","unlinkedAt":"2026-08-26"}`,
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

func TestLocalTaskTagParams_PreserveExplicitEmptyUpdate(t *testing.T) {
	var create LocalTaskCreateParams
	if err := json.Unmarshal([]byte(`{"title":"Tagged","tags":["first"]}`), &create); err != nil {
		t.Fatal(err)
	}
	if len(create.Tags) != 1 || create.Tags[0] != "first" {
		t.Fatalf("create tags = %#v", create.Tags)
	}

	var update LocalTaskUpdateParams
	if err := json.Unmarshal([]byte(`{"id":"task-1","tags":[],"tagRefs":[]}`), &update); err != nil {
		t.Fatal(err)
	}
	if update.Tags == nil || len(*update.Tags) != 0 {
		t.Fatalf("update tags = %#v, want explicit empty", update.Tags)
	}
}
