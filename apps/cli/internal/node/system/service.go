// Package system is the Node application service for the daemon./app./agent./
// tokenUsage./node., memory.*, and context.* RPC namespaces:
// system tools, scheduled jobs, memory app operations, and
// renderer context state. It receives a small dependency set and never imports
// the composition root or the daemon.
package system

import (
	"context"
	"encoding/json"
	"yishan/apps/cli/internal/adapter/sqlite"

	"yishan/apps/cli/internal/adapter/cloud/session"
	modellist "yishan/apps/cli/internal/agent/catalog"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/node/context"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace/instance"
)

// TaskContextSource provides derived Local Task roots for Memory indexing.
type TaskContextSource interface {
	ListContextRoots(context.Context) ([]localtask.ContextRoot, error)
}

// PreferenceStore is the generic persistence port for opaque JSON preferences.
type PreferenceStore interface {
	Get(context.Context, string, string) (sqlite.Preference, error)
	Set(context.Context, string, string, json.RawMessage, bool) (sqlite.Preference, error)
}

// Deps are the explicit dependencies of the system application service.
type Deps struct {
	Preferences PreferenceStore
	Session     *session.Session
	Events      *eventbus.Hub
	ModelList   *modellist.Service
	TokenUsage  tokenusage.Service

	Memory       *memory.Service
	TaskContexts TaskContextSource
	Registry     *instance.Registry
	ContextStore *contextstore.Store

	SettingsPath string
	// ServerCtx is the long-lived context RPC handlers use for server-side
	// work (memory searches).
	ServerCtx context.Context
}

// Service implements the system.*, memory.*, and context.* RPC
// namespaces. Each method is named after the wire method tail; the service
// type already carries the namespace.
type Service struct {
	deps Deps
}

// NewService builds the system application service.
func NewService(deps Deps) *Service {
	if deps.ServerCtx == nil {
		deps.ServerCtx = context.Background()
	}
	return &Service{deps: deps}
}

// Limits are byte counts. Scope and key are opaque: do not trim or normalize.
const (
	maxPreferenceScopeBytes = 1024
	maxPreferenceKeyBytes   = 256
	maxPreferenceValueBytes = 1024 * 1024
)

func validatePreferenceAddress(scope, key string) error {
	if len(scope) == 0 || len(scope) > maxPreferenceScopeBytes {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "scope must contain 1..1024 bytes")
	}
	if len(key) == 0 || len(key) > maxPreferenceKeyBytes {
		return rpc.NewRPCError(rpc.CodeInvalidParams, "key must contain 1..256 bytes")
	}
	return nil
}

// GetPreference returns {found:false} or {found:true,value:JSON}, including null.
func (s *Service) GetPreference(ctx context.Context, request rpc.PreferencesGetParams) (any, error) {
	if err := validatePreferenceAddress(request.Scope, request.Key); err != nil {
		return nil, err
	}
	if s.deps.Preferences == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "preference store is unavailable")
	}
	return s.deps.Preferences.Get(ctx, request.Scope, request.Key)
}

// SetPreference stores uninterpreted JSON and returns the authoritative value.
func (s *Service) SetPreference(ctx context.Context, request rpc.PreferencesSetParams) (any, error) {
	if err := validatePreferenceAddress(request.Scope, request.Key); err != nil {
		return nil, err
	}
	if len(request.Value) == 0 || len(request.Value) > maxPreferenceValueBytes || !json.Valid(request.Value) {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "value must be valid JSON of at most 1048576 bytes")
	}
	if s.deps.Preferences == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "preference store is unavailable")
	}
	return s.deps.Preferences.Set(ctx, request.Scope, request.Key, request.Value, request.InitializeOnly)
}
