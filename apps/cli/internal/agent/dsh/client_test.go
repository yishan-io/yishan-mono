package dsh

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestRuntimeProcess_RegisterAfterExitFailsImmediately(t *testing.T) {
	process := &runtimeProcess{pending: make(map[uint64]chan rpcResponse)}
	process.failPending(errors.New("exited"))
	response, remove := process.registerPending(7)
	defer remove()
	select {
	case frame := <-response:
		if !errors.Is(frame.err, ErrRequestInterrupted) {
			t.Fatalf("response error = %v", frame.err)
		}
	case <-time.After(time.Second):
		t.Fatal("register after exit did not fail immediately")
	}
}

func TestSessionListWireResult_RejectsMissingCreatedAt(t *testing.T) {
	live, persisted := false, true
	result := sessionListWireResult{Sessions: []sessionListWireEntry{{
		SessionID: "session-1", Live: &live, Persisted: &persisted,
	}}}
	if _, err := result.validate(); err == nil {
		t.Fatal("accepted session list entry without createdAt")
	}
}

func TestValidJSONObject_RejectsMissingSequence(t *testing.T) {
	if validJSONObject([]byte(`{"type":"turn/end","time":1,"data":{}}`)) {
		t.Fatal("accepted session event without seq")
	}
}

func TestSupervisor_ListSessions_RoutesMatchingResponse(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	response, err := supervisor.ListSessions(context.Background(), SessionListRequest{CWD: "/workspace"})
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(response.Sessions) != 1 || response.Sessions[0].SessionID != "/workspace" {
		t.Fatalf("sessions = %#v", response.Sessions)
	}
}

func TestSupervisor_ListSessions_RoutesConcurrentResponses(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	var waitGroup sync.WaitGroup
	errorsByCWD := make(chan error, 20)
	for index := range 20 {
		waitGroup.Add(1)
		go requestSessionList(supervisor, index, &waitGroup, errorsByCWD)
	}
	waitGroup.Wait()
	close(errorsByCWD)
	for err := range errorsByCWD {
		t.Error(err)
	}
}

func requestSessionList(supervisor *Supervisor, index int, waitGroup *sync.WaitGroup, results chan<- error) {
	defer waitGroup.Done()
	cwd := fmt.Sprintf("/workspace/%d", index)
	response, err := supervisor.ListSessions(context.Background(), SessionListRequest{CWD: cwd})
	if err != nil {
		results <- fmt.Errorf("ListSessions(%s): %w", cwd, err)
		return
	}
	if len(response.Sessions) != 1 || response.Sessions[0].SessionID != cwd {
		results <- fmt.Errorf("response for %s = %#v", cwd, response)
	}
}

func TestSupervisor_ResumeSession_SendsResumeRequest(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	response, err := supervisor.ResumeSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "session"})
	if err != nil || response.SessionID != "session" {
		t.Fatalf("ResumeSession = %#v, %v", response, err)
	}
}

func TestSupervisor_ReadSession_RejectsMalformedResult(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "malformed"})
	if err == nil {
		t.Fatal("ReadSession accepted a malformed result")
	}
}

func TestSupervisor_ReadSession_ReturnsServerRequestError(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "server-error"})
	var requestErr *RequestError
	if !errors.As(err, &requestErr) || requestErr.Code != 9 || requestErr.Method != yishanSessionReadMethod {
		t.Fatalf("ReadSession error = %#v", err)
	}
}

func TestSupervisor_ReadSession_RespectsContextDeadline(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := supervisor.ReadSession(ctx, SessionReadRequest{CWD: "/workspace", SessionID: "wait"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("ReadSession error = %v, want deadline exceeded", err)
	}
}

func TestSupervisor_ReadSession_FailsWhenRuntimeExitsForRestart(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-exit"), RestartLimit: 1, RestartBackoff: time.Millisecond})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "session"})
	if !errors.Is(err, ErrRequestInterrupted) {
		t.Fatalf("ReadSession error = %v, want interrupted request", err)
	}
}

func TestSupervisor_ReadSession_FailsWhenClosed(t *testing.T) {
	waiting := make(chan string, 1)
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("rpc"), Diagnostics: func(message string) { waiting <- message },
	})
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "wait"})
		result <- err
	}()
	waitFor(t, func() bool {
		select {
		case message := <-waiting:
			return message == "DSH stderr: waiting request"
		default:
			return false
		}
	})
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := <-result; !errors.Is(err, ErrRequestInterrupted) {
		t.Fatalf("ReadSession error = %v, want interrupted request", err)
	}
}

func TestSupervisor_Start_ObservesNotifications(t *testing.T) {
	notifications := make(chan string, 1)
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-notify"), Diagnostics: func(message string) { notifications <- message }})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	select {
	case message := <-notifications:
		if message != "DSH notification: event" {
			t.Fatalf("diagnostic = %q", message)
		}
	case <-time.After(time.Second):
		t.Fatal("notification was not observed")
	}
}
