package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"
)

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Start MCP server for AI agents",
	Long: `Start a Model Context Protocol (MCP) server that AI coding agents
can connect to via stdio. The MCP server exposes yishan workspace
management as MCP tools.

Requires a running daemon. Start one with:
  yishan daemon start

The MCP server reads JSON-RPC messages from stdin and writes to stdout.
All logs and diagnostics go to stderr.`,
	Example: `  yishan mcp`,
	Args:    cobra.NoArgs,
	RunE:    runMCPServer,
}

// daemonWorkspace matches the daemon's workspace.Workspace JSON shape.
type daemonWorkspace struct {
	ID              string          `json:"id"`
	Path            string          `json:"path"`
	OrgID           string          `json:"orgId,omitempty"`
	ProjectID       string          `json:"projectId,omitempty"`
	SetupHookResult json.RawMessage `json:"setupHookResult,omitempty"`
	PullRequest     json.RawMessage `json:"pullRequest,omitempty"`
}

type workspaceCreateArgs struct {
	RepoKey        string `json:"repoKey" jsonschema:"The project repo key (relative path used for git worktree naming)"`
	SourcePath     string `json:"sourcePath" jsonschema:"Source path of the primary workspace or bare repo to branch from"`
	TargetBranch   string `json:"targetBranch" jsonschema:"Branch name for the new workspace"`
	SourceBranch   string `json:"sourceBranch" jsonschema:"Base branch to create the new branch from"`
	ProjectID      string `json:"projectId,omitempty" jsonschema:"Project ID to associate the workspace with"`
	NodeID         string `json:"nodeId,omitempty" jsonschema:"Node ID to create the workspace on (defaults to local daemon node)"`
	WorkspaceName  string `json:"workspaceName,omitempty" jsonschema:"Name for the workspace directory (defaults to branch name)"`
	SetupHook      string `json:"setupHook,omitempty" jsonschema:"Shell command to run after workspace is created (e.g. npm install)"`
	TaskRunKind    string `json:"taskRunAgentKind,omitempty" jsonschema:"Agent kind for init task run (e.g. opencode, claude)"`
	TaskRunPrompt  string `json:"taskRunPrompt,omitempty" jsonschema:"Initial prompt for the task run agent"`
	TaskRunModel   string `json:"taskRunModel,omitempty" jsonschema:"Model override for the task run agent"`
}

type workspaceCloseArgs struct {
	WorkspaceID  string `json:"workspaceId" jsonschema:"The workspace ID to close"`
	ProjectID    string `json:"projectId" jsonschema:"Project ID for the workspace (required)"`
	Branch       string `json:"branch,omitempty" jsonschema:"Branch name (optional, auto-detected if not provided)"`
	RemoveBranch bool   `json:"removeBranch,omitempty" jsonschema:"Delete the git branch after closing"`
	PostHook     string `json:"postHook,omitempty" jsonschema:"Shell command to run before closing (e.g. cleanup script)"`
}

type daemonProgressEvent struct {
	WorkspaceID string `json:"workspaceId"`
	StepID      string `json:"stepId"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	Message     string `json:"message,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

func runMCPServer(_ *cobra.Command, _ []string) error {
	log.Logger = zerolog.Nop()

	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return fmt.Errorf("resolve daemon state: %w", err)
	}

	state, err := daemon.LoadState(statePath)
	if err != nil {
		return fmt.Errorf("daemon not running: %w\n\nStart the daemon with: yishan daemon start", err)
	}

	if !daemon.IsProcessRunning(state.PID) {
		return fmt.Errorf("daemon process not running (pid %d)\n\nRestart the daemon with: yishan daemon restart", state.PID)
	}

	if !daemon.ProbeHealth(state, 250*time.Millisecond) {
		return fmt.Errorf("daemon is not responding on %s:%d\n\nRestart the daemon with: yishan daemon restart",
			state.Host, state.Port)
	}

	wsURL := "ws://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port)) + "/ws"

	daemonClient, err := daemonclient.NewPersistent(context.Background(), wsURL, "")
	if err != nil {
		return fmt.Errorf("connect to daemon at %s: %w", wsURL, err)
	}
	defer daemonClient.Close()

	server := mcp.NewServer(&mcp.Implementation{Name: "yishan", Version: "0.1.0"}, nil)

	orgID := appConfig.DefaultOrgID

	// Prefer daemon context (desktop-pushed) over CLI config.
	if contextState := readDaemonContext(daemonClient); contextState != nil {
		if daemonOrgID, ok := contextState["activeOrgId"].(string); ok && daemonOrgID != "" {
			orgID = daemonOrgID
		}
	}

	server.AddResource(
		&mcp.Resource{
			URI:         "yishan://context",
			Name:        "Current yishan context",
			Description: "Current organization, project, workspace, and file context from the yishan desktop app. Includes activeOrgId, activeProjectId, activeWorkspaceId, and activeFilePath.",
			MIMEType:    "application/json",
		},
		func(ctx context.Context, req *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
			state := readDaemonContext(daemonClient)
			encoded, _ := json.MarshalIndent(state, "", "  ")
			return &mcp.ReadResourceResult{
				Contents: []*mcp.ResourceContents{{
					URI:      req.Params.URI,
					MIMEType: "application/json",
					Text:     string(encoded),
				}},
			}, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "project_list", Description: "List all projects in the current organization. Returns project id, name, repo URL, repo key, and related metadata for each project."},
		func(_ context.Context, _ *mcp.CallToolRequest, _ any) (*mcp.CallToolResult, any, error) {
			if orgID == "" {
				return textErrorResult("no current organization: set one with \"yishan org use <org-id>\""), nil, nil
			}

			var projects []map[string]any
			if err := daemonClient.Call("project.list", map[string]any{"orgId": orgID}, &projects); err != nil {
				return textErrorResult(fmt.Sprintf("failed to list projects: %v", err)), nil, nil
			}

			if len(projects) == 0 {
				return textResult("No projects found."), nil, nil
			}

			encoded, err := json.MarshalIndent(projects, "", "  ")
			if err != nil {
				return textErrorResult(fmt.Sprintf("failed to encode projects: %v", err)), nil, nil
			}
			return textResult(string(encoded)), nil, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "node_list", Description: "List all nodes in the current organization. Returns node id, name, kind, scope, endpoint, and metadata for each node."},
		func(_ context.Context, _ *mcp.CallToolRequest, _ any) (*mcp.CallToolResult, any, error) {
			if orgID == "" {
				return textErrorResult("no current organization: set one with \"yishan org use <org-id>\""), nil, nil
			}

			var nodes []map[string]any
			if err := daemonClient.Call("node.list", map[string]any{"orgId": orgID}, &nodes); err != nil {
				return textErrorResult(fmt.Sprintf("failed to list nodes: %v", err)), nil, nil
			}

			if len(nodes) == 0 {
				return textResult("No nodes found."), nil, nil
			}

			encoded, err := json.MarshalIndent(nodes, "", "  ")
			if err != nil {
				return textErrorResult(fmt.Sprintf("failed to encode nodes: %v", err)), nil, nil
			}
			return textResult(string(encoded)), nil, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "workspace_list", Description: "List all workspaces currently open in yishan. Returns workspace id, path, org, project, and pull request info for each workspace."},
		func(_ context.Context, _ *mcp.CallToolRequest, _ any) (*mcp.CallToolResult, any, error) {
			var workspaces []daemonWorkspace
			if err := daemonClient.Call("list", nil, &workspaces); err != nil {
				return textErrorResult(fmt.Sprintf("failed to list workspaces: %v", err)), nil, nil
			}

			if len(workspaces) == 0 {
				return textResult("No workspaces are currently open."), nil, nil
			}

			pretty := make([]map[string]any, 0, len(workspaces))
			for _, ws := range workspaces {
				entry := map[string]any{
					"id":   ws.ID,
					"path": ws.Path,
				}
				if ws.OrgID != "" {
					entry["orgId"] = ws.OrgID
				}
				if ws.ProjectID != "" {
					entry["projectId"] = ws.ProjectID
				}
				if ws.PullRequest != nil {
					var pr map[string]any
					if json.Unmarshal(ws.PullRequest, &pr) == nil && len(pr) > 0 {
						entry["pullRequest"] = pr
					}
				}
				pretty = append(pretty, entry)
			}

			encoded, err := json.MarshalIndent(pretty, "", "  ")
			if err != nil {
				return textErrorResult(fmt.Sprintf("failed to encode workspace list: %v", err)), nil, nil
			}
			return textResult(string(encoded)), nil, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "workspace_get", Description: "Get details of a specific workspace by its ID. Use this to find a workspace's path and PR status."},
		func(_ context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, any, error) {
			workspaceID, _ := args["workspaceId"].(string)
			if workspaceID == "" {
				return textErrorResult("workspaceId is required"), nil, nil
			}

			var workspaces []daemonWorkspace
			if err := daemonClient.Call("list", nil, &workspaces); err != nil {
				return textErrorResult(fmt.Sprintf("failed to list workspaces: %v", err)), nil, nil
			}

			for _, ws := range workspaces {
				if ws.ID == workspaceID {
					encoded, err := json.MarshalIndent(ws, "", "  ")
					if err != nil {
						return textErrorResult(fmt.Sprintf("failed to encode workspace: %v", err)), nil, nil
					}
					return textResult(string(encoded)), nil, nil
				}
			}

			return textErrorResult(fmt.Sprintf("workspace %s not found", workspaceID)), nil, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "workspace_create", Description: "Create a new yishan workspace (git worktree) on a branch. Use this when an agent needs to start work on a feature or fix. Requires repoKey, sourcePath, targetBranch, and sourceBranch. Supports progress notifications during creation."},
		func(_ context.Context, req *mcp.CallToolRequest, args workspaceCreateArgs) (*mcp.CallToolResult, any, error) {
			if orgID == "" {
				return textErrorResult("no current organization: set one with \"yishan org use <org-id>\""), nil, nil
			}
			if args.RepoKey == "" || args.SourcePath == "" || args.TargetBranch == "" || args.SourceBranch == "" {
				return textErrorResult("repoKey, sourcePath, targetBranch, and sourceBranch are required"), nil, nil
			}

			progressToken := req.Params.GetProgressToken()
			if progressToken != nil {
				_ = daemonClient.Call("events.frontendStream", nil, nil)
				session := req.Session
				stepIndex := 0
				daemonClient.SetNotificationHandler(func(method string, params json.RawMessage) {
					if method != "events.frontendStream" {
						return
					}
					var event struct {
						Topic   string          `json:"topic"`
						Payload json.RawMessage `json:"payload"`
					}
					if err := json.Unmarshal(params, &event); err != nil {
						return
					}
					if event.Topic != "workspaceCreateProgress" {
						return
					}
					var progress daemonProgressEvent
					if err := json.Unmarshal(event.Payload, &progress); err != nil {
						return
					}
					stepIndex++
					_ = session.NotifyProgress(context.Background(), &mcp.ProgressNotificationParams{
						ProgressToken: progressToken,
						Progress:      float64(stepIndex),
						Message:       progress.StepID + ": " + progress.Status,
					})
				})
				defer daemonClient.SetNotificationHandler(nil)
			}

			var result map[string]any
			taskRunArgs := map[string]any{}
			if args.TaskRunKind != "" && args.TaskRunPrompt != "" {
				taskRunArgs["agentKind"] = args.TaskRunKind
				taskRunArgs["prompt"] = args.TaskRunPrompt
				if args.TaskRunModel != "" {
					taskRunArgs["model"] = args.TaskRunModel
				}
			}
			callArgs := map[string]any{
				"repoKey":        args.RepoKey,
				"sourcePath":     args.SourcePath,
				"targetBranch":   args.TargetBranch,
				"sourceBranch":   args.SourceBranch,
				"organizationId": orgID,
				"projectId":      args.ProjectID,
				"nodeId":         args.NodeID,
				"workspaceName":  args.WorkspaceName,
				"setupHook":      args.SetupHook,
			}
			if len(taskRunArgs) > 0 {
				callArgs["taskRun"] = taskRunArgs
			}
			if err := daemonClient.Call("workspace.create", callArgs, &result); err != nil {
				return textErrorResult(fmt.Sprintf("failed to create workspace: %v", err)), nil, nil
			}

			encoded, err := json.MarshalIndent(result, "", "  ")
			if err != nil {
				return textErrorResult(fmt.Sprintf("failed to encode workspace: %v", err)), nil, nil
			}
			return textResult(string(encoded)), nil, nil
		},
	)

	mcp.AddTool(server,
		&mcp.Tool{Name: "workspace_close", Description: "Close a yishan workspace and optionally remove its git branch. Use when an agent is done with a feature or fix."},
		func(_ context.Context, _ *mcp.CallToolRequest, args workspaceCloseArgs) (*mcp.CallToolResult, any, error) {
			if orgID == "" {
				return textErrorResult("no current organization: set one with \"yishan org use <org-id>\""), nil, nil
			}
			if args.WorkspaceID == "" {
				return textErrorResult("workspaceId is required"), nil, nil
			}
			if args.ProjectID == "" {
				return textErrorResult("projectId is required"), nil, nil
			}

			var result map[string]any
			if err := daemonClient.Call("workspace.close", map[string]any{
				"workspaceId":    args.WorkspaceID,
				"organizationId": orgID,
				"projectId":      args.ProjectID,
				"branch":         args.Branch,
				"removeBranch":   args.RemoveBranch,
				"forceWorktree":  true,
				"forceBranch":    true,
				"postHook":       args.PostHook,
			}, &result); err != nil {
				return textErrorResult(fmt.Sprintf("failed to close workspace: %v", err)), nil, nil
			}

			encoded, err := json.MarshalIndent(result, "", "  ")
			if err != nil {
				return textErrorResult(fmt.Sprintf("failed to encode response: %v", err)), nil, nil
			}
			return textResult(string(encoded)), nil, nil
		},
	)

	return server.Run(context.Background(), &mcp.StdioTransport{})
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}

func textErrorResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
		IsError: true,
	}
}

func init() {
	rootCmd.AddCommand(mcpCmd)
}

func readDaemonContext(client *daemonclient.PersistentClient) map[string]any {
	var state map[string]any
	if err := client.Call("context.getState", nil, &state); err != nil {
		return nil
	}
	return state
}
