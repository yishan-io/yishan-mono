package dsh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

type channelWriteCloser struct {
	frames chan []byte
}

func (w *channelWriteCloser) Write(frame []byte) (int, error) {
	w.frames <- append([]byte(nil), frame...)
	return len(frame), nil
}

func (w *channelWriteCloser) Close() error { return nil }

func TestSupervisor_ResumeSession_RetryTimeoutDoesNotRevokePendingBinding(t *testing.T) {
	admitted := make(chan WorkspaceBindingRequest, 1)
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		admitted <- request
		return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
	}})
	writer := &channelWriteCloser{frames: make(chan []byte, 3)}
	process := &runtimeProcess{stdin: writer, pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor.process = process
	supervisor.health.IsReady = true
	request := SessionResumeRequest{CWD: "/workspace", SessionID: "session", WorkspaceID: "workspace"}

	originalResult := make(chan error, 1)
	go func() {
		_, err := supervisor.ResumeSession(context.Background(), request)
		originalResult <- err
	}()
	originalID := readRequestID(t, <-writer.frames)

	retryCtx, cancelRetry := context.WithCancel(context.Background())
	retryResult := make(chan error, 1)
	go func() {
		_, err := supervisor.ResumeSession(retryCtx, request)
		retryResult <- err
	}()
	_ = readRequestID(t, <-writer.frames)
	cancelRetry()
	if err := <-retryResult; !errors.Is(err, context.Canceled) {
		t.Fatalf("retry ResumeSession error = %v, want context cancellation", err)
	}

	reverseID := "reverse-admit"
	supervisor.handleRuntimeRequest(process, rpcEnvelope{ID: &reverseID, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace"}`)})
	select {
	case got := <-admitted:
		if got != (WorkspaceBindingRequest{SessionID: "session", WorkspaceID: "workspace"}) {
			t.Fatalf("admitted request = %#v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("retry timeout revoked the original pending workspace binding")
	}
	if frame := string(<-writer.frames); !strings.Contains(frame, `"cwd":"/workspace"`) {
		t.Fatalf("reverse binding response = %s", frame)
	}

	supervisor.routeOutput(process, []byte(fmt.Sprintf(`{"jsonrpc":"2.0","id":%q,"result":{"sessionId":"session"}}`, originalID)))
	if err := <-originalResult; err != nil {
		t.Fatalf("original ResumeSession error = %v", err)
	}
}

func readRequestID(t *testing.T, frame []byte) string {
	t.Helper()
	var request struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(frame, &request); err != nil || request.ID == "" {
		t.Fatalf("decode runtime request %q: %v", frame, err)
	}
	return request.ID
}
