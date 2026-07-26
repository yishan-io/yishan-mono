package cmd

import "testing"

func TestBuildMCPWorkspaceTaskRunArgs_UsesPromptWithoutExplicitAgentKind(t *testing.T) {
	taskRun := buildMCPWorkspaceTaskRunArgs(workspaceCreateArgs{
		TaskRunPrompt: "Implement the task",
	})

	if taskRun["prompt"] != "Implement the task" {
		t.Fatalf("prompt = %q, want task prompt", taskRun["prompt"])
	}
	if _, exists := taskRun["agentKind"]; exists {
		t.Fatalf("agentKind = %q, want omitted so daemon defaults to pi", taskRun["agentKind"])
	}
}

func TestBuildMCPWorkspaceTaskRunArgs_OmitsTaskRunWithoutPrompt(t *testing.T) {
	taskRun := buildMCPWorkspaceTaskRunArgs(workspaceCreateArgs{})
	if taskRun != nil {
		t.Fatalf("taskRun = %#v, want nil", taskRun)
	}
}
