package cmd

import (
	"net"
	"strconv"

	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"
)

// resolveDaemonClient loads the daemon state file and returns a JSON-RPC
// client pointed at the running daemon. Returns daemon.ErrNotRunning if no
// healthy daemon process is found so callers get the correct exit code (6).
func resolveDaemonClient() (*daemonclient.Client, error) {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return nil, err
	}

	state, err := daemon.LoadState(statePath)
	if err != nil {
		return nil, daemon.ErrNotRunning
	}

	if !daemon.IsProcessRunning(state.PID) {
		return nil, daemon.ErrNotRunning
	}

	wsURL := "ws://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port)) + "/ws"
	return daemonclient.New(wsURL, ""), nil
}
