package rpc

import "testing"

func TestLocalTaskMethodNames_AreStable(t *testing.T) {
	tests := map[string]string{
		"details":            MethodLocalTaskGetDetails,
		"list projection":    MethodLocalTaskListProjection,
		"context details":    MethodLocalTaskGetContextDetails,
		"update link status": MethodLocalTaskUpdateWorkspaceLinkStatus,
		"list tags":          MethodLocalTaskListTags,
		"list tag catalog":   MethodLocalTaskListTagCatalog,
		"update tag color":   MethodLocalTaskUpdateTagColor,
		"create tag":         MethodLocalTaskCreateTag,
		"rename tag":         MethodLocalTaskRenameTag,
		"delete tag":         MethodLocalTaskDeleteTag,
	}
	want := map[string]string{
		"details":            "localTask.getDetails",
		"list projection":    "localTask.listProjection",
		"context details":    "localTask.getContextDetails",
		"update link status": "localTask.updateWorkspaceLinkStatus",
		"list tags":          "localTask.listTags",
		"list tag catalog":   "localTask.listTagCatalog",
		"update tag color":   "localTask.updateTagColor",
		"create tag":         "localTask.createTag",
		"rename tag":         "localTask.renameTag",
		"delete tag":         "localTask.deleteTag",
	}
	for name, method := range tests {
		if method != want[name] {
			t.Fatalf("%s method = %q, want %q", name, method, want[name])
		}
	}
}
