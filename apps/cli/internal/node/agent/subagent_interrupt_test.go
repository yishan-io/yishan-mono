package agent

import (
	"context"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestAgentCancelSubagent_UsesAuthorizedWorkspaceAndDirectChild(t *testing.T) {
	runtime := &recordingDSHSessions{lineageResult: dsh.SessionLineageResult{
		RootSessionID: "parent", Mode: dsh.SessionLineageChildren,
		Children: []dsh.SessionLineageEntry{{SessionID: "child", ParentSessionID: "parent"}},
	}, interruptResult: dsh.SubagentInterruptResult{
		ParentSessionID: "parent", ChildSessionID: "child", InterruptRequested: true,
	}}
	service := newCancelSubagentTestService(runtime, "/authoritative")

	response, err := service.AgentCancelSubagent(context.Background(), validCancelSubagentRequest())
	if err != nil {
		t.Fatalf("AgentCancelSubagent: %v", err)
	}
	if runtime.lineageRequest != (dsh.SessionLineageRequest{CWD: "/authoritative", RootSessionID: "parent", Mode: dsh.SessionLineageChildren}) {
		t.Fatalf("lineage request = %#v", runtime.lineageRequest)
	}
	if runtime.interruptRequest != (dsh.SubagentInterruptRequest{CWD: "/authoritative", ParentSessionID: "parent", ChildSessionID: "child"}) {
		t.Fatalf("interrupt request = %#v", runtime.interruptRequest)
	}
	want := rpc.AgentCancelSubagentResult{Runtime: rpc.AgentRuntimeDSH, ParentSessionID: "parent", ChildSessionID: "child", InterruptRequested: true}
	if response != want {
		t.Fatalf("response = %#v, want %#v", response, want)
	}
}

func TestAgentCancelSubagent_RejectsBeforeRuntimeCall(t *testing.T) {
	tests := []struct {
		name string
		req  rpc.AgentCancelSubagentParams
		path string
	}{
		{"cwd mismatch", rpc.AgentCancelSubagentParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/untrusted", ParentSessionID: "parent", ChildSessionID: "child"}, "/authoritative"},
		{"pi runtime", rpc.AgentCancelSubagentParams{Runtime: rpc.AgentRuntimePi, WorkspaceID: "workspace", CWD: "/authoritative", ParentSessionID: "parent", ChildSessionID: "child"}, "/authoritative"},
		{"unknown runtime", rpc.AgentCancelSubagentParams{Runtime: "unknown", WorkspaceID: "workspace", CWD: "/authoritative", ParentSessionID: "parent", ChildSessionID: "child"}, "/authoritative"},
		{"blank parent", rpc.AgentCancelSubagentParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/authoritative", ChildSessionID: "child"}, "/authoritative"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			runtime := &recordingDSHSessions{}
			service := newCancelSubagentTestService(runtime, test.path)
			assertRPCErrorCode(t, callCancelSubagent(service, test.req), rpc.CodeInvalidParams)
			if runtime.lineageRequest.CWD != "" || runtime.interruptRequest.CWD != "" {
				t.Fatalf("runtime called: lineage=%#v interrupt=%#v", runtime.lineageRequest, runtime.interruptRequest)
			}
		})
	}
}

func TestAgentCancelSubagent_RejectsUnrelatedChild(t *testing.T) {
	runtime := &recordingDSHSessions{lineageResult: dsh.SessionLineageResult{
		RootSessionID: "parent", Mode: dsh.SessionLineageChildren,
		Children: []dsh.SessionLineageEntry{{SessionID: "child", ParentSessionID: "other-parent"}},
	}}
	service := newCancelSubagentTestService(runtime, "/authoritative")
	assertRPCErrorCode(t, callCancelSubagent(service, validCancelSubagentRequest()), rpc.CodeNotFound)
	if runtime.interruptRequest.CWD != "" {
		t.Fatalf("interrupted unrelated child: %#v", runtime.interruptRequest)
	}
}

func TestAgentCancelSubagent_MapsRuntimeUnavailableAndReleasesAdmission(t *testing.T) {
	runtime := &recordingDSHSessions{lineageResult: dsh.SessionLineageResult{
		RootSessionID: "parent", Mode: dsh.SessionLineageChildren,
		Children: []dsh.SessionLineageEntry{{SessionID: "child", ParentSessionID: "parent"}},
	}, interruptErr: dsh.ErrRuntimeUnavailable}
	service := newCancelSubagentTestService(runtime, "/authoritative")
	err := callCancelSubagent(service, validCancelSubagentRequest())
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) || rpcErr.Data["code"] != rpc.ErrorDataCodeDSHRuntimeUnavailable {
		t.Fatalf("error = %#v, want stable runtime unavailable", err)
	}
	assertCancelSubagentAdmissionReleased(t, service)
}

func newCancelSubagentTestService(runtime DSHSessions, path string) *Service {
	return NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: path}, nil
	}), DSH: runtime})
}

func validCancelSubagentRequest() rpc.AgentCancelSubagentParams {
	return rpc.AgentCancelSubagentParams{Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace", CWD: "/authoritative", ParentSessionID: "parent", ChildSessionID: "child"}
}

func callCancelSubagent(service *Service, req rpc.AgentCancelSubagentParams) error {
	_, err := service.AgentCancelSubagent(context.Background(), req)
	return err
}

func assertCancelSubagentAdmissionReleased(t *testing.T, service *Service) {
	t.Helper()
	cleanupDone := make(chan *WorkspaceAgentCleanup, 1)
	go func() {
		handle, _ := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace")
		cleanupDone <- handle
	}()
	select {
	case handle := <-cleanupDone:
		service.AbortWorkspaceAgentCleanup(handle)
	case <-time.After(time.Second):
		t.Fatal("cancel subagent leaked workspace admission")
	}
}
