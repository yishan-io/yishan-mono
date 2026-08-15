// Package archtest enforces the CLI's package dependency contract: domain and
// infrastructure packages must never depend on the daemon transport or the
// composition root, and the transport must never depend on the daemon.
//
// Final dependency contract (architecture/refactor/cli.md Phase 12):
//
//	cmd -> daemon client or application facade
//	daemon -> node.App
//	node.App -> rpc + application services + infrastructure
//	rpc -> application interfaces
//	application -> domain + interfaces
//	infrastructure -> domain
//	domain -> standard library only
package archtest

import (
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// forbiddenEdges maps a source package (prefix match on the import path
// relative to internal/) to target packages it must never import.
var forbiddenEdges = []struct {
	sourcePrefix string
	targets      []string
	reason       string
}{
	{
		sourcePrefix: "workspace",
		targets:      []string{"daemon", "rpc", "agent", "api", "db", "relay", "node"},
		reason:       "the workspace domain depends only on interfaces and infrastructure, never on transport or the composition root",
	},
	{
		sourcePrefix: "rpc",
		targets:      []string{"daemon", "node", "agent"},
		reason:       "the transport depends on application interfaces, never on the daemon",
	},
	{
		sourcePrefix: "files",
		targets:      []string{"daemon", "rpc", "agent", "node"},
		reason:       "file services are standalone infrastructure",
	},
	{
		sourcePrefix: "git",
		targets:      []string{"daemon", "rpc", "agent", "node"},
		reason:       "git services are standalone infrastructure",
	},
	{
		sourcePrefix: "terminal",
		targets:      []string{"daemon", "rpc", "agent", "node"},
		reason:       "terminal services are standalone infrastructure",
	},
	{
		sourcePrefix: "worktree",
		targets:      []string{"daemon", "rpc", "agent", "node"},
		reason:       "worktree provisioning is standalone infrastructure",
	},
	{
		sourcePrefix: "gitexec",
		targets:      []string{"daemon", "rpc", "agent", "node"},
		reason:       "the low-level git adapter is standalone",
	},
	{
		sourcePrefix: "agent",
		targets:      []string{"daemon", "node", "rpc"},
		reason:       "the agent domain does not depend on the daemon transport, the composition root, or the rpc wire types",
	},
	{
		sourcePrefix: "api",
		targets:      []string{"daemon", "rpc", "node", "agent"},
		reason:       "the cloud client is infrastructure",
	},
	{
		sourcePrefix: "db",
		targets:      []string{"daemon", "rpc", "node", "agent"},
		reason:       "the SQLite layer is infrastructure",
	},
	{
		sourcePrefix: "relay",
		targets:      []string{"daemon", "node", "agent"},
		reason:       "relay envelopes and the relay client are infrastructure; the client may use the rpc transport types",
	},
	{
		sourcePrefix: "node",
		targets:      []string{"daemon"},
		reason:       "node.App is the composition root and must not depend on the daemon",
	},
	{
		sourcePrefix: "tokenusage",
		targets:      []string{"daemon", "rpc", "node", "agent"},
		reason:       "token usage collection is application infrastructure and must not depend on transport or the composition root",
	},
	{
		sourcePrefix: "computer",
		targets:      []string{"daemon", "rpc", "node", "agent"},
		reason:       "computer-use is standalone infrastructure",
	},
	{
		sourcePrefix: "memory",
		targets:      []string{"daemon", "rpc", "node", "agent"},
		reason:       "memory services are standalone infrastructure",
	},
	{
		sourcePrefix: "events",
		targets:      []string{"daemon", "rpc", "node", "agent"},
		reason:       "the frontend event hub is standalone infrastructure",
	},
}

// TestForbiddenImports scans every internal package and fails on any import
// edge the contract forbids. It is the architecture test for the CLI-wide
// dependency contract.
func TestForbiddenImports(t *testing.T) {
	root := findModuleRoot(t)
	violations := []string{}

	err := filepath.WalkDir(filepath.Join(root, "internal"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		sourceRel, ok := packagePathRel(root, path)
		if !ok {
			return nil
		}
		for _, importPath := range packageImports(path, t) {
			target, ok := strings.CutPrefix(importPath, "yishan/apps/cli/internal/")
			if !ok {
				continue
			}
			for _, edge := range forbiddenEdges {
				if !strings.HasPrefix(sourceRel, edge.sourcePrefix) {
					continue
				}
				if target == edge.sourcePrefix {
					continue // self-import of the package prefix
				}
				for _, forbidden := range edge.targets {
					if target == forbidden || strings.HasPrefix(target, forbidden+"/") {
						violations = append(violations,
							fmt.Sprintf("%s (%s) imports %s: %s", sourceRel, path, importPath, edge.reason))
					}
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk internal packages: %v", err)
	}

	if len(violations) > 0 {
		t.Fatalf("dependency contract violated:\n%s", strings.Join(violations, "\n"))
	}
}

// findModuleRoot locates the apps/cli module root (the go.mod parent).
func findModuleRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find go.mod")
		}
		dir = parent
	}
}

// packagePathRel derives the package import path (relative to internal/) from
// the file's location under the module root.
func packagePathRel(root string, path string) (string, bool) {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return "", false
	}
	rel = filepath.ToSlash(rel)
	internalIdx := strings.Index(rel, "internal/")
	if internalIdx < 0 {
		return "", false
	}
	return rel[internalIdx+len("internal/"):], true
}

// packageImports parses a go file and returns its import paths.
func packageImports(path string, t *testing.T) []string {
	t.Helper()
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
	if err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	var imports []string
	for _, spec := range file.Imports {
		imports = append(imports, strings.Trim(spec.Path.Value, `"`))
	}
	return imports
}
