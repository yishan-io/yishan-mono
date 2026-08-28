package agent

import (
	"context"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

// DSHListCredentials returns the ref names stored in the DSH credentials file.
func (s *Service) DSHListCredentials(_ context.Context) (any, error) {
	if s.deps.DSHCredentials == nil {
		return rpc.NewRPCError(rpc.CodeServerError, "dsh credentials store unavailable"), nil
	}
	refs, err := s.deps.DSHCredentials.List()
	if err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "list dsh credentials: "+err.Error())
	}
	return map[string]any{"refs": refs}, nil
}

// DSHSaveCredential upserts one API key in the DSH credentials file.
func (s *Service) DSHSaveCredential(_ context.Context, req rpc.DSHSaveCredentialParams) (any, error) {
	if s.deps.DSHCredentials == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh credentials store unavailable")
	}
	if err := s.deps.DSHCredentials.Save(req.Ref, req.Value); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, err.Error())
	}
	return map[string]bool{"ok": true}, nil
}

// DSHRemoveCredential removes one API key from the DSH credentials file.
func (s *Service) DSHRemoveCredential(_ context.Context, req rpc.DSHRemoveCredentialParams) (any, error) {
	if s.deps.DSHCredentials == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh credentials store unavailable")
	}
	if err := s.deps.DSHCredentials.Remove(req.Ref); err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return map[string]bool{"ok": true}, nil
}

// dshCredentialStore adapts dsh.CredentialStore to the service dependency interface.
type dshCredentialStoreAdapter struct{ store *dsh.CredentialStore }

func (a *dshCredentialStoreAdapter) List() ([]string, error)         { return a.store.List() }
func (a *dshCredentialStoreAdapter) Save(ref, value string) error    { return a.store.Save(ref, value) }
func (a *dshCredentialStoreAdapter) Remove(ref string) error         { return a.store.Remove(ref) }
