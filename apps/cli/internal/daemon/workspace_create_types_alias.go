package daemon

import (
	"yishan/apps/cli/internal/workspace/application"
	createflow "yishan/apps/cli/internal/workspace/createflow"
)

const (
	workspaceRelayChangeCreateRequest   = createflow.RelayChangeCreateRequest
	workspaceRelayChangeCreateProgress  = createflow.RelayChangeCreateProgress
	workspaceRelayChangeCreateCompleted = createflow.RelayChangeCreateCompleted
	workspaceRelayChangeCreateFailed    = createflow.RelayChangeCreateFailed
)

var decodeRelayWorkspaceCreateEnvelope = createflow.DecodeRelayWorkspaceCreateEnvelope

type workspaceCreateParams = createflow.WorkspaceCreateParams

// preparedWorkspaceCreate and friends are the daemon's aliases for the
// application package types so the transport layer speaks the domain
// vocabulary (and existing handler code stays stable during the migration).
type preparedWorkspaceCreate = application.CreatePlan

type WorkspaceCreation = application.Registration

type workspaceCloseParams = application.CloseCommand

type workspaceCreateStartedEvent = createflow.WorkspaceCreateStartedEvent

type workspaceCreateFailedEvent = createflow.WorkspaceCreateFailedEvent

type relayWorkspaceCreateEnvelope = createflow.RelayWorkspaceCreateEnvelope
