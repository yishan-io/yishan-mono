package scheduledjob

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	agentkind "yishan/apps/cli/internal/agent/kind"
)

// Job statuses. Deleted jobs are removed rather than kept as a status.
const (
	StatusActive   = "active"
	StatusPaused   = "paused"
	StatusDisabled = "disabled"
)

// Run statuses and triggers.
const (
	RunPending        = "pending"
	RunRunning        = "running"
	RunSucceeded      = "succeeded"
	RunFailed         = "failed"
	RunSkippedOffline = "skipped_offline"
	TriggerManual     = "manual"
	TriggerSchedule   = "schedule"
)

// DefaultAgentKind is the agent used when a job names none.
const DefaultAgentKind = agentkind.Pi

// TimeLayout is the stored and wire timestamp format (UTC, milliseconds),
// chosen so stored values sort lexically in time order.
const TimeLayout = "2006-01-02T15:04:05.000Z"

// Field limits, matching api-service validation.
const (
	maxNameLength     = 120
	maxPromptLength   = 4096
	maxModelLength    = 120
	maxCommandLength  = 2048
	maxCronLength     = 120
	maxTimezoneLength = 120
)

var (
	// ErrJobNotFound reports a missing job.
	ErrJobNotFound = errors.New("scheduled job not found")
	// ErrClaimRejected reports an occurrence that is no longer due or was
	// already claimed.
	ErrClaimRejected = errors.New("scheduled job occurrence is no longer claimable")
)

// Job is one scheduled agent run definition. JSON names match the wire shape
// the desktop already consumes.
type Job struct {
	ID               string  `json:"id"`
	OrganizationID   string  `json:"organizationId"`
	ProjectID        string  `json:"projectId"`
	NodeID           string  `json:"nodeId"`
	Name             string  `json:"name"`
	AgentKind        string  `json:"agentKind"`
	Prompt           string  `json:"prompt"`
	Model            *string `json:"model"`
	Command          *string `json:"command"`
	CronExpression   string  `json:"cronExpression"`
	Timezone         string  `json:"timezone"`
	Status           string  `json:"status"`
	NextRunAt        string  `json:"nextRunAt"`
	LastScheduledFor *string `json:"lastScheduledFor"`
	LastRunAt        *string `json:"lastRunAt"`
	LastRunStatus    *string `json:"lastRunStatus"`
	LastErrorCode    *string `json:"lastErrorCode"`
	LastErrorMessage *string `json:"lastErrorMessage"`
	CreatedByUserID  string  `json:"createdByUserId"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

// Run is one execution of a job.
type Run struct {
	ID             string  `json:"id"`
	JobID          string  `json:"jobId"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      string  `json:"projectId"`
	NodeID         string  `json:"nodeId"`
	ScheduledFor   string  `json:"scheduledFor"`
	Trigger        string  `json:"trigger"`
	StartedAt      *string `json:"startedAt"`
	FinishedAt     *string `json:"finishedAt"`
	Status         string  `json:"status"`
	ResponseBody   *string `json:"responseBody"`
	ErrorCode      *string `json:"errorCode"`
	ErrorMessage   *string `json:"errorMessage"`
	ErrorDetails   *string `json:"-"`
	CreatedAt      string  `json:"createdAt"`
}

// Result is the terminal outcome of a run.
type Result struct {
	Status       string
	ResponseBody string
	ErrorCode    string
	ErrorMessage string
}

// FormatTime renders t in TimeLayout.
func FormatTime(t time.Time) string {
	return t.UTC().Format(TimeLayout)
}

// ParseTime parses a stored timestamp.
func ParseTime(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

// Definition holds the user-editable fields of a job.
type Definition struct {
	Name           string
	AgentKind      string
	Prompt         string
	Model          *string
	Command        *string
	CronExpression string
	Timezone       string
}

// Normalize trims the definition, applies defaults and validates it.
func (definition Definition) Normalize() (Definition, error) {
	definition.Name = strings.TrimSpace(definition.Name)
	definition.Prompt = strings.TrimSpace(definition.Prompt)
	definition.CronExpression = strings.TrimSpace(definition.CronExpression)
	definition.Timezone = strings.TrimSpace(definition.Timezone)
	definition.AgentKind = strings.TrimSpace(definition.AgentKind)
	definition.Model, definition.Command = trimOptional(definition.Model), trimOptional(definition.Command)
	if definition.Timezone == "" {
		definition.Timezone = "UTC"
	}
	if definition.AgentKind == "" {
		definition.AgentKind = DefaultAgentKind
	}
	return definition, definition.validate()
}

func (definition Definition) validate() error {
	for _, field := range []struct {
		label string
		value string
		max   int
	}{
		{"name", definition.Name, maxNameLength}, {"prompt", definition.Prompt, maxPromptLength},
		{"cronExpression", definition.CronExpression, maxCronLength}, {"timezone", definition.Timezone, maxTimezoneLength},
	} {
		if field.value == "" || len([]rune(field.value)) > field.max {
			return fmt.Errorf("%s must be 1-%d characters", field.label, field.max)
		}
	}
	if err := validateOptional("model", definition.Model, maxModelLength); err != nil {
		return err
	}
	if err := validateOptional("command", definition.Command, maxCommandLength); err != nil {
		return err
	}
	if !slices.Contains(agentkind.All, definition.AgentKind) {
		return fmt.Errorf("unsupported agent kind %q", definition.AgentKind)
	}
	_, err := NextRunAt(definition.CronExpression, definition.Timezone, time.Now())
	return err
}

func validateOptional(label string, value *string, maxLength int) error {
	if value != nil && len([]rune(*value)) > maxLength {
		return fmt.Errorf("%s must be at most %d characters", label, maxLength)
	}
	return nil
}

func trimOptional(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
