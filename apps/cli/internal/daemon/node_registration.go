package daemon

import clidetector "yishan/apps/cli/internal/daemon/cli_detector"

type NodeRegistration struct {
	ID                   string
	Endpoint             string
	AgentDetectionStatus []clidetector.Status
}
