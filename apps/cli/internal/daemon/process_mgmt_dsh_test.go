package daemon

import (
	"slices"
	"testing"
)

func TestBuildDetachedArgs_ForwardsDSHConfiguration(t *testing.T) {
	args := buildDetachedArgs(StartConfig{Run: RunConfig{
		Host: "127.0.0.1", Port: 9000, DSHEnabled: true,
		DSHNodePath: "/app/Yishan", DSHRuntimePath: "/app/dsh-runtime.mjs",
		DSHProvider: "provider", DSHModel: "model",
	}})
	for _, expected := range []string{
		"--dsh-enabled=true", "--dsh-node-path", "/app/Yishan",
		"--dsh-runtime-path", "/app/dsh-runtime.mjs", "--dsh-provider", "provider", "--dsh-model", "model",
	} {
		if !slices.Contains(args, expected) {
			t.Fatalf("detached args %v do not contain %q", args, expected)
		}
	}
}
