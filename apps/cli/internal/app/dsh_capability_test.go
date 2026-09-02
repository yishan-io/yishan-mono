package app

import (
	"context"
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
)

func TestDecodeDSHCapabilityInputRejectsUnknownDomainFields(t *testing.T) {
	request := dsh.CapabilityRequest{Operation: dshMemoryReadOperation, Input: json.RawMessage(`{"path":"MEMORY.md","unknown":true}`)}
	if _, err := decodeDSHCapabilityInput[dshMemoryReadInput](request, dshMemoryReadOperation); err == nil {
		t.Fatal("unknown memory input field was accepted")
	}
}

func TestExecuteDSHWorkspaceCapabilityOwnsOperationValidation(t *testing.T) {
	request := dsh.CapabilityRequest{Operation: "domain.inspect", Input: json.RawMessage(`{}`)}
	if _, err := executeDSHWorkspaceCapability(context.Background(), nil, request); err == nil {
		t.Fatal("unknown workspace operation was accepted")
	}
}
