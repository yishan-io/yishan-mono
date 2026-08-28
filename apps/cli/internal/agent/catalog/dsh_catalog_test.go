package catalog

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
)

type testRuntimeCatalog struct {
	catalog dsh.ProviderCatalog
	err     error
	calls   int
}

func (s *testRuntimeCatalog) ListProviderCatalog(context.Context) (dsh.ProviderCatalog, error) {
	s.calls++
	return s.catalog, s.err
}

func TestService_ListDSHModels_UsesRuntimeProviderQualifiedRoutes(t *testing.T) {
	source := &testRuntimeCatalog{catalog: dsh.ProviderCatalog{Providers: []dsh.ProviderCatalogProvider{{
		ID: "anthropic", Authentication: "api-key", SetupRequired: true,
		Models: []dsh.ProviderCatalogModel{{Provider: "anthropic", ID: "claude", Name: "Claude"}},
	}}}}
	service := NewService(source)
	models, err := service.ListModelsContext(context.Background(), "dsh", false)
	if err != nil {
		t.Fatalf("ListModelsContext: %v", err)
	}
	if len(models.Models) != 1 || models.Models[0].Provider != "anthropic" || models.Models[0].ID != "claude" || models.Source != "runtime" {
		t.Fatalf("models = %#v", models)
	}
	_, err = service.ListModelsContext(context.Background(), "dsh", false)
	if err != nil || source.calls != 1 {
		t.Fatalf("cached catalog calls = %d, err = %v", source.calls, err)
	}
}

func TestService_ListDSHModels_FailsWithoutInventedFallback(t *testing.T) {
	service := NewService(&testRuntimeCatalog{err: errors.New("runtime stopped")})
	_, err := service.ListModelsContext(context.Background(), "dsh", false)
	if err == nil {
		t.Fatal("returned a static DSH catalog after runtime failure")
	}
}

func TestService_ListAllModels_IncludesRuntimeDSHCatalog(t *testing.T) {
	service := NewService(&testRuntimeCatalog{catalog: dsh.ProviderCatalog{Providers: []dsh.ProviderCatalogProvider{}}})
	for _, list := range service.ListAllModelsContext(context.Background(), false) {
		if list.AgentKind == "dsh" {
			if list.Source != "runtime" {
				t.Fatalf("DSH source = %q", list.Source)
			}
			return
		}
	}
	t.Fatal("all-model response omitted DSH")
}
