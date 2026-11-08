package agent

import (
	"reflect"
	"testing"

	"yishan/apps/cli/internal/rpc"
)

func TestBuildPiStartArgsDefaultModel(t *testing.T) {
	tests := []struct {
		name string
		req  rpc.PiStartParams
		tail []string
	}{
		{name: "native default", tail: []string{"--session-id", "session"}},
		{name: "explicit preference", req: rpc.PiStartParams{Provider: "openrouter", ModelID: "anthropic/claude-sonnet-4"}, tail: []string{"--session-id", "session", "--provider", "openrouter", "--model", "anthropic/claude-sonnet-4"}},
		{name: "resume ignores preference", req: rpc.PiStartParams{Resume: true, Provider: "openai", ModelID: "gpt-5"}, tail: []string{"--session", "session"}},
		{name: "incomplete preference", req: rpc.PiStartParams{Provider: "openai"}, tail: []string{"--session-id", "session"}},
		{name: "model only", req: rpc.PiStartParams{ModelID: "gpt-5"}, tail: []string{"--session-id", "session"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.req.SessionID, test.req.TabID = "session", "tab"
			want := append([]string{"--mode", "rpc", "--name", "tab", "--approve"}, test.tail...)
			if got := buildPiStartArgs(test.req); !reflect.DeepEqual(got, want) {
				t.Fatalf("args = %q, want %q", got, want)
			}
		})
	}
}
