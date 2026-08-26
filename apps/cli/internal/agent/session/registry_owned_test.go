package session

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/agent/process"
)

type ownedProcessManager struct{ process *process.Session }

func (m *ownedProcessManager) Session(string) (*process.Session, bool) {
	return m.process, m.process != nil
}

func (m *ownedProcessManager) Starting(string) bool { return false }

func TestRegistry_GetLiveOwnedProcessBindsOriginalGenerationAcrossReplacement(t *testing.T) {
	registry := NewRegistry()
	original := &process.Session{}
	replacement := &process.Session{}
	manager := &ownedProcessManager{process: original}
	registry.Register("same-id", nil, original, "", "workspace-a", "/workspace-a", false)

	owned, err := registry.GetLiveOwnedProcess(manager, "same-id", "workspace-a", "/workspace-a")
	if err != nil {
		t.Fatalf("GetLiveOwnedProcess: %v", err)
	}
	manager.process = replacement
	registry.Register("same-id", nil, replacement, "", "workspace-b", "/workspace-b", false)

	if owned.Process() != original {
		t.Fatal("owned process changed to the same-ID replacement")
	}
	if current, err := registry.GetLiveOwnedProcess(manager, "same-id", "workspace-b", "/workspace-b"); err != nil || current.Process() != replacement {
		t.Fatalf("replacement ownership = %#v, %v", current, err)
	}
}

func TestRegistry_ClaimOwnedStopCannotClaimSameIDReplacement(t *testing.T) {
	registry := NewRegistry()
	original := &process.Session{}
	replacement := &process.Session{}
	manager := &ownedProcessManager{process: original}
	registry.Register("same-id", nil, original, "", "workspace-a", "/workspace-a", false)

	claim, err := registry.ClaimOwnedStop(manager, "same-id", "workspace-a", "/workspace-a")
	if err != nil {
		t.Fatalf("ClaimOwnedStop: %v", err)
	}
	manager.process = replacement
	registry.Register("same-id", nil, replacement, "", "workspace-b", "/workspace-b", false)
	registry.CompleteStop(claim, nil)

	state, exists := registry.Get("same-id")
	if !exists || state.Process != replacement || state.WorkspaceID != "workspace-b" {
		t.Fatalf("stop affected same-ID replacement: %#v", state)
	}
	if _, err := registry.ClaimOwnedStop(manager, "same-id", "workspace-a", "/workspace-a"); !errors.Is(err, ErrSessionNotLive) {
		t.Fatalf("old owner claim error = %v, want ErrSessionNotLive", err)
	}
}

func TestRegistry_GetLiveOwnedProcessRejectsStoppingGeneration(t *testing.T) {
	registry := NewRegistry()
	proc := &process.Session{}
	manager := &ownedProcessManager{process: proc}
	registry.Register("s1", nil, proc, "", "workspace", "/workspace", false)
	registry.ClaimStop("s1")

	_, err := registry.GetLiveOwnedProcess(manager, "s1", "workspace", "/workspace")
	if !errors.Is(err, ErrSessionStopping) {
		t.Fatalf("GetLiveOwnedProcess error = %v, want ErrSessionStopping", err)
	}
}

func TestRegistry_ClaimOwnedStopJoinsInProgressStop(t *testing.T) {
	registry := NewRegistry()
	proc := &process.Session{}
	manager := &ownedProcessManager{process: proc}
	registry.Register("s1", nil, proc, "", "workspace", "/workspace", false)
	owner, _, _ := registry.ClaimStop("s1")

	joiner, err := registry.ClaimOwnedStop(manager, "s1", "workspace", "/workspace")
	if err != nil {
		t.Fatalf("ClaimOwnedStop: %v", err)
	}
	if joiner.IsOwner() {
		t.Fatal("ClaimOwnedStop owned an already in-progress stop")
	}
	registry.CompleteStop(owner, nil)
	if err := joiner.Wait(context.Background()); err != nil {
		t.Fatalf("joined stop: %v", err)
	}
}

func TestRegistry_GetLiveOwnedProcessRejectsCommittedWorkspace(t *testing.T) {
	registry := NewRegistry()
	cleanup, _, err := registry.BeginWorkspaceCleanup(context.Background(), "workspace")
	if err != nil {
		t.Fatalf("BeginWorkspaceCleanup: %v", err)
	}
	if !registry.CommitWorkspaceCleanup(cleanup) {
		t.Fatal("CommitWorkspaceCleanup did not commit")
	}
	proc := &process.Session{}
	registry.Register("s1", nil, proc, "", "workspace", "/workspace", false)

	_, err = registry.GetLiveOwnedProcess(&ownedProcessManager{process: proc}, "s1", "workspace", "/workspace")
	if !errors.Is(err, ErrWorkspaceClosing) {
		t.Fatalf("GetLiveOwnedProcess error = %v, want ErrWorkspaceClosing", err)
	}
}
