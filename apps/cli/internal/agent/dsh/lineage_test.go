package dsh

import (
	"context"
	"testing"
)

func TestSupervisor_ListSessionLineage_ReturnsValidatedChildren(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	response, err := supervisor.ListSessionLineage(context.Background(), SessionLineageRequest{CWD: "/workspace", RootSessionID: "root", Mode: SessionLineageChildren})
	if err != nil {
		t.Fatalf("ListSessionLineage: %v", err)
	}
	if response.RootSessionID != "root" || len(response.Children) != 1 || response.Children[0].SessionID != "child" {
		t.Fatalf("response = %#v", response)
	}
}

func TestSessionLineageRequest_RejectsInvalidInputs(t *testing.T) {
	cases := []SessionLineageRequest{
		{RootSessionID: "root", Mode: SessionLineageChildren},
		{CWD: "/workspace", Mode: SessionLineageChildren},
		{CWD: "/workspace", RootSessionID: "root", Mode: "all"},
	}
	for _, request := range cases {
		if err := validateSessionLineageRequest(request); err == nil {
			t.Fatalf("validateSessionLineageRequest(%#v) accepted invalid request", request)
		}
	}
}

func TestSessionLineageWireResult_RejectsMalformedResponses(t *testing.T) {
	depth, relativeDepth := int64(1), int64(1)
	valid := sessionLineageWireEntry{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: &depth, RelativeDepth: &relativeDepth, Live: boolPointer(true), Persisted: boolPointer(true)}
	cases := []sessionLineageWireResult{
		{RootSessionID: "other", Mode: SessionLineageChildren, Children: []sessionLineageWireEntry{valid}},
		{RootSessionID: "root", Mode: SessionLineageChildren, Children: []sessionLineageWireEntry{{SessionID: "", ParentSessionID: "root"}}},
		{RootSessionID: "root", Mode: SessionLineageChildren, Children: []sessionLineageWireEntry{valid, valid}},
		{RootSessionID: "root", Mode: SessionLineageChildren, Children: []sessionLineageWireEntry{{SessionID: "child", ParentSessionID: "other", Origin: "subagent", DelegationDepth: &depth, RelativeDepth: &relativeDepth, Live: boolPointer(true), Persisted: boolPointer(true)}}},
		{RootSessionID: "root", Mode: SessionLineageChildren, Children: []sessionLineageWireEntry{{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: &depth, RelativeDepth: int64Pointer(2), Live: boolPointer(true), Persisted: boolPointer(true)}}},
	}
	request := SessionLineageRequest{CWD: "/workspace", RootSessionID: "root", Mode: SessionLineageChildren}
	for _, response := range cases {
		if _, err := response.validate(request); err == nil {
			t.Fatalf("validate(%#v) accepted malformed response", response)
		}
	}
}

func boolPointer(value bool) *bool { return &value }

func TestSessionLineageWireEntry_RejectsInvalidFields(t *testing.T) {
	zero, negative := int64(0), int64(-1)
	invalidActivity, invalidMode := "busy", SessionLineageChildMode("all")
	cases := []sessionLineageWireEntry{
		{SessionID: "child", ParentSessionID: "child", Origin: "subagent", DelegationDepth: int64Pointer(1), RelativeDepth: int64Pointer(1), Live: boolPointer(true), Persisted: boolPointer(true)},
		{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: &negative, RelativeDepth: int64Pointer(1), Live: boolPointer(true), Persisted: boolPointer(true)},
		{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: int64Pointer(1), RelativeDepth: &zero, Live: boolPointer(true), Persisted: boolPointer(true)},
		{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: int64Pointer(1), RelativeDepth: int64Pointer(1), Live: boolPointer(true), Persisted: boolPointer(true), Activity: &invalidActivity},
		{SessionID: "child", ParentSessionID: "root", Origin: "subagent", DelegationDepth: int64Pointer(1), RelativeDepth: int64Pointer(1), Live: boolPointer(true), Persisted: boolPointer(true), Mode: &invalidMode},
	}
	for _, entry := range cases {
		if _, err := entry.validate(); err == nil {
			t.Fatalf("validate(%#v) accepted invalid entry", entry)
		}
	}
}

func TestSessionLineageWireResult_StrictlyRejectsUnknownFields(t *testing.T) {
	var response sessionLineageWireResult
	if err := decodeStrictJSON([]byte(`{"rootSessionId":"root","mode":"children","children":[],"unknown":true}`), &response); err == nil {
		t.Fatal("decodeStrictJSON accepted an unknown lineage response field")
	}
}

func int64Pointer(value int64) *int64 { return &value }

func TestSessionLineageWireEntry_ContinuableModeUsesChildMode(t *testing.T) {
	depth, relativeDepth := int64(1), int64(1)
	continuable := SessionLineageChildContinuable
	entry := sessionLineageWireEntry{
		SessionID:       "child",
		ParentSessionID: "root",
		Origin:          "subagent",
		DelegationDepth: &depth,
		RelativeDepth:   &relativeDepth,
		Live:            boolPointer(true),
		Persisted:       boolPointer(true),
		Mode:            &continuable,
	}
	child, err := entry.validate()
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	var mode SessionLineageChildMode = child.Mode
	if mode != SessionLineageChildContinuable {
		t.Fatalf("Mode = %q, want %q", mode, SessionLineageChildContinuable)
	}
}
