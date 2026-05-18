// Package jobqueue implements scheduled-job dispatch over relay connections.
//
// The manager tracks pending runs through a dispatch -> ack -> result lifecycle,
// enforces idempotency via (jobId, scheduledFor) minute-bucketed keys, and handles
// retries on timeout or node disconnect.
package jobqueue

import (
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// NodeTransport is the interface the job queue uses to communicate with nodes.
// This decouples the jobqueue package from the relay session implementation.
type NodeTransport interface {
	IsOnline(nodeID string) bool
	SendNotification(nodeID, method string, params any) bool
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Config holds job queue timeout and retry parameters.
type Config struct {
	AckTimeout    time.Duration
	ResultTimeout time.Duration
	MaxRetries    int
}

// RunStatus represents the lifecycle state of a dispatched run.
type RunStatus string

const (
	StatusDispatching    RunStatus = "dispatching"
	StatusAwaitingAck    RunStatus = "awaiting_ack"
	StatusAwaitingResult RunStatus = "awaiting_result"
	StatusCompleted      RunStatus = "completed"
	StatusFailed         RunStatus = "failed"
	StatusRejected       RunStatus = "rejected"
	StatusSkippedOffline RunStatus = "skipped_offline"
	StatusRetrying       RunStatus = "retrying"
)

// jobRunMethod is the JSON-RPC method name for job dispatch notifications.
const jobRunMethod = "job.run"

// PendingRun represents a single dispatched job run.
type PendingRun struct {
	RunID          string         `json:"runId"`
	JobID          string         `json:"jobId"`
	NodeID         string         `json:"nodeId"`
	ScheduledFor   string         `json:"scheduledFor"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Payload        map[string]any `json:"payload"`
	Status         RunStatus      `json:"status"`
	DispatchedAt   *time.Time     `json:"dispatchedAt,omitempty"`
	AckedAt        *time.Time     `json:"ackedAt,omitempty"`
	CompletedAt    *time.Time     `json:"completedAt,omitempty"`
	Attempts       int            `json:"attempts"`
	LastError      string         `json:"lastError,omitempty"`
	Result         *ResultParams  `json:"result,omitempty"`
}

// DispatchParams are the inputs for dispatching a job run.
type DispatchParams struct {
	RunID        string
	JobID        string
	NodeID       string
	ScheduledFor string
	Payload      map[string]any
}

// DispatchResult is the outcome of a dispatch attempt.
type DispatchResult struct {
	OK            bool
	RunID         string
	Reason        string // "duplicate", "node_offline", "dispatch_failed"
	ExistingRunID string // set when Reason == "duplicate"
	ErrorDetail   string
}

// AckParams holds the fields from a job.ack message.
type AckParams struct {
	RunID  string
	Status string // "accepted" | "rejected"
	Reason string
}

// ResultParams holds the fields from a job.result message.
type ResultParams struct {
	RunID      string         `json:"runId"`
	Status     string         `json:"status"` // "completed" | "failed" | "cancelled"
	Output     map[string]any `json:"output,omitempty"`
	Error      *ResultError   `json:"error,omitempty"`
	DurationMs int64          `json:"durationMs,omitempty"`
}

// ResultError is the error payload within a job.result.
type ResultError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// Metrics exposes observable queue state.
type Metrics struct {
	PendingDepth        int `json:"pendingDepth"`
	AwaitingAck         int `json:"awaitingAck"`
	AwaitingResult      int `json:"awaitingResult"`
	TotalDispatched     int `json:"totalDispatched"`
	TotalCompleted      int `json:"totalCompleted"`
	TotalFailed         int `json:"totalFailed"`
	TotalRetries        int `json:"totalRetries"`
	TotalSkippedOffline int `json:"totalSkippedOffline"`
}

// jobRunParams is the structured params sent in job.run notifications.
// Using a typed struct avoids a heap map[string]any allocation per dispatch.
type jobRunParams struct {
	RunID          string         `json:"runId"`
	JobID          string         `json:"jobId"`
	ScheduledFor   string         `json:"scheduledFor"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Payload        map[string]any `json:"payload"`
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

// Manager tracks and dispatches scheduled job runs over the relay.
type Manager struct {
	transport NodeTransport
	config    Config

	// mu protects all mutable fields. Read-only methods (GetRun, GetMetrics,
	// GetRunsForNode, IsOnline) use RLock so concurrent reads don't serialise.
	mu               sync.RWMutex
	runs             map[string]*PendingRun // keyed by runId
	idempotencyIndex map[string]string      // idempotencyKey -> runId
	// runsByNode is a secondary index for O(1) node → run lookups.
	// Updated on dispatch and completion to avoid O(n) scans.
	runsByNode   map[string]map[string]struct{} // nodeId -> set of runIds
	ackTimers    map[string]*time.Timer
	resultTimers map[string]*time.Timer
	metrics      Metrics
}

// NewManager creates a new job queue manager.
func NewManager(transport NodeTransport, config Config) *Manager {
	return &Manager{
		transport:        transport,
		config:           config,
		runs:             make(map[string]*PendingRun),
		idempotencyIndex: make(map[string]string),
		runsByNode:       make(map[string]map[string]struct{}),
		ackTimers:        make(map[string]*time.Timer),
		resultTimers:     make(map[string]*time.Timer),
	}
}

// PruneLoop starts a background goroutine that periodically prunes completed and
// failed runs older than maxAge. This prevents unbounded memory growth.
func (m *Manager) PruneLoop(maxAge time.Duration) {
	const pruneInterval = 10 * time.Minute
	ticker := time.NewTicker(pruneInterval)
	defer ticker.Stop()
	for range ticker.C {
		n := m.PruneCompleted(maxAge)
		if n > 0 {
			log.Debug().Int("pruned", n).Msg("pruned old job queue runs")
		}
	}
}

// Dispatch enqueues and sends a job.run to the target node.
func (m *Manager) Dispatch(params DispatchParams) DispatchResult {
	idempotencyKey := buildIdempotencyKey(params.JobID, params.ScheduledFor)

	m.mu.Lock()

	// Idempotency check.
	if existingRunID, ok := m.idempotencyIndex[idempotencyKey]; ok {
		m.mu.Unlock()
		log.Info().
			Str("jobId", params.JobID).
			Str("idempotencyKey", idempotencyKey).
			Str("existingRunId", existingRunID).
			Msg("duplicate dispatch blocked")
		return DispatchResult{Reason: "duplicate", ExistingRunID: existingRunID}
	}

	run := &PendingRun{
		RunID:          params.RunID,
		JobID:          params.JobID,
		NodeID:         params.NodeID,
		ScheduledFor:   params.ScheduledFor,
		IdempotencyKey: idempotencyKey,
		Payload:        params.Payload,
		Status:         StatusDispatching,
	}

	m.runs[params.RunID] = run
	m.idempotencyIndex[idempotencyKey] = params.RunID
	m.addToNodeIndex(params.NodeID, params.RunID)
	m.metrics.PendingDepth++

	// Check node online before releasing lock.
	online := m.transport.IsOnline(params.NodeID)
	m.mu.Unlock()

	if !online {
		m.mu.Lock()
		now := time.Now()
		run.Status = StatusSkippedOffline
		run.CompletedAt = &now
		m.metrics.PendingDepth--
		m.metrics.TotalSkippedOffline++
		m.mu.Unlock()
		log.Warn().
			Str("runId", params.RunID).
			Str("nodeId", params.NodeID).
			Msg("node offline, run skipped")
		return DispatchResult{Reason: "node_offline", RunID: params.RunID}
	}

	return m.attemptDispatch(run)
}

// HandleAck processes a job.ack from a node.
func (m *Manager) HandleAck(nodeID string, ack AckParams) {
	m.mu.Lock()
	run, ok := m.runs[ack.RunID]
	if !ok {
		m.mu.Unlock()
		log.Warn().Str("runId", ack.RunID).Str("nodeId", nodeID).Msg("ack for unknown run")
		return
	}
	if run.NodeID != nodeID {
		m.mu.Unlock()
		log.Warn().Str("runId", ack.RunID).Str("expected", run.NodeID).Str("got", nodeID).Msg("ack from wrong node")
		return
	}

	// Guard against double-decrement: the timer callback may have already
	// fired if t.Stop() returned false. Only process ack if still awaiting.
	if run.Status != StatusAwaitingAck {
		m.mu.Unlock()
		log.Debug().Str("runId", ack.RunID).Str("status", string(run.Status)).Msg("ack arrived after status already advanced; ignoring")
		return
	}

	m.clearAckTimer(ack.RunID)

	if ack.Status == "rejected" {
		now := time.Now()
		run.Status = StatusRejected
		run.CompletedAt = &now
		run.LastError = ack.Reason
		if run.LastError == "" {
			run.LastError = "rejected by node"
		}
		m.metrics.PendingDepth--
		m.metrics.AwaitingAck--
		m.metrics.TotalFailed++
		m.mu.Unlock()
		log.Info().Str("runId", ack.RunID).Str("nodeId", nodeID).Str("reason", ack.Reason).Msg("run rejected")
		return
	}

	// Accepted.
	now := time.Now()
	run.Status = StatusAwaitingResult
	run.AckedAt = &now
	m.metrics.AwaitingAck--
	m.metrics.AwaitingResult++
	m.mu.Unlock()

	m.startResultTimer(run)
	log.Info().Str("runId", ack.RunID).Str("nodeId", nodeID).Msg("run accepted")
}

// HandleResult processes a job.result from a node.
func (m *Manager) HandleResult(nodeID string, result ResultParams) {
	m.mu.Lock()
	run, ok := m.runs[result.RunID]
	if !ok {
		m.mu.Unlock()
		log.Warn().Str("runId", result.RunID).Str("nodeId", nodeID).Msg("result for unknown run")
		return
	}
	if run.NodeID != nodeID {
		m.mu.Unlock()
		log.Warn().Str("runId", result.RunID).Str("expected", run.NodeID).Str("got", nodeID).Msg("result from wrong node")
		return
	}

	m.clearResultTimer(result.RunID)

	now := time.Now()
	run.Result = &result
	run.CompletedAt = &now

	if result.Status == "completed" {
		run.Status = StatusCompleted
		m.metrics.TotalCompleted++
	} else {
		run.Status = StatusFailed
		if result.Error != nil {
			run.LastError = result.Error.Message
		} else {
			run.LastError = "job " + result.Status
		}
		m.metrics.TotalFailed++
	}

	m.metrics.PendingDepth--
	m.metrics.AwaitingResult--
	m.mu.Unlock()

	log.Info().
		Str("runId", result.RunID).
		Str("nodeId", nodeID).
		Str("status", result.Status).
		Int64("durationMs", result.DurationMs).
		Msg("run completed")
}

// HandleNodeDisconnect handles all in-flight runs for a disconnected node.
func (m *Manager) HandleNodeDisconnect(nodeID string) {
	m.mu.Lock()
	// Use the secondary index for O(1) lookup instead of iterating all runs.
	runIDs := m.nodeRunIDs(nodeID)
	var retryRuns []*PendingRun
	for runID := range runIDs {
		run, ok := m.runs[runID]
		if !ok {
			continue
		}
		switch run.Status {
		case StatusAwaitingAck, StatusDispatching:
			m.clearAckTimer(run.RunID)
			retryRuns = append(retryRuns, run)
		case StatusAwaitingResult:
			m.clearResultTimer(run.RunID)
			now := time.Now()
			run.Status = StatusFailed
			run.CompletedAt = &now
			run.LastError = "node disconnected during execution"
			m.metrics.PendingDepth--
			m.metrics.AwaitingResult--
			m.metrics.TotalFailed++
			log.Warn().Str("runId", run.RunID).Str("nodeId", nodeID).Msg("run failed: node disconnected during execution")
		}
	}
	m.mu.Unlock()

	// Schedule retries outside lock.
	for _, run := range retryRuns {
		m.scheduleRetry(run, "node disconnected before ack")
	}
}

// HandleNodeReconnect retries any runs queued for retry on the reconnected node.
func (m *Manager) HandleNodeReconnect(nodeID string) {
	m.mu.Lock()
	runIDs := m.nodeRunIDs(nodeID)
	var retryRuns []*PendingRun
	for runID := range runIDs {
		run, ok := m.runs[runID]
		if ok && run.Status == StatusRetrying {
			retryRuns = append(retryRuns, run)
		}
	}
	m.mu.Unlock()

	for _, run := range retryRuns {
		log.Info().Str("runId", run.RunID).Str("nodeId", nodeID).Msg("retrying run on reconnect")
		m.attemptDispatch(run)
	}
}

// GetRun returns the current state of a run, or nil if not found.
func (m *Manager) GetRun(runID string) *PendingRun {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.runs[runID]
}

// GetRunsForNode returns all runs targeting a specific node.
func (m *Manager) GetRunsForNode(nodeID string) []*PendingRun {
	m.mu.RLock()
	defer m.mu.RUnlock()
	runIDs := m.nodeRunIDs(nodeID)
	result := make([]*PendingRun, 0, len(runIDs))
	for runID := range runIDs {
		if run, ok := m.runs[runID]; ok {
			result = append(result, run)
		}
	}
	return result
}

// GetMetrics returns a snapshot of queue metrics.
func (m *Manager) GetMetrics() Metrics {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.metrics
}

// PruneCompleted removes completed/failed runs older than maxAge.
func (m *Manager) PruneCompleted(maxAge time.Duration) int {
	cutoff := time.Now().Add(-maxAge)
	m.mu.Lock()
	defer m.mu.Unlock()

	pruned := 0
	for runID, run := range m.runs {
		if run.CompletedAt != nil && run.CompletedAt.Before(cutoff) {
			delete(m.runs, runID)
			delete(m.idempotencyIndex, run.IdempotencyKey)
			m.removeFromNodeIndex(run.NodeID, runID)
			pruned++
		}
	}
	return pruned
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// addToNodeIndex adds a runID to the secondary index for the given node.
// Must be called with m.mu held (write).
func (m *Manager) addToNodeIndex(nodeID, runID string) {
	if m.runsByNode[nodeID] == nil {
		m.runsByNode[nodeID] = make(map[string]struct{})
	}
	m.runsByNode[nodeID][runID] = struct{}{}
}

// removeFromNodeIndex removes a runID from the secondary index.
// Must be called with m.mu held (write).
func (m *Manager) removeFromNodeIndex(nodeID, runID string) {
	if set := m.runsByNode[nodeID]; set != nil {
		delete(set, runID)
		if len(set) == 0 {
			delete(m.runsByNode, nodeID)
		}
	}
}

// nodeRunIDs returns the set of runIDs for a node from the secondary index.
// Must be called with m.mu held (any lock level).
func (m *Manager) nodeRunIDs(nodeID string) map[string]struct{} {
	if set := m.runsByNode[nodeID]; set != nil {
		return set
	}
	return map[string]struct{}{}
}

func (m *Manager) attemptDispatch(run *PendingRun) DispatchResult {
	m.mu.Lock()
	run.Attempts++
	now := time.Now()
	run.DispatchedAt = &now
	run.Status = StatusAwaitingAck
	m.metrics.TotalDispatched++
	m.metrics.AwaitingAck++
	m.mu.Unlock()

	// Use a typed struct to avoid a heap map[string]any allocation per dispatch.
	sent := m.transport.SendNotification(run.NodeID, jobRunMethod, jobRunParams{
		RunID:          run.RunID,
		JobID:          run.JobID,
		ScheduledFor:   run.ScheduledFor,
		IdempotencyKey: run.IdempotencyKey,
		Payload:        run.Payload,
	})

	if !sent {
		m.mu.Lock()
		now := time.Now()
		run.Status = StatusSkippedOffline
		run.CompletedAt = &now
		m.metrics.PendingDepth--
		m.metrics.AwaitingAck--
		m.metrics.TotalSkippedOffline++
		m.mu.Unlock()
		log.Warn().Str("runId", run.RunID).Str("nodeId", run.NodeID).Msg("dispatch failed: node unreachable")
		return DispatchResult{Reason: "dispatch_failed", ErrorDetail: "node unreachable"}
	}

	m.startAckTimer(run)

	log.Info().
		Str("runId", run.RunID).
		Str("jobId", run.JobID).
		Str("nodeId", run.NodeID).
		Int("attempt", run.Attempts).
		Msg("job dispatched")

	return DispatchResult{OK: true, RunID: run.RunID}
}

func (m *Manager) startAckTimer(run *PendingRun) {
	m.mu.Lock()
	defer m.mu.Unlock()
	timer := time.AfterFunc(m.config.AckTimeout, func() {
		m.handleAckTimeout(run)
	})
	m.ackTimers[run.RunID] = timer
}

func (m *Manager) clearAckTimer(runID string) {
	if t, ok := m.ackTimers[runID]; ok {
		t.Stop()
		delete(m.ackTimers, runID)
	}
}

func (m *Manager) startResultTimer(run *PendingRun) {
	m.mu.Lock()
	defer m.mu.Unlock()
	timer := time.AfterFunc(m.config.ResultTimeout, func() {
		m.handleResultTimeout(run)
	})
	m.resultTimers[run.RunID] = timer
}

func (m *Manager) clearResultTimer(runID string) {
	if t, ok := m.resultTimers[runID]; ok {
		t.Stop()
		delete(m.resultTimers, runID)
	}
}

func (m *Manager) handleAckTimeout(run *PendingRun) {
	m.mu.Lock()
	// Guard against double-decrement: check that the run is still in the
	// awaiting-ack state. If HandleAck already ran concurrently (e.g. t.Stop()
	// returned false but the callback was already dispatched), the status will
	// have advanced and we must not decrement AwaitingAck again.
	if run.Status != StatusAwaitingAck {
		m.mu.Unlock()
		return
	}
	delete(m.ackTimers, run.RunID)
	m.metrics.AwaitingAck--
	// Capture the values needed for logging before releasing the lock.
	runID := run.RunID
	nodeID := run.NodeID
	attempts := run.Attempts
	m.mu.Unlock()

	log.Warn().Str("runId", runID).Str("nodeId", nodeID).Int("attempts", attempts).Msg("ack timeout")
	m.scheduleRetry(run, "ack timeout")
}

func (m *Manager) handleResultTimeout(run *PendingRun) {
	m.mu.Lock()
	delete(m.resultTimers, run.RunID)
	now := time.Now()
	run.Status = StatusFailed
	run.CompletedAt = &now
	run.LastError = "result timeout"
	m.metrics.AwaitingResult--
	m.metrics.PendingDepth--
	m.metrics.TotalFailed++
	m.mu.Unlock()

	log.Warn().Str("runId", run.RunID).Str("nodeId", run.NodeID).Msg("result timeout")
}

func (m *Manager) scheduleRetry(run *PendingRun, reason string) {
	m.mu.Lock()
	if run.Attempts >= m.config.MaxRetries {
		now := time.Now()
		run.Status = StatusFailed
		run.CompletedAt = &now
		run.LastError = reason + " (max retries exceeded)"
		m.metrics.PendingDepth--
		m.metrics.TotalFailed++
		// AwaitingAck was already decremented by handleAckTimeout before
		// scheduleRetry is called, so do not decrement it here.
		m.mu.Unlock()
		log.Error().Str("runId", run.RunID).Str("nodeId", run.NodeID).Int("attempts", run.Attempts).Msg("run failed: max retries exceeded")
		return
	}

	run.Status = StatusRetrying
	run.LastError = reason
	m.metrics.TotalRetries++
	online := m.transport.IsOnline(run.NodeID)
	m.mu.Unlock()

	if online {
		log.Info().Str("runId", run.RunID).Int("attempt", run.Attempts+1).Msg("retrying immediately")
		m.attemptDispatch(run)
	} else {
		log.Info().Str("runId", run.RunID).Str("nodeId", run.NodeID).Msg("queued for retry on reconnect")
	}
}

// buildIdempotencyKey creates a minute-bucketed key from jobId and scheduledFor.
func buildIdempotencyKey(jobID, scheduledFor string) string {
	t, err := time.Parse(time.RFC3339, scheduledFor)
	if err != nil {
		// Fall back to raw string if not parseable.
		return jobID + ":" + scheduledFor
	}
	return jobID + ":" + t.UTC().Format(minuteBucketFormat)
}

// minuteBucketFormat is the time format used in idempotency keys.
const minuteBucketFormat = "2006-01-02T15:04"
