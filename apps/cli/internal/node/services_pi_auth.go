package node

import (
	"context"
	"errors"
	"os"

	piauth "yishan/apps/cli/internal/agent/auth"
	"yishan/apps/cli/internal/rpc"
)

// Pi provider credential handlers: adapters for the piauth store. The store
// itself (auth.json format, locking, ambient detection) lives in
// internal/agent/auth.

func (s *Service) PiListProviders(ctx context.Context) (any, error) {
	if s.deps.PIAuth == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "pi agent auth store is unavailable")
	}
	entries, err := s.deps.PIAuth.List()
	if err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]any{"providers": entries}, nil
}

func (s *Service) PiSaveProvider(ctx context.Context, req rpc.PiSaveProviderParams) (any, error) {
	if s.deps.PIAuth == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "pi agent auth store is unavailable")
	}
	if err := s.deps.PIAuth.Save(req.Provider, piauth.CredentialInput{Key: req.Key, Env: req.Env}); err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) PiRemoveProvider(ctx context.Context, req rpc.PiRemoveProviderParams) (any, error) {
	if s.deps.PIAuth == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "pi agent auth store is unavailable")
	}
	if err := s.deps.PIAuth.Remove(req.Provider); err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]bool{"ok": true}, nil
}

// mapPiAuthError converts store errors into typed RPC errors: validation
// problems become invalid-params, lock contention and IO failures become
// server errors with actionable messages.
func mapPiAuthError(err error) error {
	if errors.Is(err, piauth.ErrLocked) {
		return rpc.NewRPCError(rpc.CodeServerError, "pi is updating provider credentials; try again")
	}
	if errors.Is(err, piauth.ErrCorrupt) {
		return rpc.NewRPCError(rpc.CodeServerError, "pi auth file is corrupt; check ~/.yishan/pi/agent/auth.json")
	}
	var rpcErr *rpc.Error
	if errors.As(err, &rpcErr) {
		return err
	}
	// IO/OS failures (permission, missing dir, disk) are server-side problems,
	// not client parameter errors.
	var pathErr *os.PathError
	if errors.As(err, &pathErr) {
		return rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return rpc.NewRPCError(rpc.CodeInvalidParams, err.Error())
}
