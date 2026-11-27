package app

import (
	"context"
	"fmt"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
)

// personalTaskKeyPrefix is the prefix of keys for tasks without a project.
const personalTaskKeyPrefix = "PERS"

// taskPrefixes resolves (and for legacy projects assigns) a project's prefix.
type taskPrefixes interface {
	TaskPrefix(ctx context.Context, projectID string) (string, bool, error)
}

// localKeyAllocator hands out Local Task keys from this daemon's counters:
// "<project prefix>-n" for project tasks, "PERS-n" for everything else
// (no project, a folder project, or a project that no longer exists).
type localKeyAllocator struct {
	projects taskPrefixes
	keys     *sqlite.TaskKeyStore
}

func newLocalKeyAllocator(projects taskPrefixes, keys *sqlite.TaskKeyStore) *localKeyAllocator {
	return &localKeyAllocator{projects: projects, keys: keys}
}

func (allocator *localKeyAllocator) AllocateTaskKey(ctx context.Context, request nodelocaltask.KeyAllocationRequest) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if request.ProjectID == nil || (request.ProjectKind != nil && *request.ProjectKind == domain.ProjectKindFolder) {
		return allocator.keys.Allocate(ctx, sqlite.PersonalTaskKeyScope, personalTaskKeyPrefix)
	}
	prefix, found, err := allocator.projects.TaskPrefix(ctx, *request.ProjectID)
	if err != nil {
		return "", fmt.Errorf("resolve task prefix for project %q: %w", *request.ProjectID, err)
	}
	if !found {
		return allocator.keys.Allocate(ctx, sqlite.PersonalTaskKeyScope, personalTaskKeyPrefix)
	}
	return allocator.keys.Allocate(ctx, sqlite.ProjectTaskKeyScope(*request.ProjectID), prefix)
}
