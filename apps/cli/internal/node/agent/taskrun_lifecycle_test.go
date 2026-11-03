package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func newTaskRunLifecycleTest(t *testing.T) (*Service, workspace.Workspace, string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	root := t.TempDir()
	t.Setenv("HOME", root)
	marker := filepath.Join(root, "commands")
	script := fmt.Sprintf(`#!/bin/sh
while IFS= read -r line; do
 printf '%%s\n' "$line" >> %q
 if [ "$line" = '{"type":"probe"}' ]; then
  cp %q %q.tmp && mv %q.tmp %q
 fi
 if [ "$line" = '{"type":"exit"}' ]; then
  exit 0
 fi
done
`, marker, marker, marker+".snapshot", marker+".snapshot", marker+".snapshot")
	if err := os.WriteFile(filepath.Join(root, "pi"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", root+string(os.PathListSeparator)+os.Getenv("PATH"))
	s := newTestHandler(t)
	t.Cleanup(func() { s.cleanupTaskRunSession("task-ws") })
	return s, workspace.Workspace{ID: "ws", Path: root, ProjectID: "project", OrgID: "org"}, marker
}

func publishTaskRunStatus(t *testing.T, s *Service, created workspace.Workspace) string {
	t.Helper()
	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)
	s.PublishWorkspaceCreateCompleted(application.CreatePlan{
		LocalCreate: &workspace.CreateRequest{TaskRun: &workspace.TaskRunConfig{AgentKind: "pi", Prompt: "run"}},
	}, created, nil)
	for {
		select {
		case event := <-events:
			if event.Topic == "workspaceCreateCompleted" {
				payload := event.Payload.(map[string]any)
				if payload["taskRunStatus"] == "failed" && payload["taskRunSessionId"] != nil {
					t.Fatal("failed run advertised a chat session")
				}
				return payload["taskRunStatus"].(string)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("missing completion event")
		}
	}
}

func TestPublishWorkspaceCreateCompleted_TaskRunFailureCleansUp(t *testing.T) {
	for _, hasDesktop := range []bool{true, false} {
		for _, failure := range []string{"start", "send"} {
			t.Run(fmt.Sprintf("desktop=%t/%s", hasDesktop, failure), func(t *testing.T) {
				s, created, _ := newTaskRunLifecycleTest(t)
				s.deps.Terminals = nil // Neither Start nor Send may be called as a fallback.
				if hasDesktop {
					registerTestDesktopConn(s)
				}
				if failure == "start" {
					created.Path = filepath.Join(created.Path, "missing")
				} else {
					s.afterProcessStart = func() {
						proc, ok := s.deps.AgentMgr.Session("task-ws")
						if !ok {
							t.Fatal("process missing before registration")
						}
						if err := proc.Close(); err != nil {
							t.Fatal(err)
						}
					}
				}
				if status := publishTaskRunStatus(t, s, created); status != "failed" {
					t.Fatalf("status = %q", status)
				}
				assertTaskRunCleanedUp(t, s)
			})
		}
	}
}

func assertTaskRunCleanedUp(t *testing.T, s *Service) {
	t.Helper()
	if _, ok := s.deps.AgentMgr.Session("task-ws"); ok {
		t.Fatal("failed process still active")
	}
	if _, ok := s.piSessions.Get("task-ws"); ok {
		t.Fatal("failed run still registered")
	}
	if s.deps.AgentMgr.Starting("task-ws") {
		t.Fatal("start reservation leaked")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := s.StopWorkspaceSessions(ctx, "ws"); err != nil {
		t.Fatalf("admission/close cleanup: %v", err)
	}
}

func TestPublishWorkspaceCreateCompleted_TaskRunDuplicateDoesNotRestartOrSend(t *testing.T) {
	s, created, marker := newTaskRunLifecycleTest(t)
	s.deps.Terminals = nil
	starts := 0
	s.afterProcessStart = func() { starts++ }
	if status := publishTaskRunStatus(t, s, created); status != "started" {
		t.Fatalf("first status = %q", status)
	}
	original, ok := s.deps.AgentMgr.Session("task-ws")
	if !ok {
		t.Fatal("missing original process")
	}
	if status := publishTaskRunStatus(t, s, created); status != "failed" {
		t.Fatalf("duplicate status = %q", status)
	}
	current, ok := s.deps.AgentMgr.Session("task-ws")
	if !ok || current != original || starts != 1 {
		t.Fatal("duplicate replaced/restarted original process")
	}
	if err := current.Send([]byte(`{"type":"probe"}`)); err != nil {
		t.Fatal(err)
	}
	commands := waitForFileContent(t, marker+".snapshot")
	if strings.Count(commands, `"type":"prompt"`) != 1 {
		t.Fatalf("commands = %q", commands)
	}
	if err := s.StopWorkspaceSessions(context.Background(), created.ID); err != nil {
		t.Fatal(err)
	}
	assertTaskRunCleanedUp(t, s)
}

func TestPublishWorkspaceCreateCompleted_TaskRunDuplicateAfterExitDoesNotRestartOrSend(t *testing.T) {
	s, created, marker := newTaskRunLifecycleTest(t)
	s.deps.Terminals = nil
	starts := 0
	s.afterProcessStart = func() { starts++ }
	if status := publishTaskRunStatus(t, s, created); status != "started" {
		t.Fatalf("first status = %q", status)
	}
	original, ok := s.deps.AgentMgr.Session("task-ws")
	if !ok {
		t.Fatal("missing original process")
	}
	if err := original.Send([]byte(`{"type":"exit"}`)); err != nil {
		t.Fatal(err)
	}
	waitForTaskRunProcessExit(t, s)
	registered, ok := s.piSessions.Get("task-ws")
	if !ok || !registered.TaskRun || registered.Process != original {
		t.Fatal("exited task run metadata missing")
	}
	if status := publishTaskRunStatus(t, s, created); status != "failed" {
		t.Fatalf("duplicate after exit status = %q", status)
	}
	if _, ok := s.deps.AgentMgr.Session("task-ws"); ok || starts != 1 {
		t.Fatal("duplicate restarted exited task run")
	}
	commands := waitForFileContent(t, marker)
	if strings.Count(commands, `"type":"prompt"`) != 1 {
		t.Fatalf("commands = %q", commands)
	}
	if current, ok := s.piSessions.Get("task-ws"); !ok || current.Process != original {
		t.Fatal("duplicate replaced exited task run metadata")
	}
	if err := s.StopWorkspaceSessions(context.Background(), created.ID); err != nil {
		t.Fatal(err)
	}
	assertTaskRunCleanedUp(t, s)
}

func waitForTaskRunProcessExit(t *testing.T, s *Service) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		if _, ok := s.deps.AgentMgr.Session("task-ws"); !ok {
			return
		}
		select {
		case <-deadline:
			t.Fatal("task run process did not exit")
		case <-ticker.C:
		}
	}
}
