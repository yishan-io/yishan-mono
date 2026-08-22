package rpc

import (
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskUpdateLinkStatusParams_DecodeTypedStatus(t *testing.T) {
	var params LocalTaskUpdateLinkStatusParams
	if err := json.Unmarshal([]byte(`{"linkId":"link-1","status":"paused"}`), &params); err != nil {
		t.Fatal(err)
	}
	if params.LinkID != "link-1" || params.Status != localtask.StatusPaused {
		t.Fatalf("params = %#v", params)
	}
}

func TestLocalTaskContextDetails_UsesV1DocumentFields(t *testing.T) {
	details := localtask.ContextDetails{
		Directory: "/context/task-1", PlanPath: "/context/task-1/plan.md",
		NotesPath: "/context/task-1/notes.md", OutcomePath: "/context/task-1/outcome.md",
	}
	encoded, err := json.Marshal(details)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"directory":"/context/task-1","planPath":"/context/task-1/plan.md","notesPath":"/context/task-1/notes.md","outcomePath":"/context/task-1/outcome.md"}`
	if string(encoded) != want {
		t.Fatalf("encoded details = %s, want %s", encoded, want)
	}
}
