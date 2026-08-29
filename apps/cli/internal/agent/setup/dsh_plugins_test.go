package setup

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/agent/dsh/plugins"
)

func TestListOfficialDSHPluginBundles_ReturnsNoUpstreamBundlesWithoutAuditedAdaptations(t *testing.T) {
	if catalog := ListOfficialDSHPluginBundles(); len(catalog) != 0 {
		t.Fatalf("catalog = %#v, want no unaudited upstream bundles", catalog)
	}
}

func TestInstallDSHPluginBundle_RejectsNonBundleAdapter(t *testing.T) {
	_, err := InstallDSHPluginBundle(context.Background(), t.TempDir(), "@deepseek-ai/dsh-llm-deepseek")
	if !errors.Is(err, plugins.ErrBundleNotAllowed) {
		t.Fatalf("install error = %v, want daemon catalog rejection", err)
	}
}
