package daemon

import "testing"

func TestIsGitMethod_IncludesPullRequestMethods(t *testing.T) {
	t.Parallel()

	if !isGitMethod(MethodGitPrMerge) {
		t.Fatalf("expected %q to be treated as git method", MethodGitPrMerge)
	}

	if !isGitMethod(MethodGitPrClose) {
		t.Fatalf("expected %q to be treated as git method", MethodGitPrClose)
	}
}

func TestIsGitMethod_IncludesInspectPath(t *testing.T) {
	t.Parallel()

	if !isGitMethod(MethodGitInspectPath) {
		t.Fatalf("expected %q to be treated as git method", MethodGitInspectPath)
	}
}
