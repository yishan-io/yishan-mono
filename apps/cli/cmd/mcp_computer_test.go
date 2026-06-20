package cmd

import "testing"

func TestFindMatchingNode(t *testing.T) {
	t.Parallel()

	tree := map[string]any{
		"id":    "root",
		"role":  "AXWindow",
		"title": "Terminal",
		"children": []any{
			map[string]any{
				"id":    "child-1",
				"role":  "AXButton",
				"title": "Save",
				"value": "",
			},
		},
	}

	node := findMatchingNode(tree, "AXButton", "Save", "")
	if node == nil || stringValue(node["id"]) != "child-1" {
		t.Fatalf("expected to find button node, got %#v", node)
	}
}

func TestMatchesNodeRequiresAtLeastOneCriterion(t *testing.T) {
	t.Parallel()

	if matchesNode(map[string]any{"role": "AXButton"}, "", "", "") {
		t.Fatal("expected empty criteria to fail")
	}
}
