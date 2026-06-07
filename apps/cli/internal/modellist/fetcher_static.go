package modellist

type staticFetcher struct {
	agentKind string
	models    []ModelInfo
}

func (f staticFetcher) AgentKind() string { return f.agentKind }

func (f staticFetcher) Fetch() ([]ModelInfo, error) {
	return f.models, nil
}

func newStaticFetcher(agentKind string, modelIDs []string) staticFetcher {
	models := make([]ModelInfo, 0, len(modelIDs))
	seen := make(map[string]struct{}, len(modelIDs))
	for _, id := range modelIDs {
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		models = append(models, ModelInfo{ID: id, Name: id})
	}
	return staticFetcher{agentKind: agentKind, models: models}
}

var claudeStaticModels = []string{
	"claude-sonnet-4-6",
	"claude-opus-4-8",
	"claude-opus-4-7",
	"claude-haiku-4-5-20251001",
	"claude-opus-4-6",
	"claude-sonnet-4-5",
}

var codexStaticModels = []string{
	"gpt-5.5",
	"gpt-5.5-mini",
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.3-codex",
	"gpt-5",
	"o3",
	"o3-mini",
}

var geminiStaticModels = []string{
	"auto",
	"auto-gemini-2.5",
	"pro",
	"flash",
	"flash-lite",
	"gemini-3-pro-preview",
	"gemini-3-flash-preview",
	"gemini-2.5-pro",
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
}

var piStaticModels = []string{
	"openai-codex/gpt-5.5",
	"openai-codex/gpt-5.4",
	"openai-codex/gpt-5.3-codex",
	"openai-codex/gpt-5.2",
	"google/gemini-2.5-flash",
	"google/gemini-2.5-pro",
	"anthropic/claude-sonnet-4-6",
	"anthropic/claude-opus-4-8",
}

var copilotStaticModels = []string{
	"gpt-5.5",
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.3-codex",
	"gpt-5.2-codex",
	"gpt-5.2",
	"gpt-5-mini",
	"gpt-4.1",
	"claude-opus-4.7",
	"claude-sonnet-4.6",
	"claude-sonnet-4.5",
	"claude-haiku-4.5",
}

var cursorStaticModels = []string{
	"auto",
}
