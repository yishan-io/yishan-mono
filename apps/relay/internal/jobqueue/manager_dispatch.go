package jobqueue

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"

	relayprotocol "yishan/packages/relay-protocol-go"
)

type retryRun struct {
	run      *PendingRun
	attempts int
}

func redeliveryResult(existing *PendingRun, params DispatchParams, payloadHash [sha256.Size]byte) DispatchResult {
	if !matchesDispatchIdentity(existing, params, payloadHash) {
		return DispatchResult{Reason: "conflict", ErrorDetail: "runId conflicts with an existing run"}
	}
	if existing.Status == StatusSkippedOffline {
		return DispatchResult{Reason: "node_offline", RunID: existing.RunID}
	}
	return DispatchResult{OK: true, RunID: existing.RunID}
}

func matchesDispatchIdentity(run *PendingRun, params DispatchParams, payloadHash [sha256.Size]byte) bool {
	return run.JobID == params.JobID && run.NodeID == params.NodeID &&
		run.ScheduledFor == params.ScheduledFor && run.payloadHash == payloadHash
}

func snapshotPayload(payload map[string]any) ([sha256.Size]byte, map[string]any, error) {
	canonicalPayload, err := json.Marshal(payload)
	if err != nil {
		return [sha256.Size]byte{}, nil, fmt.Errorf("marshal dispatch payload: %w", err)
	}
	var snapshot map[string]any
	if err := json.Unmarshal(canonicalPayload, &snapshot); err != nil {
		return [sha256.Size]byte{}, nil, fmt.Errorf("unmarshal canonical dispatch payload: %w", err)
	}
	return sha256.Sum256(canonicalPayload), snapshot, nil
}

func (m *Manager) attemptInitialDispatch(run *PendingRun) DispatchResult {
	return m.attemptDispatch(run, StatusDispatching)
}

func (m *Manager) attemptRetryDispatch(run *PendingRun) DispatchResult {
	return m.attemptDispatch(run, StatusRetrying)
}

func (m *Manager) attemptDispatch(run *PendingRun, expectedStatus RunStatus) DispatchResult {
	params, generation, attempts, ok := m.claimDispatchLocked(run, expectedStatus)
	if !ok {
		return DispatchResult{OK: true, RunID: run.RunID}
	}
	err := m.transport.SendNotificationWithError(run.NodeID, relayprotocol.MethodJobRun, params)
	if err != nil {
		return m.handleDispatchFailure(run, generation, err)
	}
	m.startAckTimer(run, generation)
	log.Info().Str("runId", run.RunID).Str("jobId", run.JobID).Str("nodeId", run.NodeID).
		Int("attempt", attempts).Msg("job dispatched")
	return DispatchResult{OK: true, RunID: run.RunID}
}

func (m *Manager) claimDispatchLocked(run *PendingRun, expectedStatus RunStatus) (relayprotocol.JobRunParams, uint64, int, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if run.Status != expectedStatus {
		return relayprotocol.JobRunParams{}, 0, 0, false
	}
	run.Attempts++
	run.attemptGeneration++
	now := time.Now()
	run.DispatchedAt = &now
	run.Status = StatusAwaitingAck
	m.metrics.TotalDispatched++
	m.metrics.AwaitingAck++
	return relayprotocol.JobRunParams{RunID: run.RunID, JobID: run.JobID, ScheduledFor: run.ScheduledFor,
		IdempotencyKey: run.IdempotencyKey, Payload: cloneMap(run.Payload)}, run.attemptGeneration, run.Attempts, true
}

func (m *Manager) handleDispatchFailure(run *PendingRun, generation uint64, err error) DispatchResult {
	m.mu.Lock()
	if run.Status != StatusAwaitingAck || run.attemptGeneration != generation {
		m.mu.Unlock()
		return DispatchResult{OK: true, RunID: run.RunID}
	}
	now := time.Now()
	run.Status = StatusSkippedOffline
	run.CompletedAt = &now
	m.metrics.PendingDepth--
	m.metrics.AwaitingAck--
	m.metrics.TotalSkippedOffline++
	m.mu.Unlock()
	log.Warn().Err(err).Str("runId", run.RunID).Str("nodeId", run.NodeID).Msg("dispatch failed: node unreachable")
	return DispatchResult{Reason: "node_offline", RunID: run.RunID, ErrorDetail: err.Error()}
}

func (m *Manager) startAckTimer(run *PendingRun, generation uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if run.Status != StatusAwaitingAck || run.attemptGeneration != generation {
		return
	}
	m.ackTimers[run.RunID] = time.AfterFunc(m.config.AckTimeout, func() { m.handleAckTimeout(run, generation) })
}

func (m *Manager) clearAckTimer(runID string) {
	if timer, ok := m.ackTimers[runID]; ok {
		timer.Stop()
		delete(m.ackTimers, runID)
	}
}

func (m *Manager) startResultTimer(run *PendingRun) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if run.Status != StatusAwaitingResult {
		return
	}
	m.resultTimers[run.RunID] = time.AfterFunc(m.config.ResultTimeout, func() { m.handleResultTimeout(run) })
}

func (m *Manager) clearResultTimer(runID string) {
	if timer, ok := m.resultTimers[runID]; ok {
		timer.Stop()
		delete(m.resultTimers, runID)
	}
}

func (m *Manager) handleAckTimeout(run *PendingRun, generation uint64) {
	m.mu.Lock()
	if run.Status != StatusAwaitingAck || run.attemptGeneration != generation {
		m.mu.Unlock()
		return
	}
	retryRun, shouldRetry := m.claimRetryLocked(run, "ack timeout")
	m.mu.Unlock()
	if !shouldRetry {
		return
	}
	log.Warn().Str("runId", run.RunID).Str("nodeId", run.NodeID).Int("attempts", retryRun.attempts).Msg("ack timeout")
	m.dispatchRetry(retryRun)
}

func (m *Manager) handleResultTimeout(run *PendingRun) {
	m.mu.Lock()
	if run.Status != StatusAwaitingResult {
		m.mu.Unlock()
		return
	}
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

func (m *Manager) completeResultLocked(run *PendingRun, result ResultParams) {
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
}

func (m *Manager) claimRetryLocked(run *PendingRun, reason string) (retryRun, bool) {
	if run.Status != StatusAwaitingAck && run.Status != StatusDispatching {
		return retryRun{}, false
	}
	m.clearAckTimer(run.RunID)
	if run.Status == StatusAwaitingAck {
		m.metrics.AwaitingAck--
	}
	attempts := run.Attempts
	if attempts >= m.config.MaxRetries {
		now := time.Now()
		run.Status = StatusFailed
		run.CompletedAt = &now
		run.LastError = reason + " (max retries exceeded)"
		m.metrics.PendingDepth--
		m.metrics.TotalFailed++
		log.Error().Str("runId", run.RunID).Str("nodeId", run.NodeID).Int("attempts", attempts).Msg("run failed: max retries exceeded")
		return retryRun{}, false
	}
	run.Status = StatusRetrying
	run.LastError = reason
	m.metrics.TotalRetries++
	return retryRun{run: run, attempts: attempts}, true
}

func (m *Manager) dispatchRetry(retryRun retryRun) {
	if !m.transport.IsOnline(retryRun.run.NodeID) {
		log.Info().Str("runId", retryRun.run.RunID).Str("nodeId", retryRun.run.NodeID).Msg("queued for retry on reconnect")
		return
	}
	log.Info().Str("runId", retryRun.run.RunID).Int("attempt", retryRun.attempts+1).Msg("retrying immediately")
	m.attemptRetryDispatch(retryRun.run)
}
