package daemon

import clidetector "yishan/apps/cli/internal/clidetector"

type NodeRegistration struct {
	ID                   string
	Endpoint             string
	AgentDetectionStatus []clidetector.Status
}
