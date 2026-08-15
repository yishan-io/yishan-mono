package daemon

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	goruntime "runtime"
	"strings"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/buildinfo"
	cliruntime "yishan/apps/cli/internal/runtime"
)

func isReauthRequiredError(err error) bool {
	if err == nil {
		return false
	}

	var refreshErr *api.TokenRefreshError
	if errors.As(err, &refreshErr) {
		return true
	}

	var apiErr *api.APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusUnauthorized
	}

	return false
}

func formatReauthRequiredMessage(operation string) string {
	return fmt.Sprintf("%s requires an authenticated API session; your refresh token may be expired. Run `yishan login` and retry", operation)
}

func registerRemoteNode(runtime *cliruntime.Runtime, registration NodeRegistration) error {
	if runtime == nil || !runtime.APIConfigured() {
		return nil
	}
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "local-daemon"
	}

	agentDetection := make([]map[string]any, 0, len(registration.AgentDetectionStatus))
	for _, status := range registration.AgentDetectionStatus {
		entry := map[string]any{
			"agentKind": status.ToolID,
			"detected":  status.Installed,
		}
		if strings.TrimSpace(status.Version) != "" {
			entry["version"] = status.Version
		}
		agentDetection = append(agentDetection, entry)
	}

	_, err = runtime.APIClient().RegisterNode(api.RegisterNodeInput{
		NodeID:   registration.ID,
		Name:     hostname,
		Kind:     "managed",
		Scope:    "private",
		Endpoint: registration.Endpoint,
		Metadata: map[string]any{
			"os":      goruntime.GOOS,
			"version": buildinfo.Version,
			"agents":  agentDetection,
		},
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return fmt.Errorf("%s: %w", formatReauthRequiredMessage("daemon node registration"), err)
		}
		return fmt.Errorf("register node %q: %w", registration.ID, err)
	}
	return nil
}
