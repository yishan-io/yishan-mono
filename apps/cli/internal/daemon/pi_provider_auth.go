package daemon

import (
	"encoding/json"
	"errors"
	"os"

	piauth "yishan/apps/cli/internal/agent/auth"
	"yishan/apps/cli/internal/workspace"
)

// JSON-RPC handlers adapting the piauth store to the desktop. The store itself
// (auth.json format, locking, ambient detection) lives in internal/piauth.

func (h *JSONRPCHandler) handlePiListProviders() (any, error) {
	if h.piAuth == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "pi agent auth store is unavailable")
	}
	entries, err := h.piAuth.List()
	if err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]any{"providers": entries}, nil
}

type piSaveProviderParams struct {
	Provider string            `json:"provider"`
	Key      string            `json:"key"`
	Env      map[string]string `json:"env,omitempty"`
}

func (h *JSONRPCHandler) handlePiSaveProvider(params json.RawMessage) (any, error) {
	var req piSaveProviderParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if h.piAuth == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "pi agent auth store is unavailable")
	}
	if err := h.piAuth.Save(req.Provider, piauth.CredentialInput{Key: req.Key, Env: req.Env}); err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]bool{"ok": true}, nil
}

type piRemoveProviderParams struct {
	Provider string `json:"provider"`
}

func (h *JSONRPCHandler) handlePiRemoveProvider(params json.RawMessage) (any, error) {
	var req piRemoveProviderParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if h.piAuth == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "pi agent auth store is unavailable")
	}
	if err := h.piAuth.Remove(req.Provider); err != nil {
		return nil, mapPiAuthError(err)
	}
	return map[string]bool{"ok": true}, nil
}

// mapPiAuthError converts store errors into typed RPC errors: validation
// problems become invalid-params, lock contention and IO failures become
// server errors with actionable messages.
func mapPiAuthError(err error) error {
	if errors.Is(err, piauth.ErrLocked) {
		return workspace.NewRPCError(rpcCodeServerError, "pi is updating provider credentials; try again")
	}
	if errors.Is(err, piauth.ErrCorrupt) {
		return workspace.NewRPCError(rpcCodeServerError, "pi auth file is corrupt; check ~/.yishan/pi/agent/auth.json")
	}
	var rpcErr *workspace.RPCError
	if errors.As(err, &rpcErr) {
		return err
	}
	// IO/OS failures (permission, missing dir, disk) are server-side problems,
	// not client parameter errors.
	var pathErr *os.PathError
	if errors.As(err, &pathErr) {
		return workspace.NewRPCError(rpcCodeServerError, err.Error())
	}
	return workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
}
