package daemon

import (
	"slices"
	"strconv"
	"testing"
)

func TestBuildDetachedArgs_ForwardsDSHDeveloperMode(t *testing.T) {
	for _, testCase := range []struct {
		name            string
		isDeveloperMode bool
	}{
		{name: "enabled", isDeveloperMode: true},
		{name: "disabled", isDeveloperMode: false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			args := buildDetachedArgs(StartConfig{
				HasCustomLogFile: true,
				LogFile:          "/tmp/daemon.log",
				Run: RunConfig{
					Host: "127.0.0.1", Port: 9000, DSHEnabled: true, DSHDeveloperMode: testCase.isDeveloperMode,
					DSHNodePath: "/app/Yishan", DSHRuntimePath: "/app/dsh-runtime.mjs",
					DSHPluginSeedPath: "/bundle/dev-flow.tgz", DSHProvider: "provider", DSHModel: "model",
				},
			})
			for _, expected := range []string{
				"--log-file", "/tmp/daemon.log", "--dsh-enabled=true",
				"--dsh-developer-mode=" + strconv.FormatBool(testCase.isDeveloperMode),
				"--dsh-node-path", "/app/Yishan", "--dsh-runtime-path", "/app/dsh-runtime.mjs",
				"--dsh-plugin-seed-path", "/bundle/dev-flow.tgz", "--dsh-provider", "provider", "--dsh-model", "model",
			} {
				if !slices.Contains(args, expected) {
					t.Fatalf("detached args %v do not contain %q", args, expected)
				}
			}
		})
	}
}
