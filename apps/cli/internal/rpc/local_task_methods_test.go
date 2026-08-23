package rpc

import "testing"

func TestLocalTaskMethodNames_AreStable(t *testing.T) {
	tests := map[string]string{
		"context details":    MethodLocalTaskGetContextDetails,
		"update link status": MethodLocalTaskUpdateWorkspaceLinkStatus,
		"list tags":          MethodLocalTaskListTags,
		"list tag catalog":   MethodLocalTaskListTagCatalog,
		"update tag color":   MethodLocalTaskUpdateTagColor,
	}
	want := map[string]string{
		"context details":    "localTask.getContextDetails",
		"update link status": "localTask.updateWorkspaceLinkStatus",
		"list tags":          "localTask.listTags",
		"list tag catalog":   "localTask.listTagCatalog",
		"update tag color":   "localTask.updateTagColor",
	}
	for name, method := range tests {
		if method != want[name] {
			t.Fatalf("%s method = %q, want %q", name, method, want[name])
		}
	}
}
