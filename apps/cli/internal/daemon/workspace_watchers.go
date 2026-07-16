package daemon

import workspacewatchers "yishan/apps/cli/internal/workspace/watchers"

type eventHubWorkspaceWatcherSink struct {
	events *eventHub
}

func newEventHubWorkspaceWatcherSink(events *eventHub) workspacewatchers.Sink {
	return eventHubWorkspaceWatcherSink{events: events}
}

func (s eventHubWorkspaceWatcherSink) PublishWorkspaceFilesChanged(event workspacewatchers.FilesChangedEvent) {
	if s.events == nil {
		return
	}
	s.events.Publish(frontendEvent{
		Topic: "workspaceFilesChanged",
		Payload: map[string]any{
			"workspaceId":           event.WorkspaceID,
			"workspaceWorktreePath": event.WorktreePath,
			"changedRelativePaths":  event.ChangedRelativePaths,
		},
	})
}

func (s eventHubWorkspaceWatcherSink) PublishGitChanged(event workspacewatchers.GitChangedEvent) {
	if s.events == nil {
		return
	}
	payload := map[string]any{
		"workspaceId":           event.WorkspaceID,
		"workspaceWorktreePath": event.WorktreePath,
		"affectsBranch":         event.AffectsBranch,
	}
	if event.CurrentBranch != "" {
		payload["currentBranch"] = event.CurrentBranch
	}
	s.events.Publish(frontendEvent{
		Topic:   "gitChanged",
		Payload: payload,
	})
}

func newWorkspaceWatchersForEventHub(events *eventHub, onGitChanged func(worktreePath string)) *workspacewatchers.Watchers {
	return workspacewatchers.New(newEventHubWorkspaceWatcherSink(events), onGitChanged)
}
