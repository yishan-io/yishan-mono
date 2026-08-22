// Package localtask defines the local-only task lifecycle and persistence contract.
package localtask

import (
	"context"
	"errors"
	"strings"
)

const (
	// StatusActive identifies work that is currently in progress.
	StatusActive Status = "active"
	// StatusPaused identifies work that is intentionally on hold.
	StatusPaused Status = "paused"
	// StatusCompleted identifies work that is finished.
	StatusCompleted Status = "completed"
)

const (
	// PriorityLow identifies work with low urgency.
	PriorityLow Priority = "low"
	// PriorityMedium identifies work with normal urgency.
	PriorityMedium Priority = "medium"
	// PriorityHigh identifies work with high urgency.
	PriorityHigh Priority = "high"
)

const (
	// LinkRolePrimary identifies the task used as a workspace's default context.
	LinkRolePrimary LinkRole = "primary"
	// LinkRoleRelated identifies a non-default task associated with a workspace.
	LinkRoleRelated LinkRole = "related"
)

var (
	// ErrTaskNotFound indicates the requested Local Task does not exist.
	ErrTaskNotFound = errors.New("local task not found")
	// ErrLinkNotFound indicates the requested Local Task workspace link does not exist.
	ErrLinkNotFound = errors.New("local task workspace link not found")
	// ErrInvalidTask indicates a task violates the Local Task lifecycle contract.
	ErrInvalidTask = errors.New("invalid local task")
	// ErrInvalidLink indicates a workspace link violates the Local Task lifecycle contract.
	ErrInvalidLink = errors.New("invalid local task workspace link")
)

// Status is a Local Task lifecycle state.
type Status string

// Priority is a Local Task's personal priority.
type Priority string

// LinkRole describes a task's relationship to a workspace.
type LinkRole string

// Task is Local Task metadata authoritative in the local SQLite database.
type Task struct {
	ID          string
	ProjectID   *string
	Title       string
	Description string
	Status      Status
	Priority    Priority
	CreatedAt   string
	UpdatedAt   string
	CompletedAt *string
}

// WorkspaceLink relates a Local Task to a local workspace.
type WorkspaceLink struct {
	ID          string
	LocalTaskID string
	WorkspaceID string
	Role        LinkRole
	Status      Status
	LinkedAt    string
	UnlinkedAt  *string
}

// TaskFilter limits Local Task list results.
type TaskFilter struct {
	ProjectID   *string
	Status      *Status
	Priority    *Priority
	WorkspaceID *string
}

// TaskUpdate contains mutable Local Task fields.
type TaskUpdate struct {
	Title       *string
	Description *string
	Status      *Status
	Priority    *Priority
}

// SearchResult is a Local Task metadata FTS result.
type SearchResult struct {
	Task
	Rank float64
}

// Repository persists Local Task metadata and workspace relationships.
type Repository interface {
	Create(context.Context, Task) (Task, error)
	Get(context.Context, string) (Task, error)
	List(context.Context, TaskFilter) ([]Task, error)
	Update(context.Context, string, TaskUpdate) (Task, error)
	Search(context.Context, string, TaskFilter) ([]SearchResult, error)
	LinkWorkspace(context.Context, WorkspaceLink) (WorkspaceLink, error)
	UnlinkWorkspace(context.Context, string) error
	ListWorkspaceLinks(context.Context, string) ([]WorkspaceLink, error)
	ListTaskLinks(context.Context, string) ([]WorkspaceLink, error)
	SetPrimaryWorkspaceTask(context.Context, string, string) (WorkspaceLink, error)
}

// ValidateTask validates required Local Task metadata.
func ValidateTask(task Task) error {
	if strings.TrimSpace(task.ID) == "" || strings.TrimSpace(task.Title) == "" {
		return ErrInvalidTask
	}
	if !isValidStatus(task.Status) || !isValidPriority(task.Priority) {
		return ErrInvalidTask
	}
	return nil
}

// ValidateTaskUpdate validates supplied Local Task metadata updates.
func ValidateTaskUpdate(update TaskUpdate) error {
	if update.Title != nil && strings.TrimSpace(*update.Title) == "" {
		return ErrInvalidTask
	}
	if update.Status != nil && !isValidStatus(*update.Status) {
		return ErrInvalidTask
	}
	if update.Priority != nil && !isValidPriority(*update.Priority) {
		return ErrInvalidTask
	}
	return nil
}

// ValidateWorkspaceLink validates a Local Task workspace association.
func ValidateWorkspaceLink(link WorkspaceLink) error {
	if strings.TrimSpace(link.ID) == "" || strings.TrimSpace(link.LocalTaskID) == "" || strings.TrimSpace(link.WorkspaceID) == "" {
		return ErrInvalidLink
	}
	if !isValidLinkRole(link.Role) || !isValidStatus(link.Status) {
		return ErrInvalidLink
	}
	return nil
}

func isValidStatus(status Status) bool {
	return status == StatusActive || status == StatusPaused || status == StatusCompleted
}

func isValidPriority(priority Priority) bool {
	return priority == PriorityLow || priority == PriorityMedium || priority == PriorityHigh
}

func isValidLinkRole(role LinkRole) bool {
	return role == LinkRolePrimary || role == LinkRoleRelated
}
