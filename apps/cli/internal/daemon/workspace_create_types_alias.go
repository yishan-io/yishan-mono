package daemon

import createflow "yishan/apps/cli/internal/workspace/createflow"

const (
	workspaceRelayChangeCreateRequest   = createflow.RelayChangeCreateRequest
	workspaceRelayChangeCreateProgress  = createflow.RelayChangeCreateProgress
	workspaceRelayChangeCreateCompleted = createflow.RelayChangeCreateCompleted
	workspaceRelayChangeCreateFailed    = createflow.RelayChangeCreateFailed
)

var decodeRelayWorkspaceCreateEnvelope = createflow.DecodeRelayWorkspaceCreateEnvelope

type workspaceCreateParams = createflow.WorkspaceCreateParams

type workspaceCreateStartedEvent = createflow.WorkspaceCreateStartedEvent

type workspaceCreateFailedEvent = createflow.WorkspaceCreateFailedEvent

type relayWorkspaceCreateEnvelope = createflow.RelayWorkspaceCreateEnvelope
