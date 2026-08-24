package project

import (
	"testing"

	"yishan/apps/cli/internal/adapter/cloud"
	domain "yishan/apps/cli/internal/localtask"
)

func TestFindTaskProject_ReturnsMatchingDisplayOrNoResult(t *testing.T) {
	projects := []cloud.Project{{ID: "project-1", Name: "Example", Icon: "code", Color: "#123456"}}
	tests := []struct {
		name      string
		projectID string
		want      domain.ProjectDisplay
		isFound   bool
	}{
		{name: "matching project", projectID: "project-1", want: domain.ProjectDisplay{ID: "project-1", Name: "Example", Icon: "code", Color: "#123456"}, isFound: true},
		{name: "deleted project", projectID: "deleted-project"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, isFound := findTaskProject(projects, test.projectID)
			if got != test.want || isFound != test.isFound {
				t.Fatalf("findTaskProject() = %#v, %t; want %#v, %t", got, isFound, test.want, test.isFound)
			}
		})
	}
}
