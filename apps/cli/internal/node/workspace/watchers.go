package workspace

import (
	"yishan/apps/cli/internal/events"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
)

type eventHubWorkspaceWatcherSink struct {
	events *eventbus.Hub
}

func NewEventHubWatcherSink(events *eventbus.Hub) workspacewatchers.Sink {
	return eventHubWorkspaceWatcherSink{events: events}
}

func (s eventHubWorkspaceWatcherSink) PublishWorkspaceFilesChanged(event workspacewatchers.FilesChangedEvent) {
	if s.events == nil {
		return
	}
	s.events.Publish(eventbus.Event{
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
	s.events.Publish(eventbus.Event{
		Topic:   "gitChanged",
		Payload: payload,
	})
}

// NewWatchers builds the filesystem watchers that publish file/git-change
// events into the frontend event hub.
func NewWatchers(events *eventbus.Hub, onGitChanged func(worktreePath string)) *workspacewatchers.Watchers {
	return newWatchersForEventHub(events, onGitChanged)
}

func newWatchersForEventHub(events *eventbus.Hub, onGitChanged func(worktreePath string)) *workspacewatchers.Watchers {
	return workspacewatchers.New(NewEventHubWatcherSink(events), onGitChanged)
}

// PublishPullRequestUpdated emits the pull-request-updated frontend event.
func PublishPullRequestUpdated(events *eventbus.Hub, event workspaceprtracker.PullRequestUpdatedEvent) {
	if events == nil {
		return
	}
	events.Publish(eventbus.Event{
		Topic: "workspacePullRequestUpdated",
		Payload: map[string]any{
			"workspaceId":           event.WorkspaceID,
			"workspaceWorktreePath": event.WorkspaceWorktreePath,
			"pullRequest":           event.PullRequest,
		},
	})
}
