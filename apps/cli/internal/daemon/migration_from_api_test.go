package daemon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	cliruntime "yishan/apps/cli/internal/runtime"
)

func TestMigrationFromAPI_UsesOrganizationExportCSVEndToEnd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/orgs":
			_, _ = w.Write([]byte(`{"organizations":[{"id":"org-1","name":"Acme","createdAt":"2026-07-31T10:00:00.000Z","updatedAt":"2026-07-31T10:00:00.000Z","members":[]}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/orgs/org-1/export" && r.URL.Query().Get("type") == "project":
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			_, _ = w.Write([]byte("id,name,sourceType,repoProvider,repoUrl,repoKey,icon,color,setupScript,postScript,commands,contextEnabled,organizationId,createdByUserId,createdAt,updatedAt\nproject-1,Core,git,github,https://github.com/acme/core,acme/core,folder,#1E66F5,echo setup,echo post,\"[{\"\"name\"\":\"\"dev\"\",\"\"command\"\":\"\"bun run dev\"\"}]\",true,org-1,user-1,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z\n"))
		case r.Method == http.MethodGet && r.URL.Path == "/orgs/org-1/export" && r.URL.Query().Get("type") == "workspace":
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			_, _ = w.Write([]byte("id,organizationId,projectId,userId,nodeId,kind,status,branch,sourceBranch,localPath,createdAt,updatedAt\nworkspace-1,org-1,project-1,user-1,node-1,primary,active,,main,/tmp/core,2026-07-31T10:00:00.000Z,2026-07-31T11:00:00.000Z\n"))
		case r.Method == http.MethodGet && r.URL.Path == "/orgs/org-1/export" && r.URL.Query().Get("type") == "usage":
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			_, _ = w.Write([]byte("id,organizationId,projectId,workspaceId,workspacePath,agentKind,model,modelNormalized,bucketStartHourUtc,inputTokens,outputTokens,cachedInputTokens,cachedWriteTokens,reasoningTokens,totalTokens,eventCount,sessionCount,turnCount,toolCallCount,attributionConfidence,ingestedAt,runId,createdAt,updatedAt\nusage-1,org-1,project-1,workspace-1,/tmp/core,opencode,gpt-5,gpt-5,2026-07-31T10:00:00.000Z,10,5,2,1,3,21,4,2,6,7,exact,2026-07-31T10:30:00.000Z,run-1,2026-07-31T10:31:00.000Z,2026-07-31T10:32:00.000Z\n"))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	runtime := cliruntime.New(&config.Config{
		API: config.APIConfig{
			BaseURL: server.URL,
			Token:   "yst_test_token",
		},
	})

	if err := migrateProjectsFromAPI(database, runtime); err != nil {
		t.Fatalf("migrateProjectsFromAPI: %v", err)
	}
	if err := migrateUsageFromAPI(database, runtime); err != nil {
		t.Fatalf("migrateUsageFromAPI: %v", err)
	}

	projects, err := localdb.NewProjectStore(database).ListByOrg(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("list projects: %v", err)
	}
	if len(projects) != 1 || projects[0].Name != "Core" || len(projects[0].Commands) != 1 {
		t.Fatalf("expected imported project with commands, got %#v", projects)
	}

	workspaces, err := localdb.NewWorkspaceStore(database).ListByOrg(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].ProjectID != "project-1" || workspaces[0].SourceBranch == nil || *workspaces[0].SourceBranch != "main" {
		t.Fatalf("expected imported workspace, got %#v", workspaces)
	}

	usageState, err := localdb.NewHourlyUsageStore(database).GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get usage sync state: %v", err)
	}
	if usageState.TotalRows != 1 || usageState.DirtyRows != 0 {
		t.Fatalf("expected one clean imported usage row, got %#v", usageState)
	}

	projectsMigrated, err := localdb.MetadataKeyExists(context.Background(), database, "migration_api_completed")
	if err != nil {
		t.Fatalf("read project migration marker: %v", err)
	}
	if !projectsMigrated {
		t.Fatal("expected project migration marker")
	}
	usageMigrated, err := localdb.MetadataKeyExists(context.Background(), database, "migration_usage_api_completed")
	if err != nil {
		t.Fatalf("read usage migration marker: %v", err)
	}
	if !usageMigrated {
		t.Fatal("expected usage migration marker")
	}
}
