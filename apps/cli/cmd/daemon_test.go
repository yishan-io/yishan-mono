package cmd

import (
	"path/filepath"
	"testing"
)

func TestStopDaemon_SucceedsWhenDaemonNotRunning(t *testing.T) {
	previousConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(t.TempDir(), "credential.yaml")
	defer func() {
		appConfig.ConfigPath = previousConfigPath
	}()

	if err := stopDaemon(nil, nil); err != nil {
		t.Fatalf("stopDaemon returned error for missing daemon: %v", err)
	}
}

func TestBuildRunConfig_PropagatesDisabledDSHByDefault(t *testing.T) {
	previousConfig := appConfig
	defer func() { appConfig = previousConfig }()
	appConfig.Daemon.DSHEnabled = false

	runConfig := buildRunConfig("")
	if runConfig.DSHEnabled {
		t.Fatal("DSH is enabled by default")
	}
	if runConfig.DSHDeveloperMode {
		t.Fatal("DSH developer mode is enabled by default")
	}
}

func TestBuildRunConfig_PropagatesDSHDeveloperMode(t *testing.T) {
	previousConfig := appConfig
	defer func() { appConfig = previousConfig }()
	appConfig.Daemon.DSHDeveloperMode = true

	runConfig := buildRunConfig("")
	if !runConfig.DSHDeveloperMode {
		t.Fatal("DSH developer mode is disabled, want enabled")
	}
}

func TestBuildRunConfig_PropagatesDSHPluginSeedPath(t *testing.T) {
	previousConfig := appConfig
	defer func() { appConfig = previousConfig }()
	appConfig.Daemon.DSHPluginSeedPath = "/bundle/dev-flow.tgz"
	if got := buildRunConfig("", false).DSHPluginSeedPath; got != "/bundle/dev-flow.tgz" {
		t.Fatalf("seed path = %q", got)
	}
}
