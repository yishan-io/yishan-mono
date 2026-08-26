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
func (s *recordingLocalTaskService) GetDetails(context.Context, LocalTaskIDParams) (any, error) {
	return s.called(MethodLocalTaskGetDetails)
}
func (s *recordingLocalTaskService) GetContextDetails(context.Context, LocalTaskIDParams) (any, error) {
	return s.called(MethodLocalTaskGetContextDetails)
}
func (s *recordingLocalTaskService) List(context.Context, LocalTaskListParams) (any, error) {
	return s.called(MethodLocalTaskList)
}
func (s *recordingLocalTaskService) ListProjection(context.Context, LocalTaskListProjectionParams) (any, error) {
	return s.called(MethodLocalTaskListProjection)
}
func (s *recordingLocalTaskService) ListTags(context.Context) (any, error) {
	return s.called(MethodLocalTaskListTags)
}
func (s *recordingLocalTaskService) ListTagCatalog(context.Context) (any, error) {
	return s.called(MethodLocalTaskListTagCatalog)
}
func (s *recordingLocalTaskService) UpdateTagColor(context.Context, LocalTaskUpdateTagColorParams) (any, error) {
	return s.called(MethodLocalTaskUpdateTagColor)
}
func (s *recordingLocalTaskService) CreateTag(context.Context, LocalTaskCreateTagParams) (any, error) {
	return s.called(MethodLocalTaskCreateTag)
}
func (s *recordingLocalTaskService) RenameTag(context.Context, LocalTaskRenameTagParams) (any, error) {
	return s.called(MethodLocalTaskRenameTag)
}
func (s *recordingLocalTaskService) DeleteTag(context.Context, LocalTaskDeleteTagParams) (any, error) {
	return s.called(MethodLocalTaskDeleteTag)
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
		{MethodLocalTaskGetDetails, `{"id":"task-1"}`},
		{MethodLocalTaskGetContextDetails, `{"id":"task-1"}`},
		{MethodLocalTaskList, `{}`},
		{MethodLocalTaskListProjection, `{}`},
		{MethodLocalTaskListTags, `{}`},
		{MethodLocalTaskListTagCatalog, `{}`},
		{MethodLocalTaskUpdateTagColor, `{"id":"tag-1","color":null}`},
		{MethodLocalTaskCreateTag, `{"name":"First"}`},
		{MethodLocalTaskRenameTag, `{"id":"tag-1","name":"Renamed"}`},
		{MethodLocalTaskDeleteTag, `{"id":"tag-1"}`},
		{MethodLocalTaskUpdate, `{"id":"task-1","title":"Updated"}`},
		{MethodLocalTaskSearch, `{"query":"task"}`},
		{MethodLocalTaskLinkWorkspace, `{"taskId":"task-1","workspaceId":"workspace-1"}`},
		{MethodLocalTaskUnlinkWorkspace, `{"linkId":"link-1"}`},
		{MethodLocalTaskUpdateWorkspaceLinkStatus, `{"linkId":"link-1","status":"cancelled"}`},
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

func TestLocalTaskHandler_UpdateTagColorRequiresColor(t *testing.T) {
	service := &recordingLocalTaskService{}
	handler := &LocalTaskHandler{Services: service}

	_, err := handler.Call(context.Background(), &Connection{}, MethodLocalTaskUpdateTagColor, json.RawMessage(`{"key":"first"}`))
	if err == nil {
		t.Fatal("Call succeeded without color")
	}
	if service.calls != 0 {
		t.Fatalf("service calls = %d, want 0", service.calls)
	}
}

func TestLocalTaskHandler_TagMutationsRejectMalformedParams(t *testing.T) {
	for _, method := range []string{MethodLocalTaskCreateTag, MethodLocalTaskRenameTag, MethodLocalTaskDeleteTag} {
		t.Run(method, func(t *testing.T) {
			service := &recordingLocalTaskService{}
			handler := &LocalTaskHandler{Services: service}
			_, err := handler.Call(context.Background(), &Connection{}, method, json.RawMessage(`{`))
			var rpcErr *Error
			if !errors.As(err, &rpcErr) || rpcErr.Code != CodeInvalidParams {
				t.Fatalf("Call error = %v, want invalid params", err)
			}
			if service.calls != 0 {
				t.Fatalf("service calls = %d, want 0", service.calls)
			}
		})
	}
}

func TestLocalTaskHandler_UpdateTagColorRequiresExactlyOneSelector(t *testing.T) {
	tests := []string{
		`{"color":null}`,
		`{"id":"tag-1","tag":"stale","color":null}`,
		`{"id":"tag-1","key":"tag-1","color":null}`,
		`{"tag":"name","key":"name","color":null}`,
	}
	for _, params := range tests {
		t.Run(params, func(t *testing.T) {
			service := &recordingLocalTaskService{}
			handler := &LocalTaskHandler{Services: service}
			_, err := handler.Call(context.Background(), &Connection{}, MethodLocalTaskUpdateTagColor, json.RawMessage(params))
			var rpcErr *Error
			if !errors.As(err, &rpcErr) || rpcErr.Code != CodeInvalidParams {
				t.Fatalf("Call error = %v, want invalid params", err)
			}
			if service.calls != 0 {
				t.Fatalf("service calls = %d, want 0", service.calls)
			}
		})
	}
}

func TestLocalTaskHandler_UpdateTagColorRejectsLegacyCustomColor(t *testing.T) {
	// {id, color:null, customColor:'#123456'} must be rejected before service dispatch
	// to guard against version-skew clearing a color that the daemon cannot interpret.
	tests := []struct {
		name   string
		params string
	}{
		{
			name:   "customColor with null color",
			params: `{"id":"tag-1","color":null,"customColor":"#123456"}`,
		},
		{
			name:   "customColor with explicit color",
			params: `{"id":"tag-1","color":"#AABBCC","customColor":"#123456"}`,
		},
		{
			name:   "customColor via key selector",
			params: `{"key":"first","color":null,"customColor":"#123456"}`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := &recordingLocalTaskService{}
			handler := &LocalTaskHandler{Services: service}
			_, err := handler.Call(context.Background(), &Connection{}, MethodLocalTaskUpdateTagColor, json.RawMessage(test.params))
			var rpcErr *Error
			if !errors.As(err, &rpcErr) || rpcErr.Code != CodeInvalidParams {
				t.Fatalf("Call error = %v, want invalid params (CodeInvalidParams)", err)
			}
			if service.calls != 0 {
				t.Fatalf("service calls = %d, want 0 — customColor must not reach service", service.calls)
			}
		})
	}
}
