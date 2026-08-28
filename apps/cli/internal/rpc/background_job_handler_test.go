package rpc

import (
	"context"
	"encoding/json"
	"testing"
)

type recordingBackgroundJobs struct{ creates int }

func (s *recordingBackgroundJobs) Create(context.Context, BackgroundJobCreateParams) (any, error) {
	s.creates++
	return nil, nil
}
func (s *recordingBackgroundJobs) Get(context.Context, BackgroundJobGetParams) (any, error) {
	return nil, nil
}
func (s *recordingBackgroundJobs) List(context.Context, BackgroundJobListParams) (any, error) {
	return nil, nil
}
func (s *recordingBackgroundJobs) Cancel(context.Context, BackgroundJobCancelParams) (any, error) {
	return nil, nil
}

func TestBackgroundJobHandler_RejectsUnknownFields(t *testing.T) {
	service := &recordingBackgroundJobs{}
	handler := BackgroundJobHandler{Services: service}
	for method, params := range map[string]json.RawMessage{
		MethodBackgroundJobCreate: json.RawMessage(`{"workspaceId":"w","prompt":"p","model":"m","cwd":"/caller"}`),
		MethodBackgroundJobGet:    json.RawMessage(`{"workspaceId":"w","jobId":"j","sessionId":"caller"}`),
		MethodBackgroundJobList:   json.RawMessage(`{"workspaceId":"w","runtime":"dsh"}`),
		MethodBackgroundJobCancel: json.RawMessage(`{"workspaceId":"w","jobId":"j","tabId":"caller"}`),
	} {
		_, err := handler.Call(context.Background(), &Connection{}, method, params)
		if err == nil || MapRPCError(err).Code != CodeInvalidParams {
			t.Fatalf("%s error = %v", method, err)
		}
	}
	if service.creates != 0 {
		t.Fatalf("creates = %d", service.creates)
	}
}
