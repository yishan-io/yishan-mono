package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	setup "yishan/apps/cli/internal/agent/setup"
	"yishan/apps/cli/internal/rpc"
)

// CustomizeService implementation. Each method performs one extension or agent
// operation via the setup package; RPC decoding happens in the agent handler.

// managedCommandTimeout bounds pi/npx installs and removals so a stalled
// network fetch cannot occupy an RPC handler slot indefinitely.
const managedCommandTimeout = 10 * time.Minute

func (s *Service) ToolsList(ctx context.Context) (any, error) {
	tools, err := setup.ListPiTools(ctx)
	if err != nil {
		return nil, fmt.Errorf("list pi tools: %w", err)
	}
	return map[string]any{"tools": tools}, nil
}

func (s *Service) ExtensionsList(ctx context.Context) (any, error) {
	extensions, err := setup.ListPiExtensions()
	if err != nil {
		return nil, fmt.Errorf("list pi extensions: %w", err)
	}
	setup.CheckPiExtensionUpdates(ctx, extensions)
	return map[string]any{"extensions": extensions}, nil
}

func (s *Service) ExtensionsInstall(ctx context.Context, req rpc.CustomizeExtensionSourceParams) (any, error) {
	source, err := requireExtensionSource(req.Source)
	if err != nil {
		return nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.InstallPiExtension(commandCtx, source); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "install pi extension: "+err.Error())
	}
	return map[string]any{"installed": true}, nil
}

// CustomizeExtensionsRemove implements customize.extensions.remove with the
// official-extension gating: official extensions are part of the managed base
// install that `yishan setup` restores, so they are updated through the panel
// but not removable.
func (s *Service) ExtensionsRemove(ctx context.Context, req rpc.CustomizeExtensionSourceParams) (any, error) {
	source, err := requireExtensionSource(req.Source)
	if err != nil {
		return nil, err
	}
	if rejectErr := extensionRemoveTargetError(source); rejectErr != nil {
		return nil, rejectErr
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.RemovePiExtension(commandCtx, source); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "remove pi extension: "+err.Error())
	}
	return map[string]any{"removed": true}, nil
}

func (s *Service) ExtensionsUpdate(ctx context.Context, req rpc.CustomizeExtensionSourceParams) (any, error) {
	source, err := requireExtensionSource(req.Source)
	if err != nil {
		return nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.UpdatePiExtension(commandCtx, source); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "update pi extension: "+err.Error())
	}
	return map[string]any{"updated": true}, nil
}

func requireExtensionSource(source string) (string, error) {
	value := strings.TrimSpace(source)
	if value == "" {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "source is required")
	}
	return value, nil
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
			return rpc.NewRPCError(rpc.CodeInvalidParams, "official extensions are managed by yishan setup and cannot be removed")
		}
	}
	return nil
}

func (s *Service) AgentsList(ctx context.Context) (any, error) {
	agents, err := setup.ListPiAgents()
	if err != nil {
		return nil, fmt.Errorf("list pi agents: %w", err)
	}
	return map[string]any{"agents": agents}, nil
}

func (s *Service) AgentsDetail(ctx context.Context, req rpc.CustomizeAgentNameParams) (any, error) {
	name, err := requireAgentName(req.Name)
	if err != nil {
		return nil, err
	}
	detail, err := setup.GetPiAgentDetail(name)
	if err != nil {
		return nil, agentOperationError(err)
	}
	return detail, nil
}

func (s *Service) AgentsCreate(ctx context.Context, req rpc.CustomizeAgentCreateParams) (any, error) {
	if strings.TrimSpace(req.Content) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "content is required")
	}
	if err := setup.CreatePiAgent(req.Name, req.Description, req.Content, req.Model, req.Thinking, req.Tools); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"created": true}, nil
}

func (s *Service) AgentsUpdate(ctx context.Context, req rpc.CustomizeAgentUpdateParams) (any, error) {
	if strings.TrimSpace(req.Content) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "content is required")
	}
	if err := setup.UpdatePiAgent(req.Name, req.Content); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"updated": true}, nil
}

func (s *Service) AgentsRemove(ctx context.Context, req rpc.CustomizeAgentNameParams) (any, error) {
	name, err := requireAgentName(req.Name)
	if err != nil {
		return nil, err
	}
	if err := setup.RemovePiAgent(name); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"removed": true}, nil
}

func (s *Service) AgentsRestore(ctx context.Context, req rpc.CustomizeAgentNameParams) (any, error) {
	name, err := requireAgentName(req.Name)
	if err != nil {
		return nil, err
	}
	if err := setup.RestorePiAgent(name); err != nil {
		return nil, agentOperationError(err)
	}
	return map[string]any{"restored": true}, nil
}

func requireAgentName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", rpc.NewRPCError(rpc.CodeInvalidParams, "name is required")
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
		return rpc.NewRPCError(rpc.CodeInvalidParams, err.Error())
	}
	return rpc.NewRPCError(rpc.CodeServerError, err.Error())
}
