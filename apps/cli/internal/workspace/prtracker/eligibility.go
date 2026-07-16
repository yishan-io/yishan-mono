package prtracker

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
)

func (t *Tracker) shouldTrackWorkspacePullRequest(ws workspace.Workspace) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	inspect, err := t.inspectResolver(ctx, ws.Path)
	if err != nil {
		log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR tracking disabled because workspace inspection failed")
		return false
	}
	if !inspect.IsGitRepository {
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR tracking disabled because workspace is not a git repository")
		return false
	}
	branch := strings.TrimSpace(inspect.CurrentBranch)
	if branch == "" || branch == "HEAD" {
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR tracking disabled because current branch is unavailable")
		return false
	}
	remoteURL := strings.TrimSpace(inspect.RemoteURL)
	if remoteURL == "" {
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR tracking disabled because no git remote is configured")
		return false
	}
	if !isSupportedPullRequestProviderRemote(remoteURL) {
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("remoteUrl", remoteURL).Msg("workspace PR tracking disabled because provider is not supported")
		return false
	}
	return true
}

func isSupportedPullRequestProviderRemote(remoteURL string) bool {
	host := gitRemoteHost(remoteURL)
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	return host == "github.com" || strings.Contains(host, "github")
}

func gitRemoteHost(remoteURL string) string {
	trimmed := strings.TrimSpace(remoteURL)
	if trimmed == "" {
		return ""
	}
	if strings.Contains(trimmed, "://") {
		parsed, err := url.Parse(trimmed)
		if err == nil {
			return parsed.Hostname()
		}
	}
	if withoutUser, ok := strings.CutPrefix(trimmed, "git@"); ok {
		host, _, ok := strings.Cut(withoutUser, ":")
		if ok {
			return host
		}
	}
	return ""
}
