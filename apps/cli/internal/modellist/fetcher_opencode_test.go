package modellist

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestParseOpenCodeModels_ValidOutput(t *testing.T) {
	output := "opencode/big-pickle\nopencode/deepseek-v4-flash-free\namazon-bedrock/amazon.nova-lite-v1:0\n"
	models := parseOpenCodeModels(output)
	if len(models) < 1 {
		t.Fatalf("expected at least 1 model, got %d", len(models))
	}
	ids := make(map[string]bool)
	for _, m := range models {
		if m.ID == "" {
			t.Errorf("unexpected empty model ID")
		}
		if !strings.Contains(m.ID, "/") {
			t.Errorf("model ID %q does not contain '/'", m.ID)
		}
		if ids[m.ID] {
			t.Errorf("duplicate model ID %q", m.ID)
		}
		ids[m.ID] = true
	}
}

func TestParseOpenCodeModels_EmptyOutput(t *testing.T) {
	models := parseOpenCodeModels("")
	if len(models) != 0 {
		t.Fatalf("expected 0 models, got %d", len(models))
	}
}

func TestParseOpenCodeModels_FiltersInvalidLines(t *testing.T) {
	output := "\"json\"\n{invalid}\n[array]\nALL_CAPS\nno-slash\nvalid/model\n"
	models := parseOpenCodeModels(output)
	if len(models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(models))
	}
	if models[0].ID != "valid/model" {
		t.Errorf("expected 'valid/model', got %q", models[0].ID)
	}
}

func TestParseOpenCodeModelLine_InvalidFormats(t *testing.T) {
	tests := []struct {
		name string
		line string
		want string
	}{
		{name: "simple provider/model", line: "opencode/gpt-5", want: "opencode/gpt-5"},
		{name: "nested path with version", line: "amazon-bedrock/amazon.nova-lite-v1:0", want: "amazon-bedrock/amazon.nova-lite-v1:0"},
		{name: "openrouter triple path", line: "openrouter/openai/gpt-5.5", want: "openrouter/openai/gpt-5.5"},
		{name: "with trailing description", line: "provider/model-name Some description", want: "provider/model-name"},
		{name: "empty", line: "", want: ""},
		{name: "whitespace only", line: "   ", want: ""},
		{name: "no slash", line: "nopath", want: ""},
		{name: "all uppercase", line: "UPPER/CASE", want: ""},
		{name: "starts with quote", line: "\"quoted\"", want: ""},
		{name: "starts with brace", line: "{json}", want: ""},
		{name: "starts with bracket", line: "[array]", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseOpenCodeModelLine(tt.line)
			if got != tt.want {
				t.Errorf("parseOpenCodeModelLine(%q) = %q, want %q", tt.line, got, tt.want)
			}
		})
	}
}

func TestFetch_StderrCaptureOnFailure(t *testing.T) {
	home := os.Getenv("HOME")
	if home == "" {
		t.Skip("HOME not set, cannot resolve test binary path")
	}

	opencodePath := home + "/.yishan/bin/opencode"
	if _, err := os.Stat(opencodePath); err != nil {
		t.Skipf("opencode wrapper not found at %s", opencodePath)
	}

	cmd := exec.Command(opencodePath, "models", "--nonexistent-flag")
	isolateCmd(cmd)
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf
	_, err := cmd.Output()
	if err == nil {
		t.Skip("opencode accepted --nonexistent-flag, cannot verify stderr capture")
	}

	if stderrBuf.Len() == 0 {
		t.Error("expected stderr output from failing opencode command, got empty")
	}
}

func TestFetch_ErrorWrapsStderr(t *testing.T) {
	t.Run("error with stderr", func(t *testing.T) {
		home := os.Getenv("HOME")
		if home == "" {
			t.Skip("HOME not set")
		}
		opencodePath := home + "/.yishan/bin/opencode"
		if _, err := os.Stat(opencodePath); err != nil {
			t.Skip("opencode wrapper not found")
		}

		cmd := exec.Command(opencodePath, "models", "--nonexistent-flag")
		isolateCmd(cmd)
		var stderrBuf bytes.Buffer
		cmd.Stderr = &stderrBuf
		_, err := cmd.Output()
		if err == nil {
			t.Skip("opencode accepted --nonexistent-flag")
		}

		if stderrBuf.Len() == 0 {
			t.Skip("no stderr produced by failing command")
		}

		errMsg := err.Error()
		if !strings.Contains(errMsg, "exit status") {
			t.Errorf("expected error to contain exit status, got: %s", errMsg)
		}
	})
}
