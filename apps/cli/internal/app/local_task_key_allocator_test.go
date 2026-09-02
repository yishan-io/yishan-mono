package app

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	"yishan/apps/cli/internal/platform/config"
)

func TestCloudKeyAllocator_UsesPersonalAndProjectRoutes(t *testing.T) {
	paths := make([]string, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		_, _ = io.WriteString(writer, `{"key":"TASK-1"}`)
	}))
	defer server.Close()
	allocator := newCloudKeyAllocator(session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "token"}}))
	if _, err := allocator.AllocateTaskKey(context.Background(), nodelocaltask.KeyAllocationRequest{TaskID: "personal"}); err != nil {
		t.Fatalf("allocate personal key: %v", err)
	}
	projectID, organizationID := "project-1", "org-1"
	_, err := allocator.AllocateTaskKey(context.Background(), nodelocaltask.KeyAllocationRequest{TaskID: "project", ProjectID: &projectID, OrganizationID: &organizationID})
	if err != nil {
		t.Fatalf("allocate project key: %v", err)
	}
	if got, want := paths[0]+"|"+paths[1], "/me/local-tasks/key|/orgs/org-1/projects/project-1/local-tasks/key"; got != want {
		t.Fatalf("allocation paths = %q, want %q", got, want)
	}
}

func TestAppClose_CancelsBlockedLocalTaskKeyBackfillRequest(t *testing.T) {
	requestStarted := make(chan struct{})
	releaseRequest := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		close(requestStarted)
		<-releaseRequest
	}))
	defer server.Close()
	defer close(releaseRequest)

	database := openTestDB(t)
	if _, err := sqlite.NewLocalTaskStore(database).Create(context.Background(), localtask.Task{
		ID: "legacy-task", Title: "Legacy task", Status: localtask.StatusNew, Priority: localtask.PriorityMedium,
	}); err != nil {
		t.Fatalf("seed unkeyed Local Task: %v", err)
	}
	app, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(),
		Session:    session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "token"}}),
		TokenUsage: newRecordingTokenUsage(database),
	})
	if err != nil {
		t.Fatalf("bootstrap app: %v", err)
	}

	select {
	case <-requestStarted:
	case <-time.After(time.Second):
		t.Fatal("Local Task key backfill did not start its cloud request")
	}
	closeDone := make(chan error, 1)
	go func() { closeDone <- app.Close() }()
	select {
	case err := <-closeDone:
		if err != nil {
			t.Fatalf("close app: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("app shutdown waited for the cloud request timeout")
	}
}

func TestCloudKeyAllocator_ResolvesLegacyProjectOrganizationBeforeAllocation(t *testing.T) {
	paths := make([]string, 0, 3)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		switch request.URL.Path {
		case "/orgs":
			_, _ = io.WriteString(writer, `{"organizations":[{"id":"org-1"}]}`)
		case "/orgs/org-1/projects":
			_, _ = io.WriteString(writer, `{"projects":[{"id":"project-1","organizationId":"org-1"}]}`)
		case "/orgs/org-1/projects/project-1/local-tasks/key":
			_, _ = io.WriteString(writer, `{"key":"PROJECT-1"}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	allocator := newCloudKeyAllocator(session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "token"}}))
	projectID := "project-1"
	key, err := allocator.AllocateTaskKey(context.Background(), nodelocaltask.KeyAllocationRequest{TaskID: "legacy", ProjectID: &projectID})
	if err != nil {
		t.Fatalf("allocate legacy project key: %v", err)
	}
	if key != "PROJECT-1" {
		t.Fatalf("key = %q, want project key", key)
	}
	if got, want := paths[0]+"|"+paths[1]+"|"+paths[2], "/orgs|/orgs/org-1/projects|/orgs/org-1/projects/project-1/local-tasks/key"; got != want {
		t.Fatalf("allocation paths = %q, want %q", got, want)
	}
}

func TestCloudKeyAllocator_UsesPersonalFallbackWhenLegacyProjectNoLongerExists(t *testing.T) {
	paths := make([]string, 0, 3)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		switch request.URL.Path {
		case "/orgs":
			_, _ = io.WriteString(writer, `{"organizations":[{"id":"org-1"}]}`)
		case "/orgs/org-1/projects":
			_, _ = io.WriteString(writer, `{"projects":[]}`)
		case "/me/local-tasks/key":
			_, _ = io.WriteString(writer, `{"key":"PERSONAL-1"}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	allocator := newCloudKeyAllocator(session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "token"}}))
	projectID := "deleted-project"
	key, err := allocator.AllocateTaskKey(context.Background(), nodelocaltask.KeyAllocationRequest{TaskID: "legacy", ProjectID: &projectID})
	if err != nil {
		t.Fatalf("allocate legacy fallback key: %v", err)
	}
	if key != "PERSONAL-1" {
		t.Fatalf("key = %q, want personal fallback key", key)
	}
	if got, want := paths[0]+"|"+paths[1]+"|"+paths[2], "/orgs|/orgs/org-1/projects|/me/local-tasks/key"; got != want {
		t.Fatalf("allocation paths = %q, want %q", got, want)
	}
}
