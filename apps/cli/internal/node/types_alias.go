package node

import (
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/workspace/application"
	createflow "yishan/apps/cli/internal/workspace/createflow"
)

const (
	workspaceRelayChangeCreateRequest   = relay.ChangeCreateRequest
	workspaceRelayChangeCreateProgress  = relay.ChangeCreateProgress
	workspaceRelayChangeCreateCompleted = relay.ChangeCreateCompleted
	workspaceRelayChangeCreateFailed    = relay.ChangeCreateFailed
	relayChangeWorkspaceCloseRequest    = relay.ChangeCloseRequest
)

var decodeRelayWorkspaceCreateEnvelope = relay.DecodeCreateEnvelope

type workspaceCreateParams = createflow.WorkspaceCreateParams

// preparedWorkspaceCreate and friends are the daemon's aliases for the
// application package types so the transport layer speaks the domain
// vocabulary (and existing handler code stays stable during the migration).
type preparedWorkspaceCreate = application.CreatePlan

type WorkspaceCreation = application.Registration

type workspaceCloseParams = application.CloseCommand

type workspaceCreateStartedEvent = createflow.WorkspaceCreateStartedEvent

type workspaceCreateFailedEvent = createflow.WorkspaceCreateFailedEvent

type relayWorkspaceCreateEnvelope = relay.CreateEnvelope

type relayWorkspaceCloseEnvelope = relay.CloseEnvelope

var decodeRelayWorkspaceCloseEnvelope = relay.DecodeCloseEnvelope
