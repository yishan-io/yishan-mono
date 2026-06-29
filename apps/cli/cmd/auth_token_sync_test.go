package cmd

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/daemon"
)

type mockDaemonAuthSyncRPCClient struct {
	call func(ctx context.Context, method string, params any, out any) error
}

func (m *mockDaemonAuthSyncRPCClient) Call(ctx context.Context, method string, params any, out any) error {
	return m.call(ctx, method, params, out)
}

func TestSyncDaemonAuthTokensCallsPersistMethodWhenDaemonIsRunning(t *testing.T) {
	originalAppConfig := appConfig
	originalResolveStatePath := resolveDaemonStatePathForAuthSync
	originalLoadState := loadDaemonStateForAuthSync
	originalIsProcessRunning := isDaemonProcessRunningForAuthSync
	originalProbeHealth := probeDaemonHealthForAuthSync
	originalNewClient := newDaemonRPCClientForAuthSync
	defer func() {
		appConfig = originalAppConfig
		resolveDaemonStatePathForAuthSync = originalResolveStatePath
		loadDaemonStateForAuthSync = originalLoadState
		isDaemonProcessRunningForAuthSync = originalIsProcessRunning
		probeDaemonHealthForAuthSync = originalProbeHealth
		newDaemonRPCClientForAuthSync = originalNewClient
	}()

	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	resolveDaemonStatePathForAuthSync = func(configPath string) (string, error) {
		if configPath != appConfig.ConfigPath {
			t.Fatalf("configPath = %q, want %q", configPath, appConfig.ConfigPath)
		}
		return filepath.Join(filepath.Dir(configPath), daemon.StateFileName), nil
	}
	loadDaemonStateForAuthSync = func(path string) (daemon.RuntimeState, error) {
		return daemon.RuntimeState{PID: 123, Host: "127.0.0.1", Port: 65072, StartedAt: time.Now()}, nil
	}
	isDaemonProcessRunningForAuthSync = func(pid int) bool {
		return pid == 123
	}
	probeDaemonHealthForAuthSync = func(state daemon.RuntimeState, timeout time.Duration) bool {
		if timeout != daemonAuthSyncHealthTimeout {
			t.Fatalf("timeout = %v, want %v", timeout, daemonAuthSyncHealthTimeout)
		}
		return state.Port == 65072
	}

	update := api.TokenUpdate{
		AccessToken:           "fresh-access",
		RefreshToken:          "fresh-refresh",
		AccessTokenExpiresAt:  "2026-06-29T00:00:00Z",
		RefreshTokenExpiresAt: "2026-06-30T00:00:00Z",
	}
	newDaemonRPCClientForAuthSync = func(wsURL string) daemonAuthSyncRPCClient {
		if wsURL != "ws://127.0.0.1:65072/ws" {
			t.Fatalf("wsURL = %q, want %q", wsURL, "ws://127.0.0.1:65072/ws")
		}
		return &mockDaemonAuthSyncRPCClient{call: func(ctx context.Context, method string, params any, out any) error {
			if method != daemon.MethodAppPersistAuthTokens {
				t.Fatalf("method = %q, want %q", method, daemon.MethodAppPersistAuthTokens)
			}
			gotUpdate, ok := params.(api.TokenUpdate)
			if !ok {
				t.Fatalf("params type = %T, want api.TokenUpdate", params)
			}
			if gotUpdate != update {
				t.Fatalf("params = %#v, want %#v", gotUpdate, update)
			}
			result, ok := out.(*map[string]bool)
			if !ok {
				t.Fatalf("out type = %T, want *map[string]bool", out)
			}
			*result = map[string]bool{"ok": true}
			return nil
		}}
	}

	handled, err := syncDaemonAuthTokens(context.Background(), update)
	if err != nil {
		t.Fatalf("syncDaemonAuthTokens: %v", err)
	}
	if !handled {
		t.Fatal("handled = false, want true")
	}
}

func TestSyncDaemonAuthTokensSkipsWhenDaemonStateFileIsMissing(t *testing.T) {
	originalAppConfig := appConfig
	originalResolveStatePath := resolveDaemonStatePathForAuthSync
	originalLoadState := loadDaemonStateForAuthSync
	originalNewClient := newDaemonRPCClientForAuthSync
	defer func() {
		appConfig = originalAppConfig
		resolveDaemonStatePathForAuthSync = originalResolveStatePath
		loadDaemonStateForAuthSync = originalLoadState
		newDaemonRPCClientForAuthSync = originalNewClient
	}()

	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	resolveDaemonStatePathForAuthSync = func(configPath string) (string, error) {
		return filepath.Join(filepath.Dir(configPath), daemon.StateFileName), nil
	}
	loadDaemonStateForAuthSync = func(path string) (daemon.RuntimeState, error) {
		return daemon.RuntimeState{}, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
	}
	newDaemonRPCClientForAuthSync = func(wsURL string) daemonAuthSyncRPCClient {
		t.Fatal("newDaemonRPCClientForAuthSync should not be called")
		return nil
	}

	handled, err := syncDaemonAuthTokens(context.Background(), api.TokenUpdate{AccessToken: "fresh-access"})
	if err != nil {
		t.Fatalf("syncDaemonAuthTokens: %v", err)
	}
	if handled {
		t.Fatal("handled = true, want false")
	}
}

func TestSyncDaemonAuthTokensReturnsClientErrorWhenDaemonSyncFails(t *testing.T) {
	originalAppConfig := appConfig
	originalResolveStatePath := resolveDaemonStatePathForAuthSync
	originalLoadState := loadDaemonStateForAuthSync
	originalIsProcessRunning := isDaemonProcessRunningForAuthSync
	originalProbeHealth := probeDaemonHealthForAuthSync
	originalNewClient := newDaemonRPCClientForAuthSync
	defer func() {
		appConfig = originalAppConfig
		resolveDaemonStatePathForAuthSync = originalResolveStatePath
		loadDaemonStateForAuthSync = originalLoadState
		isDaemonProcessRunningForAuthSync = originalIsProcessRunning
		probeDaemonHealthForAuthSync = originalProbeHealth
		newDaemonRPCClientForAuthSync = originalNewClient
	}()

	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	resolveDaemonStatePathForAuthSync = func(configPath string) (string, error) {
		return filepath.Join(filepath.Dir(configPath), daemon.StateFileName), nil
	}
	loadDaemonStateForAuthSync = func(path string) (daemon.RuntimeState, error) {
		return daemon.RuntimeState{PID: 123, Host: "127.0.0.1", Port: 65072, StartedAt: time.Now()}, nil
	}
	isDaemonProcessRunningForAuthSync = func(pid int) bool { return true }
	probeDaemonHealthForAuthSync = func(state daemon.RuntimeState, timeout time.Duration) bool { return true }
	newDaemonRPCClientForAuthSync = func(wsURL string) daemonAuthSyncRPCClient {
		return &mockDaemonAuthSyncRPCClient{call: func(ctx context.Context, method string, params any, out any) error {
			return errors.New("boom")
		}}
	}

	handled, err := syncDaemonAuthTokens(context.Background(), api.TokenUpdate{AccessToken: "fresh-access"})
	if !handled {
		t.Fatal("handled = false, want true")
	}
	if err == nil || err.Error() != "sync daemon auth tokens: boom" {
		t.Fatalf("err = %v, want sync error", err)
	}
}

func TestPersistAuthTokensForLoginUsesDaemonSyncWithoutLocalPersistence(t *testing.T) {
	originalAppConfig := appConfig
	originalResolveStatePath := resolveDaemonStatePathForAuthSync
	originalLoadState := loadDaemonStateForAuthSync
	originalIsProcessRunning := isDaemonProcessRunningForAuthSync
	originalProbeHealth := probeDaemonHealthForAuthSync
	originalNewClient := newDaemonRPCClientForAuthSync
	originalLocalPersist := persistAuthTokensLocallyForAuthSync
	defer func() {
		appConfig = originalAppConfig
		resolveDaemonStatePathForAuthSync = originalResolveStatePath
		loadDaemonStateForAuthSync = originalLoadState
		isDaemonProcessRunningForAuthSync = originalIsProcessRunning
		probeDaemonHealthForAuthSync = originalProbeHealth
		newDaemonRPCClientForAuthSync = originalNewClient
		persistAuthTokensLocallyForAuthSync = originalLocalPersist
	}()

	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	resolveDaemonStatePathForAuthSync = func(configPath string) (string, error) {
		return filepath.Join(filepath.Dir(configPath), daemon.StateFileName), nil
	}
	loadDaemonStateForAuthSync = func(path string) (daemon.RuntimeState, error) {
		return daemon.RuntimeState{PID: 123, Host: "127.0.0.1", Port: 65072, StartedAt: time.Now()}, nil
	}
	isDaemonProcessRunningForAuthSync = func(pid int) bool { return true }
	probeDaemonHealthForAuthSync = func(state daemon.RuntimeState, timeout time.Duration) bool { return true }
	persistAuthTokensLocallyForAuthSync = func(update api.TokenUpdate) error {
		t.Fatal("persistAuthTokensLocallyForAuthSync should not be called")
		return nil
	}
	newDaemonRPCClientForAuthSync = func(wsURL string) daemonAuthSyncRPCClient {
		return &mockDaemonAuthSyncRPCClient{call: func(ctx context.Context, method string, params any, out any) error {
			result := out.(*map[string]bool)
			*result = map[string]bool{"ok": true}
			return nil
		}}
	}

	update := api.TokenUpdate{AccessToken: "fresh-access", RefreshToken: "fresh-refresh"}
	result, err := persistAuthTokensForLogin(context.Background(), update)
	if err != nil {
		t.Fatalf("persistAuthTokensForLogin: %v", err)
	}
	if result.Warning != nil {
		t.Fatalf("Warning = %v, want nil", result.Warning)
	}
	if appConfig.API.Token != update.AccessToken || appConfig.API.RefreshToken != update.RefreshToken {
		t.Fatalf("appConfig API = %#v, want access/refresh tokens updated", appConfig.API)
	}
}

func TestPersistAuthTokensForLoginFallsBackToLocalPersistenceOnDaemonSyncError(t *testing.T) {
	originalAppConfig := appConfig
	originalResolveStatePath := resolveDaemonStatePathForAuthSync
	originalLoadState := loadDaemonStateForAuthSync
	originalIsProcessRunning := isDaemonProcessRunningForAuthSync
	originalProbeHealth := probeDaemonHealthForAuthSync
	originalNewClient := newDaemonRPCClientForAuthSync
	originalLocalPersist := persistAuthTokensLocallyForAuthSync
	defer func() {
		appConfig = originalAppConfig
		resolveDaemonStatePathForAuthSync = originalResolveStatePath
		loadDaemonStateForAuthSync = originalLoadState
		isDaemonProcessRunningForAuthSync = originalIsProcessRunning
		probeDaemonHealthForAuthSync = originalProbeHealth
		newDaemonRPCClientForAuthSync = originalNewClient
		persistAuthTokensLocallyForAuthSync = originalLocalPersist
	}()

	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	resolveDaemonStatePathForAuthSync = func(configPath string) (string, error) {
		return filepath.Join(filepath.Dir(configPath), daemon.StateFileName), nil
	}
	loadDaemonStateForAuthSync = func(path string) (daemon.RuntimeState, error) {
		return daemon.RuntimeState{PID: 123, Host: "127.0.0.1", Port: 65072, StartedAt: time.Now()}, nil
	}
	isDaemonProcessRunningForAuthSync = func(pid int) bool { return true }
	probeDaemonHealthForAuthSync = func(state daemon.RuntimeState, timeout time.Duration) bool { return true }
	newDaemonRPCClientForAuthSync = func(wsURL string) daemonAuthSyncRPCClient {
		return &mockDaemonAuthSyncRPCClient{call: func(ctx context.Context, method string, params any, out any) error {
			return errors.New("boom")
		}}
	}
	var persistedUpdate api.TokenUpdate
	persistAuthTokensLocallyForAuthSync = func(update api.TokenUpdate) error {
		persistedUpdate = update
		applyAuthTokenUpdate(update)
		return nil
	}

	update := api.TokenUpdate{AccessToken: "fresh-access"}
	result, err := persistAuthTokensForLogin(context.Background(), update)
	if err != nil {
		t.Fatalf("persistAuthTokensForLogin: %v", err)
	}
	if result.Warning == nil || result.Warning.Error() != "sync daemon auth tokens: boom" {
		t.Fatalf("Warning = %v, want sync daemon auth tokens warning", result.Warning)
	}
	if persistedUpdate != update {
		t.Fatalf("persistedUpdate = %#v, want %#v", persistedUpdate, update)
	}
	if appConfig.API.Token != update.AccessToken {
		t.Fatalf("appConfig.API.Token = %q, want %q", appConfig.API.Token, update.AccessToken)
	}
}
