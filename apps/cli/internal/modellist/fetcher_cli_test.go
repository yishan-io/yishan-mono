package modellist

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
)

func writeFakeCLIBin(t *testing.T, dir, name, output string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	script := "#!/bin/sh\nprintf '%s\\n' \"" + output + "\"\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}
	return path
}

func TestResolveCLIBinaryFindsBinaryFromEnv(t *testing.T) {
	tmpDir := t.TempDir()
	fakePi := writeFakeCLIBin(t, tmpDir, "pi", "fake-provider/fake-model")
	env := []string{"PATH=" + tmpDir}

	path, err := resolveCLIBinary("pi", env)
	if err != nil {
		t.Fatalf("resolveCLIBinary() error = %v", err)
	}
	if path != fakePi {
		t.Fatalf("resolveCLIBinary() = %q, want %q", path, fakePi)
	}
}

func TestResolveCLIBinaryMissingFromEnv(t *testing.T) {
	tmpDir := t.TempDir()
	env := []string{"PATH=" + tmpDir}

	_, err := resolveCLIBinary("pi", env)
	if err == nil {
		t.Fatal("resolveCLIBinary() expected error for missing binary")
	}
	if !strings.Contains(err.Error(), "pi not found in resolved PATH") {
		t.Fatalf("resolveCLIBinary() error = %v, want missing-binary message", err)
	}
}

// Regression test for the GUI-launched daemon model list bug: exec.Command
// resolves bare binary names against the process PATH at construction time
// (cached in Cmd.Err), so a minimal process PATH made the pi fetch fail with
// "executable file not found in $PATH" even though isolateCmd enriched the
// subprocess env afterwards. The fetcher must resolve the binary to an
// absolute path through the enriched env first. Here the process PATH is
// stripped of pi while the enriched env (injected like the login shell would
// provide) contains a fake pi; the fetch must still run it.
func TestPiFetcherFetchFromResolvedPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake shell script binaries are unix-only")
	}

	tmpBin := t.TempDir()
	writeFakeCLIBin(t, tmpBin, "pi", "fake-provider/fake-model")
	t.Setenv("PATH", t.TempDir()) // process PATH contains no pi

	origEnvFn := enrichedCLIEnv
	enrichedCLIEnv = func() []string { return []string{"PATH=" + tmpBin} }
	t.Cleanup(func() { enrichedCLIEnv = origEnvFn })

	f := piFetcher{}
	models, err := f.Fetch()
	if err != nil {
		t.Fatalf("piFetcher.Fetch() error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("piFetcher.Fetch() models = %v, want 1", models)
	}
	if models[0].ID != "fake-provider/fake-model" {
		t.Fatalf("piFetcher.Fetch() model id = %q, want fake-provider/fake-model", models[0].ID)
	}
}

// The chat tab's pi session is started with PI_CODING_AGENT_DIR set (see
// buildPiStartExtraEnv); pi's model listing changes based on that var, so the
// model-list fetch must inject it too or the memory settings list would not
// match the chat tab's available models.
func TestPiFetcherSetsPiAgentDirEnv(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake shell script binaries are unix-only")
	}

	tmpBin := t.TempDir()
	envDump := filepath.Join(t.TempDir(), "env.txt")
	script := "#!/bin/sh\nprintf '%s\\n' \"$PI_CODING_AGENT_DIR\" > " + envDump + "\nprintf '%s\\n' fake-provider/fake-model\n"
	if err := os.WriteFile(filepath.Join(tmpBin, "pi"), []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi: %v", err)
	}
	t.Setenv("PATH", t.TempDir())

	origEnvFn := enrichedCLIEnv
	enrichedCLIEnv = func() []string { return []string{"PATH=" + tmpBin} }
	t.Cleanup(func() { enrichedCLIEnv = origEnvFn })

	if _, err := (piFetcher{}).Fetch(); err != nil {
		t.Fatalf("piFetcher.Fetch() error = %v", err)
	}
	raw, err := os.ReadFile(envDump)
	if err != nil {
		t.Fatalf("read env dump: %v", err)
	}
	wantAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		t.Fatalf("ManagedPiAgentDir() error = %v", err)
	}
	if got := strings.TrimSpace(string(raw)); got != wantAgentDir {
		t.Fatalf("PI_CODING_AGENT_DIR = %q, want %q", got, wantAgentDir)
	}
}

func TestParsePiModelsTableFormat(t *testing.T) {
	raw := `provider        model                                               context  max-out  thinking  images
openrouter      openai/gpt-5                                        128K     64K      yes       yes
openrouter      deepseek/deepseek-chat                              128K     64K      yes       yes
amazon-bedrock  amazon.nova-lite-v1:0                               300K     8.2K     no        yes
`
	models := parsePiModels(raw)
	if len(models) != 3 {
		t.Fatalf("parsePiModels() = %d models, want 3: %v", len(models), models)
	}
	want := []string{
		"amazon-bedrock/amazon.nova-lite-v1:0",
		"openrouter/deepseek/deepseek-chat",
		"openrouter/openai/gpt-5",
	}
	for i, id := range want {
		if models[i].ID != id {
			t.Errorf("models[%d].ID = %q, want %q", i, models[i].ID, id)
		}
	}
	if models[0].Reasoning {
		t.Errorf("models[0].Reasoning = true, want false (thinking column no)")
	}
	if !models[2].Reasoning {
		t.Errorf("models[2].Reasoning = false, want true (thinking column yes)")
	}
}

func TestApplyPiModelCapabilitiesMergesModelsStore(t *testing.T) {
	agentDir := t.TempDir()
	store := `{
  "deepseek": {
    "models": [
      {"id": "deepseek-v4-flash", "reasoning": true, "thinkingLevelMap": {"minimal": null, "low": null, "medium": null, "high": "high", "max": "max"}},
      {"id": "deepseek-v4-pro", "thinkingLevelMap": {"high": "high"}}
    ]
  }
}`
	if err := os.WriteFile(filepath.Join(agentDir, "models-store.json"), []byte(store), 0o644); err != nil {
		t.Fatalf("write models-store.json: %v", err)
	}

	models := []ModelInfo{
		{ID: "deepseek/deepseek-v4-flash", Name: "deepseek-v4-flash"},              // store reasoning true overrides
		{ID: "deepseek/deepseek-v4-pro", Name: "deepseek-v4-pro", Reasoning: true}, // store omits reasoning: column value preserved
		{ID: "openrouter/openai/gpt-5", Name: "openai/gpt-5", Reasoning: true},     // absent from store: keeps column value
	}
	applyPiModelCapabilities(models, agentDir)

	if !models[0].Reasoning {
		t.Errorf("models[0].Reasoning = false, want store reasoning true")
	}
	if models[0].ThinkingLevelMap == nil || models[0].ThinkingLevelMap["medium"] != nil {
		t.Errorf("models[0].ThinkingLevelMap = %v, want medium mapped to nil (unsupported)", models[0].ThinkingLevelMap)
	}
	if models[0].ThinkingLevelMap["high"] == nil || *models[0].ThinkingLevelMap["high"] != "high" {
		t.Errorf("models[0].ThinkingLevelMap[high] = %v, want \"high\"", models[0].ThinkingLevelMap["high"])
	}
	if !models[1].Reasoning {
		t.Errorf("models[1].Reasoning = false, want column-derived true preserved when the store entry omits reasoning")
	}
	if models[1].ThinkingLevelMap == nil || models[1].ThinkingLevelMap["high"] == nil || *models[1].ThinkingLevelMap["high"] != "high" {
		t.Errorf("models[1].ThinkingLevelMap = %v, want map merged from the store entry", models[1].ThinkingLevelMap)
	}
	if models[2].ThinkingLevelMap != nil {
		t.Errorf("models[2].ThinkingLevelMap = %v, want nil (no store entry)", models[2].ThinkingLevelMap)
	}
	if !models[2].Reasoning {
		t.Errorf("models[2].Reasoning = false, want column-derived true preserved")
	}
}

func TestApplyPiModelCapabilitiesMissingStoreKeepsColumn(t *testing.T) {
	models := []ModelInfo{{ID: "deepseek/deepseek-v4-flash", Name: "deepseek-v4-flash", Reasoning: true}}
	applyPiModelCapabilities(models, t.TempDir())
	if !models[0].Reasoning {
		t.Errorf("models[0].Reasoning = false, want column-derived true kept without a store")
	}
	if models[0].ThinkingLevelMap != nil {
		t.Errorf("models[0].ThinkingLevelMap = %v, want nil without a store", models[0].ThinkingLevelMap)
	}
}

func TestSplitModelID(t *testing.T) {
	for _, tc := range []struct {
		id       string
		provider string
		key      string
		ok       bool
	}{
		{id: "deepseek/deepseek-v4-flash", provider: "deepseek", key: "deepseek-v4-flash", ok: true},
		{id: "openrouter/deepseek/deepseek-v4-flash", provider: "openrouter", key: "deepseek/deepseek-v4-flash", ok: true},
		{id: "openrouter/~anthropic/claude-fable-latest", provider: "openrouter", key: "~anthropic/claude-fable-latest", ok: true},
		{id: "no-slash", ok: false},
		{id: "/leading", ok: false},
		{id: "trailing/", ok: false},
	} {
		provider, key, ok := splitModelID(tc.id)
		if ok != tc.ok || provider != tc.provider || key != tc.key {
			t.Errorf("splitModelID(%q) = (%q, %q, %v), want (%q, %q, %v)", tc.id, provider, key, ok, tc.provider, tc.key, tc.ok)
		}
	}
}

func TestParsePiModelsSkipsNoise(t *testing.T) {
	raw := `
warning: some warning text
error: some error text
info: some info text
no models match pattern "xyz"
openrouter openai/gpt-5
`
	models := parsePiModels(raw)
	if len(models) != 1 {
		t.Fatalf("parsePiModels() = %v, want only the model line", models)
	}
	if models[0].ID != "openrouter/openai/gpt-5" {
		t.Fatalf("parsePiModels()[0].ID = %q, want openrouter/openai/gpt-5", models[0].ID)
	}
}

// The merged single-field branch ("provider:model" in one column) is not
// emitted by current pi, but keep it working and pin its column offset for
// the thinking flag.
func TestParsePiModelsMergedProviderModelColumn(t *testing.T) {
	raw := `provider model context max-out thinking images
openrouter:openai/gpt-5 128K 64K yes yes
`
	models := parsePiModels(raw)
	if len(models) != 1 {
		t.Fatalf("parsePiModels() = %v, want 1 model", models)
	}
	if models[0].ID != "openrouter/openai/gpt-5" {
		t.Fatalf("models[0].ID = %q, want openrouter/openai/gpt-5", models[0].ID)
	}
	if !models[0].Reasoning {
		t.Errorf("models[0].Reasoning = false, want true (merged-column thinking field)")
	}
}

func TestParsePiModelsEmpty(t *testing.T) {
	if models := parsePiModels(""); len(models) != 0 {
		t.Fatalf("parsePiModels(\"\") = %v, want empty", models)
	}
	if models := parsePiModels("provider model context\n"); len(models) != 0 {
		t.Fatalf("parsePiModels(header only) = %v, want empty", models)
	}
}
