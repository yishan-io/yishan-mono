package localtask

import (
	"encoding/json"
	"testing"
)

func TestValidateTask_RejectsMissingFieldsAndInvalidEnums(t *testing.T) {
	tests := []struct {
		name string
		task Task
	}{
		{name: "missing id", task: Task{Title: "Task", Status: StatusActive, Priority: PriorityMedium}},
		{name: "missing title", task: Task{ID: "task-1", Status: StatusActive, Priority: PriorityMedium}},
		{name: "invalid status", task: Task{ID: "task-1", Title: "Task", Status: "other", Priority: PriorityMedium}},
		{name: "invalid priority", task: Task{ID: "task-1", Title: "Task", Status: StatusActive, Priority: "other"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := ValidateTask(test.task); err != ErrInvalidTask {
				t.Fatalf("ValidateTask() error = %v, want %v", err, ErrInvalidTask)
			}
		})
	}
}

func TestValidateTaskUpdate_RejectsInvalidValues(t *testing.T) {
	emptyTitle := ""
	invalidStatus := Status("other")
	invalidPriority := Priority("other")
	for _, update := range []TaskUpdate{{Title: &emptyTitle}, {Status: &invalidStatus}, {Priority: &invalidPriority}} {
		if err := ValidateTaskUpdate(update); err != ErrInvalidTask {
			t.Fatalf("ValidateTaskUpdate(%#v) error = %v, want %v", update, err, ErrInvalidTask)
		}
	}
}

func TestValidateWorkspaceLink_RejectsInvalidValues(t *testing.T) {
	link := WorkspaceLink{ID: "link-1", LocalTaskID: "task-1", WorkspaceID: "workspace-1", Status: StatusActive}
	if err := ValidateWorkspaceLink(link); err != nil {
		t.Fatalf("ValidateWorkspaceLink() error = %v", err)
	}
	link.Status = "other"
	if err := ValidateWorkspaceLink(link); err != ErrInvalidLink {
		t.Fatalf("ValidateWorkspaceLink() error = %v, want %v", err, ErrInvalidLink)
	}
}

func TestValidateLinkStatus_AcceptsLifecycleStatuses(t *testing.T) {
	tests := []struct {
		status Status
		want   error
	}{
		{StatusActive, nil},
		{StatusPaused, nil},
		{StatusCompleted, nil},
		{Status("invalid"), ErrInvalidLink},
	}
	for _, test := range tests {
		if got := ValidateLinkStatus(test.status); got != test.want {
			t.Fatalf("ValidateLinkStatus(%q) = %v, want %v", test.status, got, test.want)
		}
	}
}

func TestTaskAndWorkspaceLink_JSONIncludesNullableFields(t *testing.T) {
	taskJSON, err := json.Marshal(Task{ID: "task-1", Title: "Task", Description: "", Status: StatusActive, Priority: PriorityMedium, Tags: []string{}, TagRefs: []TagRef{}})
	if err != nil {
		t.Fatal(err)
	}
	wantTask := `{"id":"task-1","projectId":null,"title":"Task","description":"","status":"active","priority":"medium","createdAt":"","updatedAt":"","completedAt":null,"tags":[],"tagRefs":[]}`
	if string(taskJSON) != wantTask {
		t.Fatalf("encoded task = %s, want %s", taskJSON, wantTask)
	}

	linkJSON, err := json.Marshal(WorkspaceLink{ID: "link-1", LocalTaskID: "task-1", WorkspaceID: "workspace-1", Status: StatusActive})
	if err != nil {
		t.Fatal(err)
	}
	wantLink := `{"id":"link-1","localTaskId":"task-1","workspaceId":"workspace-1","status":"active","linkedAt":"","unlinkedAt":null}`
	if string(linkJSON) != wantLink {
		t.Fatalf("encoded link = %s, want %s", linkJSON, wantLink)
	}
}
