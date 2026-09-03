// Package localtask defines the local-only task lifecycle and persistence contract.
package localtask

import (
	"context"
	"errors"
	"strings"
)

const (
	// StatusNew identifies work that has not started.
	StatusNew Status = "new"
	// StatusProgressing identifies work that is currently in progress.
	StatusProgressing Status = "progressing"
	// StatusDone identifies work that is finished.
	StatusDone Status = "done"
	// StatusCancelled identifies work that will not continue.
	StatusCancelled Status = "cancelled"
)

const (
	// PriorityLow identifies work with low urgency.
	PriorityLow Priority = "low"
	// PriorityMedium identifies work with normal urgency.
	PriorityMedium Priority = "medium"
	// PriorityHigh identifies work with high urgency.
	PriorityHigh Priority = "high"
)

var (
	// ErrTaskNotFound indicates the requested Local Task does not exist.
	ErrTaskNotFound = errors.New("local task not found")
	// ErrTaskAlreadyExists indicates a Local Task ID is already persisted.
	ErrTaskAlreadyExists = errors.New("local task already exists")
	// ErrLinkNotFound indicates the requested Local Task workspace link does not exist.
	ErrLinkNotFound = errors.New("local task workspace link not found")
	// ErrInvalidTask indicates a task violates the Local Task lifecycle contract.
	ErrInvalidTask = errors.New("invalid local task")
	// ErrInvalidLink indicates a workspace link violates the Local Task lifecycle contract.
	ErrInvalidLink = errors.New("invalid local task workspace link")
	// ErrContextUnavailable indicates no approved local context path can be resolved.
	ErrContextUnavailable = errors.New("local task context unavailable")
	// ErrInvalidTagKey indicates a tag catalog key is not daemon-normalized.
	ErrInvalidTagKey = errors.New("invalid local task tag key")
	// ErrInvalidTagColor indicates a tag color is not in the supported palette.
	ErrInvalidTagColor = errors.New("invalid local task tag color")
	// ErrTagNotFound indicates a requested Local Task tag catalog entry does not exist.
	ErrTagNotFound = errors.New("local task tag not found")
	// ErrInvalidTag indicates a tag entity or reference is invalid.
	ErrInvalidTag = errors.New("invalid local task tag")
	// ErrKeyAllocationUnavailable indicates this node cannot reserve a required task key.
	ErrKeyAllocationUnavailable = errors.New("local task key allocation unavailable")
)

// Status is a Local Task lifecycle state.
// LegacyTaskIDCollisionError reports a legacy ID already owned by another project.
type LegacyTaskIDCollisionError struct {
	TaskID            string
	ExistingProjectID string
	ImportProjectID   string
}

// Error describes the conflicting legacy task ownership.
func (err *LegacyTaskIDCollisionError) Error() string {
	return "legacy task " + err.TaskID + " belongs to project " + err.ExistingProjectID +
		", not import project " + err.ImportProjectID
}

type Status string

// Priority is a Local Task's personal priority.
type Priority string

// ProjectKind identifies task metadata that does not resolve through the project catalog.
type ProjectKind string

const (
	// ProjectKindFolder identifies a task created for a local folder.
	ProjectKindFolder ProjectKind = "folder"
)

// Task is Local Task metadata authoritative in the local SQLite database.
type Task struct {
	ID                 string       `json:"id"`
	TaskKey            *string      `json:"key,omitempty"`
	ProjectID          *string      `json:"projectId"`
	ProjectKind        *ProjectKind `json:"projectKind,omitempty"`
	ProjectName        *string      `json:"projectName,omitempty"`
	OrganizationID     *string      `json:"-"`
	Title              string       `json:"title"`
	Description        string       `json:"description"`
	Status             Status       `json:"status"`
	Priority           Priority     `json:"priority"`
	CreatedAt          string       `json:"createdAt"`
	UpdatedAt          string       `json:"updatedAt"`
	CompletedAt        *string      `json:"completedAt"`
	HasActiveWorkspace bool         `json:"hasActiveWorkspace"`
	Tags               []string     `json:"tags"`
	TagRefs            []TagRef     `json:"tagRefs"`
}

// Tag is one globally retained Local Task tag catalog entry.
type Tag struct {
	ID      string   `json:"id"`
	Key     string   `json:"key"`
	Name    string   `json:"name"`
	Aliases []string `json:"aliases"`
	Color   *string  `json:"color"`
}

// TagRef identifies an assigned catalog tag.
type TagRef struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
}

// TagCreate describes a new catalog entry.
type TagCreate struct{ Name string }

// TagColorUpdate is a nullable canonical hex color update for a tag catalog entry.
type TagColorUpdate struct {
	Color       *string
	DisplayName *string
}

// ContextDetails contains derived Task Context locations and existing v1 documents.
type ContextDetails struct {
	Directory string        `json:"directory"`
	Files     []ContextFile `json:"files"`
}

// ContextFile identifies one existing v1 Task Context document.
type ContextFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// ContextRoot identifies one derived Task Context directory for Memory indexing.
type ContextRoot struct {
	TaskID    string
	TaskTitle string
	ProjectID string
	Directory string
}

// WorkspaceLink relates a Local Task to a local workspace.
type WorkspaceLink struct {
	ID          string  `json:"id"`
	LocalTaskID string  `json:"localTaskId"`
	WorkspaceID string  `json:"workspaceId"`
	Status      Status  `json:"status"`
	LinkedAt    string  `json:"linkedAt"`
	UnlinkedAt  *string `json:"unlinkedAt"`
}

// TaskFilter limits Local Task list results.
type TaskFilter struct {
	ProjectID   *string
	Status      *Status
	Statuses    []Status
	Priority    *Priority
	WorkspaceID *string
	Tags        []string
	TagIDs      []string
}

// TaskUpdate contains mutable Local Task fields.
type TaskUpdate struct {
	Title       *string
	Description *string
	Status      *Status
	Priority    *Priority
	Tags        *[]string
	TagRefs     *[]TagRef
}

// SearchResult is a Local Task metadata FTS result.
type SearchResult struct {
	Task
	Rank float64 `json:"rank"`
}

// Repository persists Local Task metadata and workspace relationships.
type Repository interface {
	Create(context.Context, Task) (Task, error)
	Get(context.Context, string) (Task, error)
	List(context.Context, TaskFilter) ([]Task, error)
	Update(context.Context, string, TaskUpdate) (Task, error)
	Search(context.Context, string, TaskFilter) ([]SearchResult, error)
	ListWithoutTaskKey(context.Context) ([]Task, error)
	SetTaskKeyIfEmpty(context.Context, string, string) (bool, error)
	ListTags(context.Context) ([]Tag, error)
	CreateTag(context.Context, TagCreate) (Tag, error)
	RenameTag(context.Context, string, string) (Tag, error)
	MergeTags(context.Context, string, string) (Tag, error)
	DeleteTag(context.Context, string) error
	UpdateTagColor(context.Context, string, TagColorUpdate) (Tag, error)
	LinkWorkspace(context.Context, WorkspaceLink) (WorkspaceLink, error)
	UnlinkWorkspace(context.Context, string) error
	UpdateWorkspaceLinkStatus(context.Context, string, Status) (WorkspaceLink, error)
	ListWorkspaceLinks(context.Context, string) ([]WorkspaceLink, error)
	ListTaskLinks(context.Context, string) ([]WorkspaceLink, error)
}

// ValidateTask validates required Local Task metadata.
func ValidateTask(task Task) error {
	if strings.TrimSpace(task.ID) == "" || strings.TrimSpace(task.Title) == "" {
		return ErrInvalidTask
	}
	if !isValidStatus(task.Status) || !isValidPriority(task.Priority) {
		return ErrInvalidTask
	}
	if (task.ProjectKind == nil) != (task.ProjectName == nil) {
		return ErrInvalidTask
	}
	if task.ProjectKind != nil && (*task.ProjectKind != ProjectKindFolder || task.ProjectID == nil || task.OrganizationID != nil || strings.TrimSpace(*task.ProjectName) == "") {
		return ErrInvalidTask
	}
	if err := validateTaskTagAssociations(task.Tags, task.TagRefs); err != nil {
		return err
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
	var tags []string
	if update.Tags != nil {
		tags = *update.Tags
	}
	var refs []TagRef
	if update.TagRefs != nil {
		refs = *update.TagRefs
	}
	if err := validateTaskTagAssociations(tags, refs); err != nil {
		return err
	}
	if update.Tags != nil && update.TagRefs != nil {
		return ErrInvalidTag
	}
	return nil
}

func validateTaskTagAssociations(tags []string, refs []TagRef) error {
	if tags != nil && refs != nil {
		return ErrInvalidTag
	}
	if tags != nil {
		if _, err := NormalizeTags(tags); err != nil {
			return err
		}
	}
	if len(refs) > MaxTagsPerTask {
		return ErrInvalidTag
	}
	seen := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		if strings.TrimSpace(ref.ID) == "" || strings.TrimSpace(ref.ID) != ref.ID {
			return ErrInvalidTag
		}
		if _, ok := seen[ref.ID]; ok {
			return ErrInvalidTag
		}
		seen[ref.ID] = struct{}{}
	}
	return nil
}

// ValidateTagID validates an opaque stable Local Task tag ID.
func ValidateTagID(id string) error {
	if id == "" || strings.TrimSpace(id) != id {
		return ErrInvalidTag
	}
	return nil
}

// ValidateTagIDs validates opaque stable Local Task tag IDs.
func ValidateTagIDs(ids []string) error {
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if err := ValidateTagID(id); err != nil {
			return err
		}
		if _, exists := seen[id]; exists {
			return ErrInvalidTag
		}
		seen[id] = struct{}{}
	}
	return nil
}

// ValidateLinkStatus validates a workspace link lifecycle status.
func ValidateLinkStatus(status Status) error {
	if !isValidStatus(status) {
		return ErrInvalidLink
	}
	return nil
}

// ValidateWorkspaceLink validates a Local Task workspace association.
func ValidateWorkspaceLink(link WorkspaceLink) error {
	if strings.TrimSpace(link.ID) == "" || strings.TrimSpace(link.LocalTaskID) == "" || strings.TrimSpace(link.WorkspaceID) == "" {
		return ErrInvalidLink
	}
	if !isValidStatus(link.Status) {
		return ErrInvalidLink
	}
	return nil
}

func isValidStatus(status Status) bool {
	return status == StatusNew || status == StatusProgressing || status == StatusDone || status == StatusCancelled
}

func isValidPriority(priority Priority) bool {
	return priority == PriorityLow || priority == PriorityMedium || priority == PriorityHigh
}
