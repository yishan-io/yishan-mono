package cmd

import (
	"testing"

	setup "yishan/apps/cli/internal/agent/setup"
)

func TestRenderSetupStateIncludesExtensionResource(t *testing.T) {
	renderData := renderSetupState(&setup.InstalledState{
		Extension: setup.ExtensionState{
			Installed:  true,
			Extensions: []string{"@yishan-io/pi-notify", "@yishan-io/pi-subagents", "@yishan-io/pi-ask"},
		},
	})

	if len(renderData.Rows) == 0 {
		t.Fatal("expected setup state rows")
	}
	if renderData.Rows[0]["resource"] != "extension" {
		t.Fatalf("expected first resource to be extension, got %#v", renderData.Rows[0]["resource"])
	}
	if renderData.Rows[0]["details"] != "@yishan-io/pi-notify, @yishan-io/pi-subagents, @yishan-io/pi-ask" {
		t.Fatalf("unexpected extension details %#v", renderData.Rows[0]["details"])
	}
}
