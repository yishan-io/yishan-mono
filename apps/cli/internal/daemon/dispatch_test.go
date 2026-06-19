package daemon

import (
	"strings"
	"testing"
)

func TestDispatch_NamespaceRouting(t *testing.T) {
	t.Parallel()

	gitMethods := []string{MethodGitPrMerge, MethodGitPrClose, MethodGitInspectPath}
	for _, method := range gitMethods {
		ns, _, found := strings.Cut(method, ".")
		if !found || ns != "git" {
			t.Fatalf("expected %q to route to git namespace", method)
		}
	}

	nonGitMethods := []string{"list", MethodWorkspaceCreate, MethodTerminalStart}
	for _, method := range nonGitMethods {
		ns, _, found := strings.Cut(method, ".")
		if found && ns == "git" {
			t.Fatalf("expected %q NOT to route to git namespace", method)
		}
	}
}
