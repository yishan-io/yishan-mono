package cmd

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"time"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"
	cliruntime "yishan/apps/cli/internal/runtime"
)

const daemonAuthSyncHealthTimeout = 250 * time.Millisecond
const daemonAuthSyncRequestTimeout = 5 * time.Second

type daemonAuthSyncRPCClient interface {
	Call(ctx context.Context, method string, params any, out any) error
}

var resolveDaemonStatePathForAuthSync = daemon.ResolveStateFilePath
var loadDaemonStateForAuthSync = daemon.LoadState
var isDaemonProcessRunningForAuthSync = daemon.IsProcessRunning
var probeDaemonHealthForAuthSync = daemon.ProbeHealth
var newDaemonRPCClientForAuthSync = func(wsURL string) daemonAuthSyncRPCClient {
	return daemonclient.New(wsURL, "")
}
var persistAuthTokensLocallyForAuthSync = func(update api.TokenUpdate) error {
	return cliruntime.New(&appConfig).PersistAuthTokens(update)
}

type authTokenPersistenceResult struct {
	Warning error
}

func persistAuthTokensForLogin(ctx context.Context, update api.TokenUpdate) (authTokenPersistenceResult, error) {
	daemonHandled, err := syncDaemonAuthTokens(ctx, update)
	if daemonHandled && err == nil {
		applyAuthTokenUpdate(update)
		return authTokenPersistenceResult{}, nil
	}
	if persistErr := persistAuthTokensLocallyForAuthSync(update); persistErr != nil {
		return authTokenPersistenceResult{}, persistErr
	}
	if err != nil {
		return authTokenPersistenceResult{Warning: err}, nil
	}
	return authTokenPersistenceResult{}, nil
}

func applyAuthTokenUpdate(update api.TokenUpdate) {
	appConfig.API.Token = update.AccessToken
	appConfig.API.RefreshToken = update.RefreshToken
	appConfig.API.AccessTokenExpiresAt = update.AccessTokenExpiresAt
	appConfig.API.RefreshTokenExpiresAt = update.RefreshTokenExpiresAt
}

func syncDaemonAuthTokens(ctx context.Context, update api.TokenUpdate) (bool, error) {
	statePath, err := resolveDaemonStatePathForAuthSync(appConfig.ConfigPath)
	if err != nil {
		return false, fmt.Errorf("resolve daemon state path: %w", err)
	}

	state, err := loadDaemonStateForAuthSync(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("load daemon state: %w", err)
	}
	if !isDaemonProcessRunningForAuthSync(state.PID) {
		return false, nil
	}
	if !probeDaemonHealthForAuthSync(state, daemonAuthSyncHealthTimeout) {
		return false, nil
	}

	wsURL := "ws://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port)) + "/ws"
	requestContext, cancel := context.WithTimeout(ctx, daemonAuthSyncRequestTimeout)
	defer cancel()

	client := newDaemonRPCClientForAuthSync(wsURL)
	var result map[string]bool
	if err := client.Call(requestContext, daemon.MethodAppPersistAuthTokens, update, &result); err != nil {
		return true, fmt.Errorf("sync daemon auth tokens: %w", err)
	}
	if ok, exists := result["ok"]; exists && !ok {
		return true, errors.New("sync daemon auth tokens: daemon rejected auth token update")
	}

	return true, nil
}
