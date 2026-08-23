package rpc

import "testing"

func TestLocalTaskMethodNames_AreStable(t *testing.T) {
	tests := map[string]string{
		"context details":    MethodLocalTaskGetContextDetails,
		"update link status": MethodLocalTaskUpdateWorkspaceLinkStatus,
		"list tags":          MethodLocalTaskListTags,
	}
	want := map[string]string{
		"context details":    "localTask.getContextDetails",
		"update link status": "localTask.updateWorkspaceLinkStatus",
		"list tags":          "localTask.listTags",
	}
	for name, method := range tests {
		if method != want[name] {
			t.Fatalf("%s method = %q, want %q", name, method, want[name])
		}
	}
}
