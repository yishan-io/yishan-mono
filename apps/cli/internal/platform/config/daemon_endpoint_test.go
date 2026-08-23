package config

import "testing"

func TestOverrideDaemonWSEndpointEnv_RemovesCaseInsensitiveDuplicates(t *testing.T) {
	endpoint := "ws://127.0.0.1:4312/ws"
	env := OverrideDaemonWSEndpointEnv([]string{
		"PATH=/bin",
		"yishan_daemon_ws_url=stale-lowercase",
		"YISHAN_DAEMON_WS_URL=stale-uppercase",
	}, endpoint)

	if len(env) != 2 {
		t.Fatalf("environment entries = %v, want PATH and one endpoint", env)
	}
	if env[0] != "PATH=/bin" {
		t.Fatalf("preserved environment = %q, want PATH=/bin", env[0])
	}
	if env[1] != DaemonWSEndpointEnvKey+"="+endpoint {
		t.Fatalf("authoritative endpoint = %q, want %s=%s", env[1], DaemonWSEndpointEnvKey, endpoint)
	}
}
