package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/workspace"
)

// customize sub-namespace constants, split from the method string inside
// dispatchCustomize so new panels (agents, themes, …) can be added as sibling
// cases.
const (
	customizeExtensionsNamespace = "extensions"
	customizeAgentsNamespace     = "agents"
)

// managedCommandTimeout bounds pi/npx installs and removals so a stalled
// network fetch cannot occupy an RPC handler slot indefinitely.
const managedCommandTimeout = 10 * time.Minute

// dispatchCustomize routes customize.* methods by their second path segment.
// Each sub-namespace owns a dedicated dispatch method.
func (h *JSONRPCHandler) dispatchCustomize(ctx context.Context, method string, params json.RawMessage) (any, error) {
	sub, _, found := strings.Cut(strings.TrimPrefix(method, "customize."), ".")
	if !found {
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
	switch sub {
	case customizeExtensionsNamespace:
		return h.dispatchCustomizeExtensions(ctx, method, params)
	case customizeAgentsNamespace:
		return h.dispatchCustomizeAgents(method, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

func (h *JSONRPCHandler) dispatchCustomizeAgents(method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodCustomizeAgentsList:
		return h.handleCustomizeAgentsList()
	case MethodCustomizeAgentsDetail:
		return h.handleCustomizeAgentsDetail(params)
	case MethodCustomizeAgentsCreate:
		return h.handleCustomizeAgentsCreate(params)
	case MethodCustomizeAgentsUpdate:
		return h.handleCustomizeAgentsUpdate(params)
	case MethodCustomizeAgentsRemove:
		return h.handleCustomizeAgentsRemove(params)
	case MethodCustomizeAgentsRestore:
		return h.handleCustomizeAgentsRestore(params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

func (h *JSONRPCHandler) handleCustomizeAgentsList() (any, error) {
	agents, err := setup.ListPiAgents()
	if err != nil {
		return nil, fmt.Errorf("list pi agents: %w", err)
	}
	return map[string]any{"agents": agents}, nil
}

func (h *JSONRPCHandler) handleCustomizeAgentsDetail(params json.RawMessage) (any, error) {
	name, err := parseAgentNameParam(params)
	if err != nil {
		return nil, err
	}
	detail, err := setup.GetPiAgentDetail(name)
	if err != nil {
		return nil, agentOperationError(err)
	}
	return detail, nil
}

func (h *JSONRPCHandler) handleCustomizeAgentsCreate(params json.RawMessage) (any, error) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Content     string `json:"content"`
		Model       string `json:"model"`
		Thinking    string `json:"thinking"`
	}
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "content is required")
	}
	if err := setup.CreatePiAgent(req.Name, req.Description, req.Content, req.Model, req.Thinking); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"created": true}, nil
}

func (h *JSONRPCHandler) handleCustomizeAgentsUpdate(params json.RawMessage) (any, error) {
	var req struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "content is required")
	}
	if err := setup.UpdatePiAgent(req.Name, req.Content); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"updated": true}, nil
}

func (h *JSONRPCHandler) handleCustomizeAgentsRemove(params json.RawMessage) (any, error) {
	name, err := parseAgentNameParam(params)
	if err != nil {
		return nil, err
	}
	if err := setup.RemovePiAgent(name); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"removed": true}, nil
}

func (h *JSONRPCHandler) handleCustomizeAgentsRestore(params json.RawMessage) (any, error) {
	name, err := parseAgentNameParam(params)
	if err != nil {
		return nil, err
	}
	if err := setup.RestorePiAgent(name); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"restored": true}, nil
}

func parseAgentNameParam(params json.RawMessage) (string, error) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeParams(params, &req); err != nil {
		return "", err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "name is required")
	}
	return name, nil
}

// agentOperationError maps agentsetup validation errors to typed RPC errors;
// anything else is a server error.
func agentOperationError(err error) error {
	if errors.Is(err, setup.ErrInvalidAgentName) ||
		errors.Is(err, setup.ErrManagedAgentName) ||
		errors.Is(err, setup.ErrAgentAlreadyExists) ||
		errors.Is(err, setup.ErrAgentNotFound) ||
		errors.Is(err, setup.ErrOfficialAgentCannotBeRemoved) ||
		errors.Is(err, setup.ErrAgentNotManaged) ||
		errors.Is(err, setup.ErrInvalidAgentThinking) {
		return workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
	}
	return workspace.NewRPCError(rpcCodeServerError, err.Error())
}

func (h *JSONRPCHandler) dispatchCustomizeExtensions(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodCustomizeExtensionsList:
		return h.handleCustomizeExtensionsList(ctx)
	case MethodCustomizeExtensionsInstall:
		return h.handleCustomizeExtensionsInstall(ctx, params)
	case MethodCustomizeExtensionsRemove:
		return h.handleCustomizeExtensionsRemove(ctx, params)
	case MethodCustomizeExtensionsUpdate:
		return h.handleCustomizeExtensionsUpdate(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

func (h *JSONRPCHandler) handleCustomizeExtensionsList(ctx context.Context) (any, error) {
	extensions, err := setup.ListPiExtensions()
	if err != nil {
		return nil, fmt.Errorf("list pi extensions: %w", err)
	}
	setup.CheckPiExtensionUpdates(ctx, extensions)
	return map[string]any{"extensions": extensions}, nil
}

func (h *JSONRPCHandler) handleCustomizeExtensionsInstall(ctx context.Context, params json.RawMessage) (any, error) {
	source, err := parseExtensionMutationParam(params)
	if err != nil {
		return nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.InstallPiExtension(commandCtx, source); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "install pi extension: "+err.Error())
	}
	return map[string]any{"installed": true}, nil
}

func (h *JSONRPCHandler) handleCustomizeExtensionsRemove(ctx context.Context, params json.RawMessage) (any, error) {
	source, err := parseExtensionMutationParam(params)
	if err != nil {
		return nil, err
	}
	if rejectErr := extensionRemoveTargetError(source); rejectErr != nil {
		return nil, rejectErr
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.RemovePiExtension(commandCtx, source); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "remove pi extension: "+err.Error())
	}
	return map[string]any{"removed": true}, nil
}

// extensionRemoveTargetError rejects removing official extensions: they are
// part of the managed base install that `yishan setup` restores, so they are
// updated through the panel but not removable.
func extensionRemoveTargetError(source string) error {
	extensions, err := setup.ListPiExtensions()
	if err != nil {
		return nil // the remove attempt itself surfaces the real error
	}
	for _, ext := range extensions {
		if ext.Source == source && ext.Official {
			return workspace.NewRPCError(rpcCodeInvalidParams, "official extensions are managed by yishan setup and cannot be removed")
		}
	}
	return nil
}

func (h *JSONRPCHandler) handleCustomizeExtensionsUpdate(ctx context.Context, params json.RawMessage) (any, error) {
	source, err := parseExtensionMutationParam(params)
	if err != nil {
		return nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.UpdatePiExtension(commandCtx, source); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "update pi extension: "+err.Error())
	}
	return map[string]any{"updated": true}, nil
}

// parseExtensionMutationParam extracts the source spec of an install/update
// call. pi matches installs/removals/updates by source identity, so the full
// spec (npm:, git:, https:, local path) is required — a bare package name is
// never a valid target.
func parseExtensionMutationParam(params json.RawMessage) (string, error) {
	var req struct {
		Source string `json:"source"`
	}
	if err := decodeParams(params, &req); err != nil {
		return "", err
	}
	value := strings.TrimSpace(req.Source)
	if value == "" {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "source is required")
	}
	return value, nil
}
