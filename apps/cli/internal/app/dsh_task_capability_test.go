package app

import (
	"encoding/json"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/workspace"
)

func TestDSHTaskScopeAuthorizesProjectAndOrganization(t *testing.T) {
	projectID, organizationID := "project-1", "org-1"
	scope := dshTaskScope{workspace: workspace.Workspace{ID: "workspace-1", ProjectID: projectID, OrgID: organizationID}}
	if err := scope.authorizeTask(domain.Task{ProjectID: &projectID, OrganizationID: &organizationID}); err != nil {
		t.Fatal(err)
	}
	otherOrganization := "org-2"
	if err := scope.authorizeTask(domain.Task{ProjectID: &projectID, OrganizationID: &otherOrganization}); err == nil {
		t.Fatal("cross-organization task was authorized")
	}
	if err := scope.authorizeTask(domain.Task{ProjectID: &projectID}); err == nil {
		t.Fatal("nil-organization task was authorized")
	}
}

func TestDSHTaskScopeFiltersCrossOrganizationLists(t *testing.T) {
	projectID, organizationID := "project-1", "org-1"
	otherOrganization := "org-2"
	scope := dshTaskScope{workspace: workspace.Workspace{ProjectID: projectID, OrgID: organizationID}}
	filtered := scope.filterTasks([]domain.Task{
		{ID: "allowed", ProjectID: &projectID, OrganizationID: &organizationID},
		{ID: "denied", ProjectID: &projectID, OrganizationID: &otherOrganization},
	})
	if len(filtered) != 1 || filtered[0].ID != "allowed" {
		t.Fatalf("filtered tasks = %#v", filtered)
	}
}

func TestDSHTaskScopeRestrictsWorkspaceToAdmittedIdentity(t *testing.T) {
	scope := dshTaskScope{workspace: workspace.Workspace{ID: "workspace-1"}}
	if err := scope.authorizeWorkspaceID("workspace-1"); err != nil {
		t.Fatal(err)
	}
	if err := scope.authorizeWorkspaceID("workspace-2"); err == nil {
		t.Fatal("different workspace was authorized")
	}
}

func TestDSHTaskSearchInputStrictlyDecodesEmbeddedFilters(t *testing.T) {
	request := taskRequest(dshTaskSearchOperation, map[string]any{"query": "plugin", "status": []string{"new"}})
	input, err := decodeDSHCapabilityInput[dshTaskSearchInput](request, dshTaskSearchOperation)
	if err != nil || input.Query != "plugin" || len(input.Status) == 0 {
		t.Fatalf("input=%#v err=%v", input, err)
	}
	request = taskRequest(dshTaskSearchOperation, map[string]any{"query": "plugin", "unknown": true})
	if _, err := decodeDSHCapabilityInput[dshTaskSearchInput](request, dshTaskSearchOperation); err == nil {
		t.Fatal("unknown task search field was accepted")
	}
}

func TestParseDSHTaskStatusesAcceptsScalarAndArray(t *testing.T) {
	status, statuses, err := parseDSHTaskStatuses(json.RawMessage(`"new"`))
	if err != nil || status == nil || *status != domain.StatusNew || statuses != nil {
		t.Fatalf("scalar status=%v statuses=%v err=%v", status, statuses, err)
	}
	status, statuses, err = parseDSHTaskStatuses(json.RawMessage(`["new","progressing"]`))
	if err != nil || status != nil || len(statuses) != 2 {
		t.Fatalf("array status=%v statuses=%v err=%v", status, statuses, err)
	}
}
