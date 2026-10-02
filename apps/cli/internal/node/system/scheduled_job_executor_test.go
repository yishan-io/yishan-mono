package system

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestScheduledJobExecutor_StopsBeforeAgentWhenDurabilityOrStartFails(t *testing.T) {
	missingPath := filepath.Join(t.TempDir(), "missing")
	testCases := []executorStopCase{
		{name: "save claim error", store: executorStore{saveClaimErr: errors.New("disk unavailable")}, wantCalls: []string{"save-claim"}},
		{name: "duplicate claim", store: executorStore{saveClaimSet: true}, wantCalls: []string{"save-claim"}},
		{name: "start error", startErr: errors.New("api unavailable"), wantCalls: []string{"save-claim", "start"}},
		{name: "mark started error", store: executorStore{markStartedErr: errors.New("disk unavailable")}, wantCalls: []string{"save-claim", "start", "mark-started"}},
		{name: "missing path", isMissingPath: true, wantFailureCode: scheduledJobExecutorPathMissingCode, wantCalls: executorCompletedCalls},
		{name: "absent path", projectPath: missingPath, wantFailureCode: scheduledJobExecutorPathAbsentCode, wantCalls: executorCompletedCalls},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) { assertExecutorStopsBeforeAgent(t, testCase) })
	}
}

type executorStopCase struct {
	name            string
	store           executorStore
	startErr        error
	projectPath     string
	isMissingPath   bool
	wantFailureCode string
	wantCalls       []string
}

func assertExecutorStopsBeforeAgent(t *testing.T, testCase executorStopCase) {
	t.Helper()
	store := testCase.store
	agentCalls := 0
	executor := newScheduledJobExecutor(t, &store, testCase.startErr, func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error) {
		agentCalls++
		return ScheduledRunOutboxResult{Status: "succeeded"}, nil
	})
	claim := executorTestClaim(t.TempDir())
	if testCase.isMissingPath || testCase.projectPath != "" {
		claim.ProjectPath = testCase.projectPath
	}
	err := executor.Execute(context.Background(), claim)
	if testCase.startErr != nil && !errors.Is(err, testCase.startErr) {
		t.Fatalf("Execute error = %v, want %v", err, testCase.startErr)
	}
	if agentCalls != 0 {
		t.Fatalf("agent calls = %d, want 0", agentCalls)
	}
	if !sameStrings(store.calls, testCase.wantCalls) {
		t.Fatalf("calls = %v, want %v", store.calls, testCase.wantCalls)
	}
	if testCase.isMissingPath && store.results[0].Status != scheduledJobExecutorFailedStatus {
		t.Fatalf("missing path result = %+v", store.results[0])
	}
}

func TestScheduledJobExecutor_StartRejectionIsPersistedAndAcknowledgedLocally(t *testing.T) {
	startRejected := errors.New("API start transition rejected")
	testCases := []struct {
		name              string
		startErr          error
		isRejected        bool
		saveResultErr     error
		wantErr           error
		wantCalls         []string
		wantRejectedLocal bool
	}{
		{name: "recognized rejection", startErr: startRejected, isRejected: true,
			wantCalls: []string{"save-claim", "start", "save-result", "mark-delivered"}, wantRejectedLocal: true},
		{name: "rejected result persistence failure", startErr: startRejected, isRejected: true, saveResultErr: errors.New("disk unavailable"),
			wantErr: errors.New("disk unavailable"), wantCalls: []string{"save-claim", "start", "save-result"}},
		{name: "network failure", startErr: errors.New("network unavailable"), wantErr: errors.New("network unavailable"), wantCalls: []string{"save-claim", "start"}},
		{name: "authorization failure", startErr: errors.New("access denied"), wantErr: errors.New("access denied"), wantCalls: []string{"save-claim", "start"}},
		{name: "unknown conflict", startErr: errors.New("unexpected conflict"), wantErr: errors.New("unexpected conflict"), wantCalls: []string{"save-claim", "start"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			store := &executorStore{saveResultErr: testCase.saveResultErr}
			agentCalls := 0
			executor := newScheduledJobExecutor(t, store, testCase.startErr, func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error) {
				agentCalls++
				return ScheduledRunOutboxResult{Status: "succeeded"}, nil
			})
			executor.isStartRejected = func(err error) bool { return testCase.isRejected && errors.Is(err, startRejected) }

			err := executor.Execute(context.Background(), executorTestClaim(t.TempDir()))
			if testCase.wantErr != nil && (err == nil || err.Error() != testCase.wantErr.Error()) {
				t.Fatalf("Execute error = %v, want %v", err, testCase.wantErr)
			}
			if testCase.wantErr == nil && err != nil {
				t.Fatalf("Execute: %v", err)
			}
			if agentCalls != 0 {
				t.Fatalf("agent calls = %d, want 0", agentCalls)
			}
			if !sameStrings(store.calls, testCase.wantCalls) {
				t.Fatalf("calls = %v, want %v", store.calls, testCase.wantCalls)
			}
			if testCase.wantRejectedLocal {
				if len(store.results) != 1 || store.results[0] != scheduledRunOutboxStartRejectedResult() {
					t.Fatalf("saved results = %+v", store.results)
				}
			}
		})
	}
}

func TestScheduledJobExecutor_SavesResultBeforeCompletionAndOnlyDeliversAcknowledgements(t *testing.T) {
	testCases := []executorDeliveryCase{
		{name: "acknowledged", wantDelivered: 1},
		{name: "transient complete failure", completeErr: errors.New("temporarily unavailable")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) { assertExecutorDelivery(t, testCase) })
	}
}

type executorDeliveryCase struct {
	name          string
	completeErr   error
	wantDelivered int
}

func assertExecutorDelivery(t *testing.T, testCase executorDeliveryCase) {
	t.Helper()
	store := &executorStore{}
	executor := newScheduledJobExecutor(t, store, nil, func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error) {
		return ScheduledRunOutboxResult{Status: "succeeded", ResponseBody: "done"}, nil
	})
	executor.complete = func(context.Context, string, ScheduledRunOutboxRow, time.Time) error {
		store.calls = append(store.calls, "complete")
		return testCase.completeErr
	}
	err := executor.Execute(context.Background(), executorTestClaim(t.TempDir()))
	if testCase.completeErr != nil && !errors.Is(err, testCase.completeErr) {
		t.Fatalf("Execute error = %v, want %v", err, testCase.completeErr)
	}
	if len(store.results) != 1 || store.results[0].Status != "succeeded" {
		t.Fatalf("saved results = %+v", store.results)
	}
	if len(store.delivered) != testCase.wantDelivered {
		t.Fatalf("delivered = %v, want %d", store.delivered, testCase.wantDelivered)
	}
	if testCase.completeErr == nil && !sameStrings(store.calls, executorCompletedCalls) {
		t.Fatalf("calls = %v", store.calls)
	}
}

var executorCompletedCalls = []string{"save-claim", "start", "mark-started", "save-result", "complete", "mark-delivered"}

type executorStore struct {
	calls            []string
	results          []ScheduledRunOutboxResult
	delivered        []string
	saveClaimSet     bool
	saveClaimApplied bool
	saveClaimErr     error
	markStartedErr   error
	saveResultErr    error
}

func (s *executorStore) SaveClaim(context.Context, ScheduledRunOutboxRow) (bool, error) {
	s.calls = append(s.calls, "save-claim")
	if s.saveClaimErr != nil {
		return false, s.saveClaimErr
	}
	if s.saveClaimSet {
		return s.saveClaimApplied, nil
	}
	return true, nil
}
func (s *executorStore) MarkStarted(context.Context, string, time.Time) (bool, error) {
	s.calls = append(s.calls, "mark-started")
	return s.markStartedErr == nil, s.markStartedErr
}
func (s *executorStore) SaveResult(_ context.Context, _ string, result ScheduledRunOutboxResult, _ time.Time) (bool, error) {
	s.calls = append(s.calls, "save-result")
	if s.saveResultErr != nil {
		return false, s.saveResultErr
	}
	s.results = append(s.results, result)
	return true, nil
}
func (s *executorStore) MarkDelivered(_ context.Context, runID string, _ time.Time) (bool, error) {
	s.calls = append(s.calls, "mark-delivered")
	s.delivered = append(s.delivered, runID)
	return true, nil
}

func newScheduledJobExecutor(t *testing.T, store *executorStore, startErr error, agent ScheduledJobExecutorAgent) *ScheduledJobExecutor {
	t.Helper()
	executor, err := NewScheduledJobExecutor(ScheduledJobExecutorOptions{Store: store, NodeID: "node-1", Agent: agent, Now: func() time.Time { return time.Unix(1, 0) }, Start: func(context.Context, string, string, time.Time) error {
		store.calls = append(store.calls, "start")
		return startErr
	}, Complete: func(context.Context, string, ScheduledRunOutboxRow, time.Time) error {
		store.calls = append(store.calls, "complete")
		return nil
	}})
	if err != nil {
		t.Fatalf("NewScheduledJobExecutor: %v", err)
	}
	return executor
}

func executorTestClaim(projectPath string) LocalSchedulerClaimResult {
	return LocalSchedulerClaimResult{JobID: "job-1", RunID: "run-1", ScheduledFor: time.Unix(1, 0), ProjectPath: projectPath}
}

func TestScheduledJobExecutor_SavesBoundedAgentOutputOnFailure(t *testing.T) {
	store := &executorStore{}
	executor := newScheduledJobExecutor(t, store, nil, func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error) {
		return ScheduledRunOutboxResult{ResponseBody: strings.Repeat("界", 2049)}, errors.New(strings.Repeat("失", 501))
	})

	if err := executor.Execute(context.Background(), executorTestClaim(t.TempDir())); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if len(store.results) != 1 {
		t.Fatalf("saved results = %+v", store.results)
	}
	result := store.results[0]
	if result.Status != scheduledJobExecutorFailedStatus || result.ErrorCode != scheduledJobExecutorAgentFailedCode {
		t.Fatalf("result = %+v", result)
	}
	if result.ResponseBody == "" || utf16CodeUnits(result.ResponseBody) > scheduledJobExecutorResponseBodyMaxLength || !utf8.ValidString(result.ResponseBody) {
		t.Fatalf("response body = %q", result.ResponseBody)
	}
	if utf16CodeUnits(result.ErrorMessage) > scheduledJobExecutorErrorMessageMaxLength || !utf8.ValidString(result.ErrorMessage) {
		t.Fatalf("error message = %q", result.ErrorMessage)
	}
}

func TestScheduledJobExecutor_NormalizesDirectSuccessOutputBeforeSaving(t *testing.T) {
	store := &executorStore{}
	executor := newScheduledJobExecutor(t, store, nil, func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error) {
		return ScheduledRunOutboxResult{Status: "succeeded", ResponseBody: strings.Repeat("😀", 2049), ErrorMessage: strings.Repeat("😀", 501)}, nil
	})

	if err := executor.Execute(context.Background(), executorTestClaim(t.TempDir())); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	result := store.results[0]
	if result.ResponseBody != strings.Repeat("😀", 2048) || result.ErrorMessage != strings.Repeat("😀", 500) {
		t.Fatalf("saved result = %+v", result)
	}
}

func TestScheduledJobExecutor_NormalizesFailedOutputBeforeSaving(t *testing.T) {
	store := &executorStore{}
	wantResponseBody := strings.Repeat("界", 4095) + "�"
	wantErrorMessage := strings.Repeat("😀", 499) + "界�"
	executor := newScheduledJobExecutor(t, store, nil, func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error) {
		return ScheduledRunOutboxResult{ResponseBody: strings.Repeat("界", 4095) + "\xffdiscard"}, errors.New(strings.Repeat("😀", 499) + "界\xffdiscard")
	})

	if err := executor.Execute(context.Background(), executorTestClaim(t.TempDir())); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	result := store.results[0]
	if result.Status != scheduledJobExecutorFailedStatus || result.ResponseBody != wantResponseBody || result.ErrorMessage != wantErrorMessage {
		t.Fatalf("saved result = %+v", result)
	}
	if !utf8.ValidString(result.ResponseBody) || !utf8.ValidString(result.ErrorMessage) {
		t.Fatalf("saved invalid UTF-8 result = %+v", result)
	}
}

func utf16CodeUnits(text string) int {
	codeUnits := 0
	for _, character := range text {
		if character > 0xFFFF {
			codeUnits += 2
		} else {
			codeUnits++
		}
	}
	return codeUnits
}
