package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExportProjects_ParsesCSV(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/orgs/org-1/export" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("type"); got != "project" {
			t.Fatalf("expected type=project, got %q", got)
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		_, _ = w.Write([]byte("id,name,sourceType,repoProvider,repoUrl,repoKey,icon,color,setupScript,postScript,commands,contextEnabled,organizationId,createdByUserId,createdAt,updatedAt\nproject-1,\"Core, App\",git,github,https://github.com/acme/core,acme/core,folder,#1E66F5,echo setup,echo post,\"[{\"\"name\"\":\"\"dev\"\",\"\"command\"\":\"\"bun run dev\"\"}]\",true,org-1,user-1,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z\n"))
	}))
	defer server.Close()

	client := NewClient(server.URL, "", "", "", "", nil)
	projects, err := client.ExportProjects("org-1")
	if err != nil {
		t.Fatalf("ExportProjects: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(projects))
	}
	project := projects[0]
	if project.Name != "Core, App" {
		t.Fatalf("expected quoted CSV name, got %#v", project)
	}
	if project.RepoProvider == nil || *project.RepoProvider != "github" {
		t.Fatalf("expected repo provider, got %#v", project.RepoProvider)
	}
	if len(project.Commands) != 1 || project.Commands[0].Command != "bun run dev" {
		t.Fatalf("expected parsed commands, got %#v", project.Commands)
	}
	if !project.ContextEnabled {
		t.Fatalf("expected context enabled, got %#v", project)
	}
}

func TestExportWorkspaces_ParsesCSV(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("type"); got != "workspace" {
			t.Fatalf("expected type=workspace, got %q", got)
		}
		_, _ = w.Write([]byte("id,organizationId,projectId,userId,nodeId,kind,status,branch,sourceBranch,localPath,createdAt,updatedAt\nworkspace-1,org-1,project-1,user-1,node-1,worktree,active,,main,/tmp/core,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z\n"))
	}))
	defer server.Close()

	client := NewClient(server.URL, "", "", "", "", nil)
	workspaces, err := client.ExportWorkspaces("org-1")
	if err != nil {
		t.Fatalf("ExportWorkspaces: %v", err)
	}
	if len(workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(workspaces))
	}
	workspace := workspaces[0]
	if workspace.Branch != nil {
		t.Fatalf("expected empty branch to decode as nil, got %#v", workspace.Branch)
	}
	if workspace.SourceBranch == nil || *workspace.SourceBranch != "main" {
		t.Fatalf("expected source branch, got %#v", workspace.SourceBranch)
	}
}

func TestExportProjects_RequiresConsumedHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("id,name,sourceType,repoProvider,repoUrl,repoKey,color,setupScript,postScript,commands,contextEnabled,organizationId,createdByUserId,createdAt,updatedAt\nproject-1,Core,git,github,https://github.com/acme/core,acme/core,#1E66F5,echo setup,echo post,[],true,org-1,user-1,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z\n"))
	}))
	defer server.Close()

	client := NewClient(server.URL, "", "", "", "", nil)
	_, err := client.ExportProjects("org-1")
	if err == nil || !strings.Contains(err.Error(), `missing csv header "icon"`) {
		t.Fatalf("expected missing header error, got %v", err)
	}
}

func TestExportTokenUsageHourly_ParsesCSV(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("type"); got != "usage" {
			t.Fatalf("expected type=usage, got %q", got)
		}
		_, _ = w.Write([]byte("id,organizationId,projectId,workspaceId,workspacePath,agentKind,model,modelNormalized,bucketStartHourUtc,inputTokens,outputTokens,cachedInputTokens,cachedWriteTokens,reasoningTokens,totalTokens,eventCount,sessionCount,turnCount,toolCallCount,attributionConfidence,ingestedAt,runId,createdAt,updatedAt\nusage-1,org-1,project-1,workspace-1,/tmp/core,opencode,gpt-5,gpt-5,2026-07-31T10:00:00.000Z,10,5,2,1,3,21,4,2,6,7,exact,2026-07-31T10:30:00.000Z,run-1,2026-07-31T10:31:00.000Z,2026-07-31T10:32:00.000Z\n"))
	}))
	defer server.Close()

	client := NewClient(server.URL, "", "", "", "", nil)
	rows, err := client.ExportTokenUsageHourly("org-1")
	if err != nil {
		t.Fatalf("ExportTokenUsageHourly: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	row := rows[0]
	if row.TotalTokens != 21 || row.BucketStartHourUTC != "2026-07-31T10:00:00.000Z" {
		t.Fatalf("expected parsed usage row, got %#v", row)
	}
}
