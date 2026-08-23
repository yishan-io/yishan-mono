package config

import "strings"

// DaemonWSEndpointEnvKey is the managed daemon WebSocket endpoint inherited by
// daemon-launched processes. An empty value explicitly disables stale endpoint
// values inherited from the daemon environment.
const DaemonWSEndpointEnvKey = "YISHAN_DAEMON_WS_URL"

// OverrideDaemonWSEndpointEnv removes every existing endpoint value and appends
// the sole authoritative endpoint, including an empty value when unavailable.
func OverrideDaemonWSEndpointEnv(baseEnv []string, endpoint string) []string {
	env := make([]string, 0, len(baseEnv)+1)
	prefix := DaemonWSEndpointEnvKey + "="
	for _, entry := range baseEnv {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.EqualFold(key, DaemonWSEndpointEnvKey) {
			env = append(env, entry)
		}
	}
	return append(env, prefix+strings.TrimSpace(endpoint))
}
