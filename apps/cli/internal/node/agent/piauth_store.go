package agent

import piauth "yishan/apps/cli/internal/agent/auth"

// NewManagedPiAuthStore builds the managed pi agent auth store, nil-safe:
// a nil store means the store is unavailable and RPC handlers report a server
// error.
func NewManagedPiAuthStore() *piauth.Store {
	return newManagedPiAuthStore()
}

func newManagedPiAuthStore() *piauth.Store {
	store, err := piauth.NewManagedStore()
	if err != nil {
		return nil
	}
	return store
}
