package app

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	nodeproject "yishan/apps/cli/internal/node/project"
)

func TestLocalKeyAllocator_AllocatesProjectAndPersonalKeys(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	prefix := "PROJ"
	if err := sqlite.NewProjectStore(database).Create(ctx, sqlite.Project{ID: "project-1", OrganizationID: "org-1", Name: "Project", SourceType: "unknown", TaskPrefix: &prefix}, nil); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	allocator := newLocalKeyAllocator(nodeproject.NewService(nodeproject.Deps{Database: database}), sqlite.NewTaskKeyStore(database))
	projectID, missingID, folderID := "project-1", "deleted-project", "folder-1"
	folderKind := localtask.ProjectKindFolder
	cases := []struct {
		request nodelocaltask.KeyAllocationRequest
		want    string
	}{
		{nodelocaltask.KeyAllocationRequest{TaskID: "a", ProjectID: &projectID}, "PROJ-1"},
		{nodelocaltask.KeyAllocationRequest{TaskID: "b", ProjectID: &projectID}, "PROJ-2"},
		{nodelocaltask.KeyAllocationRequest{TaskID: "c"}, "PERS-1"},
		{nodelocaltask.KeyAllocationRequest{TaskID: "d", ProjectID: &missingID}, "PERS-2"},
		{nodelocaltask.KeyAllocationRequest{TaskID: "e", ProjectID: &folderID, ProjectKind: &folderKind}, "PERS-3"},
	}
	for _, testCase := range cases {
		key, err := allocator.AllocateTaskKey(ctx, testCase.request)
		if err != nil || key != testCase.want {
			t.Fatalf("allocate %s: got %q err=%v, want %q", testCase.request.TaskID, key, err, testCase.want)
		}
	}
}
