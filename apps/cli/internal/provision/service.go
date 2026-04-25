package provision

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"

	"github.com/golang-jwt/jwt/v5"
)

type DaemonAuthConfig struct {
	Host        string
	Port        int
	JWTSecret   string
	JWTIssuer   string
	JWTAudience string
	JWTRequired bool
}

type CreateRequest struct {
	OrganizationID string
	ProjectID      string
	NodeID         string
	LocalPath      string
	Kind           string
	Branch         string
}

type Service struct {
	apiClient  rawClient
	daemonAuth DaemonAuthConfig
}

type rawClient interface {
	DoRaw(method string, path string, body any) ([]byte, error)
}

func New(apiClient rawClient, daemonAuth DaemonAuthConfig) *Service {
	return &Service{apiClient: apiClient, daemonAuth: daemonAuth}
}

func (s *Service) Create(ctx context.Context, req CreateRequest) ([]byte, error) {
	payload := map[string]string{
		"nodeId":    req.NodeID,
		"localPath": req.LocalPath,
		"kind":      req.Kind,
	}
	if req.Branch != "" {
		payload["branch"] = req.Branch
	}

	node, err := s.resolveNode(req.OrganizationID, req.NodeID)
	if err != nil {
		return nil, err
	}

	path := "/orgs/" + req.OrganizationID + "/projects/" + req.ProjectID + "/workspaces"
	body, err := s.apiClient.DoRaw(http.MethodPost, path, payload)
	if err != nil {
		return nil, err
	}

	if node.Scope != "private" {
		return body, nil
	}

	var created workspaceCreateResponse
	if err := json.Unmarshal(body, &created); err != nil {
		return nil, fmt.Errorf("parse created workspace response: %w", err)
	}
	if created.Workspace.ID == "" {
		return nil, fmt.Errorf("created workspace response is missing workspace id")
	}

	if err := s.ensureWorkspaceProvisionedOnLocalDaemon(ctx, req.OrganizationID, req.ProjectID, node, created.Workspace); err != nil {
		return nil, fmt.Errorf("workspace %s created in api but local provisioning failed: %w", created.Workspace.ID, err)
	}

	return body, nil
}

func (s *Service) ensureWorkspaceProvisionedOnLocalDaemon(
	ctx context.Context,
	orgID string,
	projectID string,
	node nodeItem,
	workspace workspaceItem,
) error {
	daemonURL, err := node.daemonWSURL(s.daemonAuth.Host, s.daemonAuth.Port)
	if err != nil {
		return err
	}

	jwtToken, err := s.daemonJWTToken()
	if err != nil {
		return err
	}

	rpc := daemonclient.New(daemonURL, jwtToken)

	if workspace.Kind == "primary" {
		var opened daemonWorkspaceOpenResult
		if err := rpc.Call(ctx, daemon.MethodOpen, map[string]string{
			"id":   workspace.ID,
			"path": workspace.LocalPath,
		}, &opened); err != nil {
			return fmt.Errorf("provision primary workspace on local daemon: %w", err)
		}
		return nil
	}

	if workspace.Kind == "worktree" {
		if strings.TrimSpace(workspace.Branch) == "" {
			return fmt.Errorf("branch is required for worktree workspace")
		}

		baseWorkspace, err := s.resolvePrimaryWorkspace(orgID, projectID, node.ID)
		if err != nil {
			return err
		}

		var opened daemonWorkspaceOpenResult
		if err := rpc.Call(ctx, daemon.MethodOpen, map[string]string{
			"id":   baseWorkspace.ID,
			"path": baseWorkspace.LocalPath,
		}, &opened); err != nil {
			return fmt.Errorf("open base workspace on local daemon: %w", err)
		}

		if err := rpc.Call(ctx, daemon.MethodGitWorktreeCreate, map[string]any{
			"workspaceId":  baseWorkspace.ID,
			"branch":       workspace.Branch,
			"worktreePath": workspace.LocalPath,
			"createBranch": true,
			"fromRef":      "HEAD",
		}, nil); err != nil {
			return fmt.Errorf("create git worktree on local daemon: %w", err)
		}
		return nil
	}

	return fmt.Errorf("unsupported workspace kind %q", workspace.Kind)
}

func (s *Service) resolvePrimaryWorkspace(orgID string, projectID string, nodeID string) (workspaceItem, error) {
	path := "/orgs/" + orgID + "/projects/" + projectID + "/workspaces"
	body, err := s.apiClient.DoRaw(http.MethodGet, path, nil)
	if err != nil {
		return workspaceItem{}, err
	}

	var parsed workspaceListResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return workspaceItem{}, fmt.Errorf("parse workspaces response: %w", err)
	}

	for _, workspace := range parsed.Workspaces {
		if workspace.Kind == "primary" && workspace.NodeID == nodeID && strings.TrimSpace(workspace.LocalPath) != "" {
			return workspace, nil
		}
	}

	return workspaceItem{}, fmt.Errorf("no primary workspace found on node %s for project %s; create one first", nodeID, projectID)
}

func (s *Service) resolveNode(orgID string, nodeID string) (nodeItem, error) {
	path := "/orgs/" + orgID + "/nodes"
	body, err := s.apiClient.DoRaw(http.MethodGet, path, nil)
	if err != nil {
		return nodeItem{}, err
	}

	var parsed nodeListResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nodeItem{}, fmt.Errorf("parse nodes response: %w", err)
	}

	for _, node := range parsed.Nodes {
		if node.ID == nodeID {
			return node, nil
		}
	}

	return nodeItem{}, fmt.Errorf("node %s not found in organization %s", nodeID, orgID)
}

func (s *Service) daemonJWTToken() (string, error) {
	if !s.daemonAuth.JWTRequired {
		return "", nil
	}
	if strings.TrimSpace(s.daemonAuth.JWTSecret) == "" {
		return "", fmt.Errorf("daemon JWT is required but no secret is configured; set YISHAN_DAEMON_JWT_SECRET")
	}

	now := time.Now()
	claims := jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(10 * time.Minute)),
		Subject:   "yishan-cli",
	}
	if s.daemonAuth.JWTIssuer != "" {
		claims.Issuer = s.daemonAuth.JWTIssuer
	}
	if s.daemonAuth.JWTAudience != "" {
		claims.Audience = jwt.ClaimStrings{s.daemonAuth.JWTAudience}
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.daemonAuth.JWTSecret))
}
