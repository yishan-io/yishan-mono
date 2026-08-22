package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

type recordingLocalTaskService struct {
	calls int
}

func (s *recordingLocalTaskService) called(method string) (any, error) {
	s.calls++
	return method, nil
}

func (s *recordingLocalTaskService) Create(context.Context, LocalTaskCreateParams) (any, error) {
	return s.called(MethodLocalTaskCreate)
}
func (s *recordingLocalTaskService) Get(context.Context, LocalTaskIDParams) (any, error) {
	return s.called(MethodLocalTaskGet)
}
func (s *recordingLocalTaskService) GetContextDetails(context.Context, LocalTaskIDParams) (any, error) {
	return s.called(MethodLocalTaskGetContextDetails)
}
func (s *recordingLocalTaskService) List(context.Context, LocalTaskListParams) (any, error) {
	return s.called(MethodLocalTaskList)
}
func (s *recordingLocalTaskService) ListTags(context.Context) (any, error) {
	return s.called(MethodLocalTaskListTags)
}
func (s *recordingLocalTaskService) Update(context.Context, LocalTaskUpdateParams) (any, error) {
	return s.called(MethodLocalTaskUpdate)
}
func (s *recordingLocalTaskService) Search(context.Context, LocalTaskSearchParams) (any, error) {
	return s.called(MethodLocalTaskSearch)
}
func (s *recordingLocalTaskService) LinkWorkspace(context.Context, LocalTaskLinkWorkspaceParams) (any, error) {
	return s.called(MethodLocalTaskLinkWorkspace)
}
func (s *recordingLocalTaskService) UnlinkWorkspace(context.Context, LocalTaskLinkIDParams) (any, error) {
	return s.called(MethodLocalTaskUnlinkWorkspace)
}
func (s *recordingLocalTaskService) UpdateWorkspaceLinkStatus(context.Context, LocalTaskUpdateLinkStatusParams) (any, error) {
	return s.called(MethodLocalTaskUpdateWorkspaceLinkStatus)
}
func (s *recordingLocalTaskService) ListWorkspaceLinks(context.Context, LocalTaskWorkspaceIDParams) (any, error) {
	return s.called(MethodLocalTaskListWorkspaceLinks)
}
func (s *recordingLocalTaskService) ListTaskLinks(context.Context, LocalTaskIDParams) (any, error) {
	return s.called(MethodLocalTaskListTaskLinks)
}

func TestLocalTaskHandler_DecodesAndCallsOneServiceMethod(t *testing.T) {
	tests := []struct {
		method string
		params string
	}{
		{MethodLocalTaskCreate, `{"title":"Task"}`},
		{MethodLocalTaskGet, `{"id":"task-1"}`},
		{MethodLocalTaskGetContextDetails, `{"id":"task-1"}`},
		{MethodLocalTaskList, `{}`},
		{MethodLocalTaskListTags, `{}`},
		{MethodLocalTaskUpdate, `{"id":"task-1","title":"Updated"}`},
		{MethodLocalTaskSearch, `{"query":"task"}`},
		{MethodLocalTaskLinkWorkspace, `{"taskId":"task-1","workspaceId":"workspace-1"}`},
		{MethodLocalTaskUnlinkWorkspace, `{"linkId":"link-1"}`},
		{MethodLocalTaskUpdateWorkspaceLinkStatus, `{"linkId":"link-1","status":"paused"}`},
		{MethodLocalTaskListWorkspaceLinks, `{"workspaceId":"workspace-1"}`},
		{MethodLocalTaskListTaskLinks, `{"id":"task-1"}`},
	}
	for _, test := range tests {
		t.Run(test.method, func(t *testing.T) {
			service := &recordingLocalTaskService{}
			handler := &LocalTaskHandler{Services: service}
			got, err := handler.Call(context.Background(), &Connection{}, test.method, json.RawMessage(test.params))
			if err != nil {
				t.Fatalf("Call: %v", err)
			}
			if got != test.method || service.calls != 1 {
				t.Fatalf("result = %v, calls = %d", got, service.calls)
			}
		})
	}
}

func TestLocalTaskHandler_InvalidParamsDoNotCallService(t *testing.T) {
	service := &recordingLocalTaskService{}
	handler := &LocalTaskHandler{Services: service}

	_, err := handler.Call(context.Background(), &Connection{}, MethodLocalTaskCreate, json.RawMessage(`{`))
	var rpcErr *Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != CodeInvalidParams {
		t.Fatalf("Call error = %v, want invalid params", err)
	}
	if service.calls != 0 {
		t.Fatalf("service calls = %d, want 0", service.calls)
	}
}

func TestLocalTaskHandler_SetPrimaryMethodIsNotFound(t *testing.T) {
	handler := &LocalTaskHandler{Services: &recordingLocalTaskService{}}
	_, err := handler.Call(context.Background(), &Connection{}, "localTask.setPrimary", json.RawMessage(`{}`))
	var rpcErr *Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != CodeMethodNotFound {
		t.Fatalf("Call error = %v, want method not found", err)
	}
}

func TestLocalTaskHandler_ListTagsRejectsMalformedParams(t *testing.T) {
	service := &recordingLocalTaskService{}
	handler := &LocalTaskHandler{Services: service}
	_, err := handler.Call(context.Background(), &Connection{}, MethodLocalTaskListTags, json.RawMessage(`{`))
	var rpcErr *Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != CodeInvalidParams {
		t.Fatalf("Call error = %v, want invalid params", err)
	}
	if service.calls != 0 {
		t.Fatalf("service calls = %d, want 0", service.calls)
	}
}
