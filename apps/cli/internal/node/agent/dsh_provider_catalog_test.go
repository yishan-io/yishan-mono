package agent

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

func TestMapDSHProviderCatalog_DoesNotTreatAmbientRouteAsConfigured(t *testing.T) {
	catalog := dsh.ProviderCatalog{Providers: []dsh.ProviderCatalogProvider{
		{ID: "deepseek-official", Authentication: "api-key", SetupRequired: false, Models: []dsh.ProviderCatalogModel{}},
		{ID: "anthropic", Authentication: "api-key", SetupRequired: false, Models: []dsh.ProviderCatalogModel{}},
		{ID: "amazon-bedrock", Authentication: "ambient", SetupRequired: false, Models: []dsh.ProviderCatalogModel{}},
		{ID: "google-vertex", Authentication: "ambient", SetupRequired: true, Models: []dsh.ProviderCatalogModel{}},
	}}

	mapped := mapDSHProviderCatalog(catalog, map[string]struct{}{"DEEPSEEK_API_KEY": {}})
	configured := map[string]bool{}
	for _, provider := range mapped.Providers {
		configured[provider.ID] = provider.Configured
	}
	want := map[string]bool{
		"deepseek-official": true,
		"anthropic":         false,
		"amazon-bedrock":    false,
		"google-vertex":     false,
	}
	for providerID, isConfigured := range want {
		if configured[providerID] != isConfigured {
			t.Fatalf("configured[%q] = %t, want %t", providerID, configured[providerID], isConfigured)
		}
	}
}

func TestMapDSHProviderCatalog_ExposesOnlySafeConfigurationMetadata(t *testing.T) {
	catalog := dsh.ProviderCatalog{Providers: []dsh.ProviderCatalogProvider{
		{ID: "deepseek-official", Authentication: "api-key", Models: []dsh.ProviderCatalogModel{{ID: "deepseek-v4", Name: "DeepSeek V4"}}},
		{ID: "amazon-bedrock", Authentication: "ambient", Models: []dsh.ProviderCatalogModel{{ID: "nova", Name: "Nova"}}},
	}}
	mapped := mapDSHProviderCatalog(catalog, map[string]struct{}{"DEEPSEEK_API_KEY": {}})
	if len(mapped.Providers) != 2 {
		t.Fatalf("providers = %#v", mapped.Providers)
	}
	apiKey := mapped.Providers[0]
	if apiKey.DisplayName != "DeepSeek" || apiKey.CredentialRef != "DEEPSEEK_API_KEY" || !apiKey.Configured {
		t.Fatalf("api-key provider = %#v", apiKey)
	}
	ambient := mapped.Providers[1]
	if ambient.CredentialRef != "" || ambient.Configured || ambient.SetupRequired {
		t.Fatalf("ambient provider = %#v", ambient)
	}
	if ambient.SetupStatus != dshSetupStatusAmbient || ambient.SetupGuidance != "Uses system or cloud credentials configured on this computer." {
		t.Fatalf("ambient setup metadata = %#v", ambient)
	}
}

type providerCatalogRuntime struct {
	*executionDSH
	catalog dsh.ProviderCatalog
}

func (r providerCatalogRuntime) ListProviderCatalog(context.Context) (dsh.ProviderCatalog, error) {
	return r.catalog, nil
}

type providerCredentialStore struct{ refs []string }

func (s providerCredentialStore) List() ([]string, error) { return s.refs, nil }
func (providerCredentialStore) Save(string, string) error { return nil }
func (providerCredentialStore) Remove(string) error       { return nil }

func TestService_DSHListProviders_ReturnsRPCDTO(t *testing.T) {
	service := NewService(Deps{DSH: providerCatalogRuntime{executionDSH: &executionDSH{}, catalog: dsh.ProviderCatalog{Providers: []dsh.ProviderCatalogProvider{{ID: "deepseek-official", Authentication: "api-key", Models: []dsh.ProviderCatalogModel{}}}}}, DSHCredentials: providerCredentialStore{}})
	result, err := service.DSHListProviders(context.Background())
	if err != nil {
		t.Fatalf("DSHListProviders: %v", err)
	}
	catalog, ok := result.(rpc.DSHProviderCatalogResult)
	if !ok || len(catalog.Providers) != 1 || catalog.Providers[0].CredentialRef != "DEEPSEEK_API_KEY" {
		t.Fatalf("result = %#v", result)
	}
}
