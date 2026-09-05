package notification

import "testing"

func TestBuildLifecyclePayload_FormatsProductLifecycleEvents(t *testing.T) {
	cases := []struct {
		name  string
		input LifecycleInput
		want  map[string]any
	}{
		{
			name:  "hook start",
			input: LifecycleInput{ID: "hook-1", CreatedAt: "2026-09-02T00:00:00Z", Agent: "pi", WorkspaceID: "workspace", ObserverEventType: "start", SessionKey: "workspace:tab:pane", Silent: true},
			want:  map[string]any{"id": "hook-1", "title": "Run Started", "body": "Workspace workspace is running.", "tone": "success", "createdAt": "2026-09-02T00:00:00Z", "agent": "pi", "workspaceId": "workspace", "silent": true, "observerStatus": map[string]string{"normalizedEventType": "start", "sessionKey": "workspace:tab:pane"}},
		},
		{
			name:  "DSH input required",
			input: LifecycleInput{ID: "dsh-2", CreatedAt: "2026-09-02T00:00:01Z", Agent: "dsh", WorkspaceID: "workspace", ObserverEventType: "wait_input", SessionKey: "workspace:tab:pane", Silent: false, NotificationEventType: "pending-question"},
			want:  map[string]any{"id": "dsh-2", "title": "Input Required", "body": "Workspace workspace is waiting for your approval or input.", "tone": "error", "createdAt": "2026-09-02T00:00:01Z", "agent": "dsh", "workspaceId": "workspace", "silent": false, "observerStatus": map[string]string{"normalizedEventType": "wait_input", "sessionKey": "workspace:tab:pane"}, "notificationEventType": "pending-question"},
		},
		{
			name:  "completed",
			input: LifecycleInput{ID: "dsh-3", CreatedAt: "2026-09-02T00:00:02Z", Agent: "dsh", WorkspaceID: "workspace", ObserverEventType: "stop", SessionKey: "workspace:tab:pane", NotificationEventType: "run-finished"},
			want:  map[string]any{"id": "dsh-3", "title": "Run Completed", "body": "Workspace workspace has completed successfully.", "tone": "success", "createdAt": "2026-09-02T00:00:02Z", "agent": "dsh", "workspaceId": "workspace", "silent": false, "observerStatus": map[string]string{"normalizedEventType": "stop", "sessionKey": "workspace:tab:pane"}, "notificationEventType": "run-finished"},
		},
		{
			name:  "failed",
			input: LifecycleInput{ID: "dsh-4", CreatedAt: "2026-09-02T00:00:03Z", Agent: "dsh", WorkspaceID: "workspace", ObserverEventType: "stop", SessionKey: "workspace:tab:pane", NotificationEventType: "run-failed"},
			want:  map[string]any{"id": "dsh-4", "title": "Run Failed", "body": "Workspace workspace has stopped with an error.", "tone": "error", "createdAt": "2026-09-02T00:00:03Z", "agent": "dsh", "workspaceId": "workspace", "silent": false, "observerStatus": map[string]string{"normalizedEventType": "stop", "sessionKey": "workspace:tab:pane"}, "notificationEventType": "run-failed"},
		},
		{
			name:  "silent stop",
			input: LifecycleInput{ID: "dsh-5", CreatedAt: "2026-09-02T00:00:04Z", Agent: "dsh", WorkspaceID: "workspace", ObserverEventType: "stop", SessionKey: "workspace:tab:pane", Silent: true},
			want:  map[string]any{"id": "dsh-5", "title": "Run Stopped", "body": "Workspace workspace is no longer active.", "tone": "success", "createdAt": "2026-09-02T00:00:04Z", "agent": "dsh", "workspaceId": "workspace", "silent": true, "observerStatus": map[string]string{"normalizedEventType": "stop", "sessionKey": "workspace:tab:pane"}},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := BuildLifecyclePayload(testCase.input); !mapsEqual(got, testCase.want) {
				t.Fatalf("BuildLifecyclePayload() = %#v, want %#v", got, testCase.want)
			}
		})
	}
}

func mapsEqual(got, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for key, wantValue := range want {
		gotValue, exists := got[key]
		if !exists || !valuesEqual(gotValue, wantValue) {
			return false
		}
	}
	return true
}

func valuesEqual(got, want any) bool {
	gotMap, gotIsMap := got.(map[string]string)
	wantMap, wantIsMap := want.(map[string]string)
	if gotIsMap || wantIsMap {
		return gotIsMap && wantIsMap && len(gotMap) == len(wantMap) && gotMap["normalizedEventType"] == wantMap["normalizedEventType"] && gotMap["sessionKey"] == wantMap["sessionKey"]
	}
	return got == want
}
