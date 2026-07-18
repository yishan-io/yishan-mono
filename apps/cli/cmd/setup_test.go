package cmd

import (
	"testing"

	setup "yishan/apps/cli/internal/agentsetup"
)

func TestSetupCommandIncludesExtensionSubcommand(t *testing.T) {
	subcommand, _, err := setupCmd.Find([]string{"extension"})
	if err != nil {
		t.Fatalf("find extension subcommand: %v", err)
	}
	if subcommand != setupExtensionCmd {
		t.Fatalf("expected setup extension subcommand, got %q", subcommand.Name())
	}
	if subcommand.Flags().Lookup("remove") == nil {
		t.Fatal("expected setup extension to expose --remove")
	}
}

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
