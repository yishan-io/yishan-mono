package workspace

import (
	application "yishan/apps/cli/internal/workspace/application"
)

type workspaceCreateParams = application.CreateCommand

// preparedWorkspaceCreate and friends are the daemon's aliases for the
// application package types so the transport layer speaks the domain
// vocabulary.
type preparedWorkspaceCreate = application.CreatePlan

type workspaceCloseParams = application.CloseCommand

type workspaceCreateStartedEvent = application.StartedEvent

type workspaceCreateFailedEvent = application.FailedEvent
