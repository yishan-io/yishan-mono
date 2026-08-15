package daemon

import clidetector "yishan/apps/cli/internal/agent/catalog/detect"

type NodeRegistration struct {
	ID                   string
	Endpoint             string
	AgentDetectionStatus []clidetector.Status
}
