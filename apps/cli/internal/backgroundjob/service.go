package backgroundjob

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

const (
	failureCodeExecution      = "dsh_execution_failed"
	failureCodeRuntime        = "DSH_RUNTIME_LOST"
	interruptedMessage        = "DSH runtime became unavailable"
	cleanupTimeout            = 5 * time.Second
	queuedRecoveryWorkerLimit = 4
	schedulerQueueCapacity    = queuedRecoveryWorkerLimit
)

var (
	errServiceClosed      = errors.New("background job service is closed")
	errWorkspaceClosing   = errors.New("background job workspace is closing")
	errRunAlreadyAdmitted = errors.New("background job run is already admitted")
	errSchedulerFull      = errors.New("background job scheduler is full")
)

// WorkspaceResolver resolves active local workspaces without crossing RPC.
type WorkspaceResolver interface {
	GetWorkspace(string) (workspace.Workspace, error)
}

// Execution is the narrow, internal DSH boundary used by background jobs.
type Execution interface {
	StartSession(context.Context, dsh.SessionStartRequest) (dsh.SessionStartResult, error)
	PromptSession(context.Context, dsh.SessionPromptRequest) (dsh.SessionPromptResult, error)
	CancelSession(context.Context, dsh.SessionCancelRequest) (dsh.SessionCancelResult, error)
	FlushSession(context.Context, dsh.SessionFlushRequest) (dsh.DurableCursor, error)
	ReadSession(context.Context, dsh.SessionReadRequest) (dsh.SessionReadResult, error)
	DisposeSession(context.Context, dsh.SessionReadRequest) (dsh.SessionDisposeResult, error)
	SubscribeSession(context.Context, dsh.SessionSubscribeRequest) (dsh.SessionSubscription, error)
}

// Publisher receives advisory notifications after a durable transition.
type Publisher func(Job)

type workspaceLease struct {
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

// Service runs durable local DSH jobs. It owns no frontend/session product state.
type Service struct {
	repository         Repository
	workspaces         WorkspaceResolver
	execution          Execution
	ownerNodeID        string
	publish            Publisher
	ctx                context.Context
	cancel             context.CancelFunc
	mu                 sync.Mutex
	isClosed           bool
	closing            map[string]bool
	leases             map[string]map[string]*workspaceLease
	scheduled          map[string]bool
	pendingTerminals   map[string]pendingTerminal
	waitGroup          sync.WaitGroup
	schedulerOnce      sync.Once
	schedulerJobs      chan string
	schedulerWaitGroup sync.WaitGroup
	cleanupTimeout     time.Duration
}

type pendingTerminal struct {
	job     Job
	status  Status
	outcome Outcome
}

// NewService constructs the daemon-owned job runner.
func NewService(repository Repository, workspaces WorkspaceResolver, execution Execution, ownerNodeID string, publish Publisher) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	return &Service{repository: repository, workspaces: workspaces, execution: execution, ownerNodeID: ownerNodeID, publish: publish, ctx: ctx, cancel: cancel, closing: make(map[string]bool), leases: make(map[string]map[string]*workspaceLease), scheduled: make(map[string]bool), pendingTerminals: make(map[string]pendingTerminal), schedulerJobs: make(chan string, schedulerQueueCapacity), cleanupTimeout: cleanupTimeout}
}

// Run claims and executes one queued local job. It holds a workspace lease before it can claim the job.
func (s *Service) Run(ctx context.Context, jobID string) {
	if !s.enter() {
		return
	}
	defer s.waitGroup.Done()
	if s.execution == nil {
		return
	}
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	job, err := s.repository.Get(operationCtx, jobID)
	if err != nil || !s.isLocalJob(job) {
		return
	}
	lease, err := s.acquire(job)
	if err != nil {
		if !errors.Is(err, errServiceClosed) && !errors.Is(err, errWorkspaceClosing) && !errors.Is(err, errRunAlreadyAdmitted) {
			s.failQueued(operationCtx, job, failureCodeExecution, err.Error())
		}
		return
	}
	defer s.release(job.WorkspaceID, job.ID, lease)
	if !s.isActiveWorkspace(job) {
		s.failQueued(operationCtx, job, failureCodeExecution, "workspace is not active on this node")
		return
	}
	claimed, ok, err := s.repository.CompareAndSwapStatus(operationCtx, job.ID, StatusQueued, StatusRunning, Outcome{})
	if err != nil || !ok {
		return
	}
	s.notify(claimed)
	stop := context.AfterFunc(operationCtx, lease.cancel)
	defer func() { stop(); lease.cancel() }()
	s.execute(lease.ctx, claimed)
}

func (s *Service) enter() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosed {
		return false
	}
	s.waitGroup.Add(1)
	return true
}

func (s *Service) operationContext(caller context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(s.ctx)
	stop := context.AfterFunc(caller, cancel)
	return ctx, func() { stop(); cancel() }
}

func (s *Service) acquire(job Job) (*workspaceLease, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosed {
		return nil, errServiceClosed
	}
	if s.closing[job.WorkspaceID] {
		return nil, errWorkspaceClosing
	}
	workspaceLeases := s.leases[job.WorkspaceID]
	if workspaceLeases != nil && workspaceLeases[job.ID] != nil {
		return nil, errRunAlreadyAdmitted
	}
	runCtx, cancel := context.WithCancel(s.ctx)
	lease := &workspaceLease{ctx: runCtx, cancel: cancel, done: make(chan struct{})}
	if workspaceLeases == nil {
		workspaceLeases = make(map[string]*workspaceLease)
		s.leases[job.WorkspaceID] = workspaceLeases
	}
	workspaceLeases[job.ID] = lease
	return lease, nil
}
func (s *Service) release(workspaceID, jobID string, lease *workspaceLease) {
	s.mu.Lock()
	delete(s.leases[workspaceID], jobID)
	if len(s.leases[workspaceID]) == 0 {
		delete(s.leases, workspaceID)
	}
	close(lease.done)
	s.mu.Unlock()
}

func (s *Service) completeFinal(job Job, status Status, outcome Outcome) {
	ctx, cancel := context.WithTimeout(context.Background(), s.cleanupTimeout)
	defer cancel()
	s.complete(ctx, job, status, outcome)
}

func (s *Service) complete(ctx context.Context, job Job, status Status, outcome Outcome) {
	if _, _, err := s.transition(ctx, job.ID, StatusRunning, status, outcome); err != nil {
		s.retainTerminal(job, status, outcome)
		log.Error().Err(err).Str("jobId", job.ID).Msg("persist background job terminal state")
	}
}

func (s *Service) retainTerminal(job Job, status Status, outcome Outcome) {
	s.mu.Lock()
	s.pendingTerminals[job.ID] = pendingTerminal{job: job, status: status, outcome: outcome}
	s.mu.Unlock()
}

func (s *Service) persistPendingTerminals(ctx context.Context) error {
	for _, terminal := range s.pendingTerminalSnapshot() {
		_, _, err := s.transition(ctx, terminal.job.ID, StatusRunning, terminal.status, terminal.outcome)
		if err != nil {
			return fmt.Errorf("persist background job terminal state: %w", err)
		}
		s.mu.Lock()
		delete(s.pendingTerminals, terminal.job.ID)
		s.mu.Unlock()
	}
	return nil
}

func (s *Service) pendingTerminalSnapshot() []pendingTerminal {
	s.mu.Lock()
	defer s.mu.Unlock()
	terminals := make([]pendingTerminal, 0, len(s.pendingTerminals))
	for _, terminal := range s.pendingTerminals {
		terminals = append(terminals, terminal)
	}
	return terminals
}
func failureOutcome(err error) Outcome {
	return Outcome{ErrorCode: failureCodeExecution, ErrorMessage: truncateError(err)}
}
func truncateError(err error) string {
	message := err.Error()
	if len(message) > MaxErrorMessageBytes {
		return message[:MaxErrorMessageBytes]
	}
	return message
}
func (s *Service) failQueued(ctx context.Context, job Job, code, message string) {
	if _, _, err := s.transition(ctx, job.ID, StatusQueued, StatusFailed, Outcome{ErrorCode: code, ErrorMessage: message}); err != nil {
		log.Error().Err(err).Str("jobId", job.ID).Msg("persist queued background job failure")
	}
}
func (s *Service) transition(ctx context.Context, id string, from, to Status, outcome Outcome) (Job, bool, error) {
	job, ok, err := s.repository.CompareAndSwapStatus(ctx, id, from, to, outcome)
	if ok {
		s.notify(job)
	}
	return job, ok, err
}
func (s *Service) notify(job Job) {
	if s.publish != nil {
		s.publish(job)
	}
}
func (s *Service) isLocalJob(job Job) bool {
	return job.OwnerNodeID == s.ownerNodeID && job.Runtime == RuntimeDSH && job.SessionID == "job-"+job.ID
}
func (s *Service) isActiveWorkspace(job Job) bool {
	ws, err := s.workspaces.GetWorkspace(job.WorkspaceID)
	return err == nil &&
		ws.ID == job.WorkspaceID &&
		ws.Path == job.CWD &&
		ws.ProjectID == job.ProjectID &&
		ws.OrgID == job.OrganizationID &&
		ws.State == workspace.StateActive &&
		ws.Health == workspace.HealthOK
}
func startRequest(job Job) dsh.SessionStartRequest {
	return dsh.SessionStartRequest{
		SessionID: job.SessionID,
		CWD:       job.CWD,
		Binding: dsh.SessionBinding{
			Version:        1,
			WorkspaceID:    job.WorkspaceID,
			ProjectID:      job.ProjectID,
			OrganizationID: job.OrganizationID,
			OwnerNodeID:    job.OwnerNodeID,
			CWD:            job.CWD,
			Policy:         dsh.WorkspaceBindingPolicy{Authorization: "daemon-authorized"},
		},
	}
}
func subscribeRequest(job Job) dsh.SessionSubscribeRequest {
	return dsh.SessionSubscribeRequest{SessionID: job.SessionID, CWD: job.CWD, AfterSeq: -1}
}
func promptRequest(job Job) dsh.SessionPromptRequest {
	return dsh.SessionPromptRequest{SessionID: job.SessionID, CWD: job.CWD, ContentBlocks: []dsh.TextPromptContentBlock{{Type: "text", Text: job.Prompt}}}
}
func executionRequest(job Job) dsh.SessionExecutionRequest {
	return dsh.SessionExecutionRequest{SessionID: job.SessionID, CWD: job.CWD}
}
func readRequest(job Job) dsh.SessionReadRequest {
	return dsh.SessionReadRequest{SessionID: job.SessionID, CWD: job.CWD}
}
func collectTranscript(events []json.RawMessage) string {
	var text string
	for _, event := range events {
		text = appendResult(text, textFromJSON(event))
	}
	return text
}
func appendResult(current, next string) string {
	if next == "" || len(current) >= MaxResultTextBytes {
		return current
	}
	if current != "" {
		current += "\n"
	}
	remaining := MaxResultTextBytes - len(current)
	if len(next) > remaining {
		next = next[:remaining]
	}
	return current + next
}
func textFromJSON(raw json.RawMessage) string {
	var payload any
	if json.Unmarshal(raw, &payload) != nil {
		return ""
	}
	return findText(payload)
}
func findText(payload any) string {
	switch value := payload.(type) {
	case map[string]any:
		if text, ok := value["text"].(string); ok {
			return strings.TrimSpace(text)
		}
		for _, child := range value {
			if text := findText(child); text != "" {
				return text
			}
		}
	case []any:
		for _, child := range value {
			if text := findText(child); text != "" {
				return text
			}
		}
	}
	return ""
}
