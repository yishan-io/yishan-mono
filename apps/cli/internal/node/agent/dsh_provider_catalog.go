package agent

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

const (
	dshSetupStatusReady           = "ready"
	dshSetupStatusNeedsCredential = "needs-credential"
	dshSetupStatusAmbient         = "ambient"
)

// DSHProviderCatalog is the optional safe provider-discovery capability of a DSH runtime.
type DSHProviderCatalog interface {
	ListProviderCatalog(context.Context) (dsh.ProviderCatalog, error)
}

// DSHListProviders returns only selectable catalog metadata, never credentials or local configuration.
func (s *Service) DSHListProviders(ctx context.Context) (any, error) {
	runtime, ok := s.deps.DSH.(DSHProviderCatalog)
	if !ok {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh provider catalog unavailable")
	}
	catalog, err := runtime.ListProviderCatalog(ctx)
	if err != nil {
		return nil, mapDSHExecutionError(err)
	}
	credentialRefs, err := s.listDSHCredentialRefs()
	if err != nil {
		return nil, err
	}
	return mapDSHProviderCatalog(catalog, credentialRefs), nil
}

func (s *Service) listDSHCredentialRefs() (map[string]struct{}, error) {
	if s.deps.DSHCredentials == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "dsh credentials store unavailable")
	}
	refs, err := s.deps.DSHCredentials.List()
	if err != nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "list dsh credentials: "+err.Error())
	}
	result := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		result[ref] = struct{}{}
	}
	return result, nil
}

func mapDSHProviderCatalog(catalog dsh.ProviderCatalog, credentialRefs map[string]struct{}) rpc.DSHProviderCatalogResult {
	providers := make([]rpc.DSHProviderCatalogEntry, 0, len(catalog.Providers))
	for _, provider := range catalog.Providers {
		entry := rpc.DSHProviderCatalogEntry{ID: provider.ID, DisplayName: dshProviderDisplayName(provider.ID), Authentication: provider.Authentication}
		if provider.Authentication == "api-key" {
			entry.CredentialRef = dshProviderCredentialRef(provider.ID)
			_, entry.Configured = credentialRefs[entry.CredentialRef]
			entry.SetupRequired = !entry.Configured
			entry.SetupStatus = dshSetupStatusNeedsCredential
			entry.SetupGuidance = "Add an API key to use this provider."
			if entry.Configured {
				entry.SetupStatus = dshSetupStatusReady
				entry.SetupGuidance = "API key configured."
			}
		} else {
			// Ambient credentials are intentionally not inspected or exposed.
			entry.SetupStatus = dshSetupStatusAmbient
			entry.SetupGuidance = "Uses system or cloud credentials configured on this computer."
		}
		entry.Models = make([]rpc.DSHProviderCatalogModel, 0, len(provider.Models))
		for _, model := range provider.Models {
			entry.Models = append(entry.Models, rpc.DSHProviderCatalogModel{ID: model.ID, Name: model.Name})
		}
		providers = append(providers, entry)
	}
	return rpc.DSHProviderCatalogResult{Providers: providers}
}

func dshProviderDisplayName(providerID string) string {
	if name, ok := dshProviderNames[providerID]; ok {
		return name
	}
	return strings.ReplaceAll(providerID, "-", " ")
}

var dshProviderNames = map[string]string{
	"deepseek-official": "DeepSeek", "deepseek": "DeepSeek", "ant-ling": "Ant Ling", "anthropic": "Anthropic",
	"azure-openai-responses": "Azure OpenAI Responses", "cerebras": "Cerebras", "fireworks": "Fireworks",
	"github-copilot": "GitHub Copilot", "google": "Google Gemini", "groq": "Groq", "huggingface": "Hugging Face",
	"kimi-coding": "Kimi For Coding", "minimax": "MiniMax", "minimax-cn": "MiniMax (China)", "mistral": "Mistral",
	"moonshotai": "Moonshot AI", "moonshotai-cn": "Moonshot AI (China)", "nvidia": "NVIDIA NIM", "openai": "OpenAI",
	"opencode": "OpenCode Zen", "opencode-go": "OpenCode Go", "openrouter": "OpenRouter", "qwen-token-plan": "Qwen Token Plan",
	"qwen-token-plan-cn": "Qwen Token Plan (China)", "together": "Together AI", "vercel-ai-gateway": "Vercel AI Gateway",
	"xai": "xAI", "xiaomi": "Xiaomi MiMo", "xiaomi-token-plan-ams": "Xiaomi MiMo (Amsterdam)",
	"xiaomi-token-plan-cn": "Xiaomi MiMo (China)", "xiaomi-token-plan-sgp": "Xiaomi MiMo (Singapore)", "zai": "ZAI Coding Plan (Global)", "zai-coding-cn": "ZAI Coding Plan (China)",
	"amazon-bedrock": "Amazon Bedrock", "cloudflare-ai-gateway": "Cloudflare AI Gateway", "cloudflare-workers-ai": "Cloudflare Workers AI", "google-vertex": "Google Vertex AI",
}

func dshProviderCredentialRef(provider string) string {
	if ref, ok := dshProviderCredentialRefs[provider]; ok {
		return ref
	}
	return ""
}

var dshProviderCredentialRefs = map[string]string{
	"deepseek-official": "DEEPSEEK_API_KEY", "deepseek": "DEEPSEEK_API_KEY", "ant-ling": "ANT_LING_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "azure-openai-responses": "AZURE_OPENAI_API_KEY", "cerebras": "CEREBRAS_API_KEY", "fireworks": "FIREWORKS_API_KEY", "github-copilot": "COPILOT_GITHUB_TOKEN", "google": "GEMINI_API_KEY", "groq": "GROQ_API_KEY", "huggingface": "HF_TOKEN", "kimi-coding": "KIMI_API_KEY", "minimax": "MINIMAX_API_KEY", "minimax-cn": "MINIMAX_CN_API_KEY", "mistral": "MISTRAL_API_KEY", "moonshotai": "MOONSHOT_API_KEY", "moonshotai-cn": "MOONSHOT_API_KEY", "nvidia": "NVIDIA_API_KEY", "openai": "OPENAI_API_KEY", "opencode": "OPENCODE_API_KEY", "opencode-go": "OPENCODE_API_KEY", "openrouter": "OPENROUTER_API_KEY", "qwen-token-plan": "QWEN_TOKEN_PLAN_API_KEY", "qwen-token-plan-cn": "QWEN_TOKEN_PLAN_CN_API_KEY", "together": "TOGETHER_API_KEY", "vercel-ai-gateway": "AI_GATEWAY_API_KEY", "xai": "XAI_API_KEY", "xiaomi": "XIAOMI_API_KEY", "xiaomi-token-plan-ams": "XIAOMI_TOKEN_PLAN_AMS_API_KEY", "xiaomi-token-plan-cn": "XIAOMI_TOKEN_PLAN_CN_API_KEY", "xiaomi-token-plan-sgp": "XIAOMI_TOKEN_PLAN_SGP_API_KEY", "zai": "ZAI_API_KEY", "zai-coding-cn": "ZAI_CODING_CN_API_KEY",
}
