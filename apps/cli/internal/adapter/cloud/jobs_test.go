package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestReconcileScheduledJobsContext_SendsProtectedJobsAndDecodesJobs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/nodes/node-1/scheduled-jobs/reconcile" {
			http.NotFound(writer, request)
			return
		}
		var body struct {
			ProtectedJobs []struct {
				JobID     string `json:"jobId"`
				NextRunAt string `json:"nextRunAt"`
			} `json:"protectedJobs"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode reconcile body: %v", err)
		}
		if len(body.ProtectedJobs) != 1 || body.ProtectedJobs[0].JobID != "job-1" || body.ProtectedJobs[0].NextRunAt != "2026-02-03T02:05:06.123Z" {
			t.Fatalf("unexpected protected jobs: %+v", body.ProtectedJobs)
		}
		_, _ = writer.Write([]byte(`{"jobs":[{"id":"job-1","nextRunAt":"2026-02-03T04:05:06.000Z"}]}`))
	}))
	t.Cleanup(server.Close)

	cet := time.FixedZone("CET", 2*60*60)
	response, err := NewClient(server.URL, "yst_token", "", "", "", nil).ReconcileScheduledJobsContext(context.Background(), "node-1", ReconcileScheduledJobsInput{
		ProtectedJobs: []ProtectedScheduledJob{{JobID: "job-1", NextRunAt: time.Date(2026, 2, 3, 4, 5, 6, 123456789, cet)}},
	})
	if err != nil {
		t.Fatalf("reconcile scheduled jobs: %v", err)
	}
	if len(response.Jobs) != 1 || response.Jobs[0].ID != "job-1" || response.Jobs[0].NextRunAt != "2026-02-03T04:05:06.000Z" {
		t.Fatalf("unexpected reconciled jobs: %+v", response.Jobs)
	}
}

func TestReconcileScheduledJobsContext_RespectsCancellation(t *testing.T) {
	const channelWaitTimeout = time.Second

	requestStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		close(requestStarted)
		<-releaseHandler
	}))
	t.Cleanup(func() {
		close(releaseHandler)
		server.Close()
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	errorsCh := make(chan error, 1)
	go func() {
		_, err := NewClient(server.URL, "yst_token", "", "", "", nil).ReconcileScheduledJobsContext(ctx, "node-1", ReconcileScheduledJobsInput{})
		errorsCh <- err
	}()
	select {
	case <-requestStarted:
	case <-time.After(channelWaitTimeout):
		t.Fatal("timed out waiting for reconcile request to start")
	}
	cancel()

	select {
	case err := <-errorsCh:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context cancellation, got %v", err)
		}
	case <-time.After(channelWaitTimeout):
		t.Fatal("timed out waiting for canceled reconcile request to return")
	}
}

func TestReconcileScheduledJobsContext_ReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/nodes/node-1/scheduled-jobs/reconcile" {
			http.NotFound(writer, request)
			return
		}
		http.Error(writer, `{"error":"reconcile unavailable"}`, http.StatusConflict)
	}))
	t.Cleanup(server.Close)

	_, err := NewClient(server.URL, "yst_token", "", "", "", nil).ReconcileScheduledJobsContext(context.Background(), "node-1", ReconcileScheduledJobsInput{})
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusConflict {
		t.Fatalf("expected conflict status, got %d", apiErr.StatusCode)
	}
}

func TestClaimScheduledJobContext_SendsJobIDAndDecodesClaim(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/nodes/node-1/scheduled-jobs/claim" {
			http.NotFound(writer, request)
			return
		}
		var body map[string]string
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode claim body: %v", err)
		}
		if len(body) != 2 || body["jobId"] != "job-1" || body["expectedNextRunAt"] != "2026-02-03T02:05:06.123Z" {
			t.Fatalf("unexpected claim body: %+v", body)
		}
		_, _ = writer.Write([]byte(`{"runId":"run-1","scheduledFor":"2026-02-03T04:05:06Z","projectPath":"/projects/example","job":{"id":"job-1","nextRunAt":"2026-02-03T05:05:06Z"}}`))
	}))
	t.Cleanup(server.Close)

	claim, err := NewClient(server.URL, "yst_token", "", "", "", nil).ClaimScheduledJobContext(context.Background(), "node-1", ClaimScheduledJobInput{
		JobID:             "job-1",
		ExpectedNextRunAt: time.Date(2026, 2, 3, 4, 5, 6, 123456789, time.FixedZone("CET", 2*60*60)),
	})
	if err != nil {
		t.Fatalf("claim scheduled job: %v", err)
	}
	if claim.RunID != "run-1" || claim.ProjectPath != "/projects/example" || claim.Job.ID != "job-1" {
		t.Fatalf("unexpected claim: %+v", claim)
	}
	if claim.ScheduledFor != "2026-02-03T04:05:06Z" || claim.Job.NextRunAt != "2026-02-03T05:05:06Z" {
		t.Fatalf("expected ISO scheduled times, got %+v", claim)
	}
}

func TestStartScheduledJobRunContext_RespectsCancellation(t *testing.T) {
	requestStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		close(requestStarted)
		<-releaseHandler
	}))
	t.Cleanup(func() {
		close(releaseHandler)
		server.Close()
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	errorsCh := make(chan error, 1)
	go func() {
		_, err := NewClient(server.URL, "yst_token", "", "", "", nil).StartScheduledJobRunContext(ctx, "node-1", StartScheduledJobRunInput{RunID: "run-1"})
		errorsCh <- err
	}()
	select {
	case <-requestStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for start request")
	}
	cancel()
	select {
	case err := <-errorsCh:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("start error = %v, want context canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for canceled start request")
	}
}

func TestIsScheduledJobRunStartRejected(t *testing.T) {
	transitionUnavailable := []byte(`{"code":"SCHEDULED_JOB_RUN_TRANSITION_UNAVAILABLE"}`)
	testCases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "matching conflict", err: &APIError{StatusCode: http.StatusConflict, Body: transitionUnavailable}, want: true},
		{name: "other conflict code", err: &APIError{StatusCode: http.StatusConflict, Body: []byte(`{"code":"OTHER"}`)}, want: false},
		{name: "malformed conflict body", err: &APIError{StatusCode: http.StatusConflict, Body: []byte(`{"code":`)}, want: false},
		{name: "unauthorized", err: &APIError{StatusCode: http.StatusUnauthorized, Body: transitionUnavailable}, want: false},
		{name: "forbidden", err: &APIError{StatusCode: http.StatusForbidden, Body: transitionUnavailable}, want: false},
		{name: "server error", err: &APIError{StatusCode: http.StatusBadGateway, Body: transitionUnavailable}, want: false},
		{name: "canceled", err: context.Canceled, want: false},
		{name: "transport", err: errors.New("transport failure"), want: false},
		{name: "refresh", err: &TokenRefreshError{}, want: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := IsScheduledJobRunStartRejected(testCase.err); got != testCase.want {
				t.Fatalf("IsScheduledJobRunStartRejected(%v) = %t, want %t", testCase.err, got, testCase.want)
			}
		})
	}
}

func TestIsScheduledJobRunRetryable(t *testing.T) {
	permanentRefreshErr := &TokenRefreshError{Permanent: true}

	testCases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "unauthorized", err: &APIError{StatusCode: http.StatusUnauthorized}, want: false},
		{name: "forbidden", err: &APIError{StatusCode: http.StatusForbidden}, want: false},
		{name: "permanent refresh", err: permanentRefreshErr, want: false},
		{name: "server error", err: &APIError{StatusCode: http.StatusBadGateway}, want: true},
		{name: "canceled", err: context.Canceled, want: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := IsScheduledJobRunRetryable(testCase.err); got != testCase.want {
				t.Fatalf("retryable(%v) = %t, want %t", testCase.err, got, testCase.want)
			}
		})
	}
}

func TestStartScheduledJobRunContext_DecodesStarted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPut || request.URL.Path != "/nodes/node-1/scheduled-jobs/runs/start" {
			http.NotFound(writer, request)
			return
		}
		_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
	}))
	t.Cleanup(server.Close)

	response, err := NewClient(server.URL, "yst_token", "", "", "", nil).StartScheduledJobRunContext(context.Background(), "node-1", StartScheduledJobRunInput{RunID: "run-1"})
	if err != nil {
		t.Fatalf("start scheduled job run: %v", err)
	}
	if !response.Started {
		t.Fatal("Started = false, want true")
	}
}

func TestCompleteScheduledJobRunContext_DecodesAuthoritativeConflictAcknowledgement(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPut || request.URL.Path != "/nodes/node-1/scheduled-jobs/runs/complete" {
			http.NotFound(writer, request)
			return
		}
		_, _ = writer.Write([]byte(`{"ok":true,"accepted":false}`))
	}))
	t.Cleanup(server.Close)

	response, err := NewClient(server.URL, "yst_token", "", "", "", nil).CompleteScheduledJobRunContext(
		context.Background(), "node-1", CompleteScheduledJobRunInput{RunID: "run-1", Status: "succeeded"},
	)
	if err != nil {
		t.Fatalf("complete scheduled job run: %v", err)
	}
	if !response.OK || response.Accepted {
		t.Fatalf("completion response = %+v, want ok accepted false", response)
	}
}
