package daemon

import createflow "yishan/apps/cli/internal/workspace/createflow"

type workspaceCreateParams = createflow.WorkspaceCreateParams

type workspaceCreateStartedEvent = createflow.WorkspaceCreateStartedEvent

type workspaceCreateFailedEvent = createflow.WorkspaceCreateFailedEvent

type relayWorkspaceCreateEnvelope = createflow.RelayWorkspaceCreateEnvelope
