package rpc

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

type localTaskContractFixture struct {
	Requests []localTaskContractRequest `json:"requests"`
	TagCases []localTaskContractTagCase `json:"tagCases"`
}

type localTaskContractRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	Result  json.RawMessage `json:"result"`
}

type localTaskContractTagCase struct {
	Name    string          `json:"name"`
	Params  json.RawMessage `json:"params"`
	HasTags bool            `json:"hasTags"`
}

func TestLocalTaskRPCContractFixture_UsesActualMethodsAndExactPayloads(t *testing.T) {
	fixture := readLocalTaskContractFixture(t)
	methods := []string{
		MethodLocalTaskCreate,
		MethodLocalTaskGet,
		MethodLocalTaskGetDetails,
		MethodLocalTaskList,
		MethodLocalTaskListProjection,
		MethodLocalTaskUpdate,
		MethodLocalTaskUpdate,
		MethodLocalTaskSearch,
		MethodLocalTaskGetContextDetails,
		MethodLocalTaskListTagCatalog,
		MethodLocalTaskUpdateTagColor,
		MethodLocalTaskUpdateTagColor,
		MethodLocalTaskCreateTag,
		MethodLocalTaskRenameTag,
		MethodLocalTaskDeleteTag,
	}
	if len(fixture.Requests) != len(methods) {
		t.Fatalf("fixture requests = %d, want %d", len(fixture.Requests), len(methods))
	}
	for index, request := range fixture.Requests {
		t.Run(request.Method, func(t *testing.T) {
			if request.JSONRPC != "2.0" || request.ID != 1 || request.Method != methods[index] {
				t.Fatalf("request envelope = %#v, want method %q", request, methods[index])
			}
			assertLocalTaskContractPayload(t, request.Method, request.Params)
			assertLocalTaskContractResult(t, request.Method, request.Result)
		})
	}
}

func TestLocalTaskRPCContractFixture_PreservesOmittedAndEmptyUpdateTags(t *testing.T) {
	fixture := readLocalTaskContractFixture(t)
	for _, tagCase := range fixture.TagCases {
		t.Run(tagCase.Name, func(t *testing.T) {
			var update LocalTaskUpdateParams
			if err := json.Unmarshal(tagCase.Params, &update); err != nil {
				t.Fatal(err)
			}
			if (update.Tags != nil) != tagCase.HasTags {
				t.Fatalf("tags present = %t, want %t", update.Tags != nil, tagCase.HasTags)
			}
			if tagCase.Name == "empty references" && (update.TagRefs == nil || len(*update.TagRefs) != 0) {
				t.Fatalf("tag references = %#v, want explicit empty", update.TagRefs)
			}
			assertExactJSON(t, tagCase.Params, update)
		})
	}
}

func assertLocalTaskContractPayload(t *testing.T, method string, payload json.RawMessage) {
	t.Helper()
	switch method {
	case MethodLocalTaskCreate:
		assertExactJSON(t, payload, LocalTaskCreateParams{})
	case MethodLocalTaskGet, MethodLocalTaskGetDetails, MethodLocalTaskGetContextDetails:
		assertExactJSON(t, payload, LocalTaskIDParams{})
	case MethodLocalTaskList:
		assertExactJSON(t, payload, LocalTaskListParams{})
	case MethodLocalTaskListProjection:
		assertExactJSON(t, payload, LocalTaskListProjectionParams{})
	case MethodLocalTaskUpdate:
		assertExactJSON(t, payload, LocalTaskUpdateParams{})
	case MethodLocalTaskSearch:
		assertExactJSON(t, payload, LocalTaskSearchParams{})
	case MethodLocalTaskListTagCatalog:
		assertExactJSON(t, payload, struct{}{})
	case MethodLocalTaskUpdateTagColor:
		assertExactJSON(t, payload, LocalTaskUpdateTagColorParams{})
	case MethodLocalTaskCreateTag:
		assertExactJSON(t, payload, LocalTaskCreateTagParams{})
	case MethodLocalTaskRenameTag:
		assertExactJSON(t, payload, LocalTaskRenameTagParams{})
	case MethodLocalTaskDeleteTag:
		assertExactJSON(t, payload, LocalTaskDeleteTagParams{})
	default:
		t.Fatalf("unsupported fixture method %q", method)
	}
}

func assertLocalTaskContractResult(t *testing.T, method string, payload json.RawMessage) {
	t.Helper()
	switch method {
	case MethodLocalTaskCreate, MethodLocalTaskGet, MethodLocalTaskUpdate:
		assertExactJSON(t, payload, localtask.Task{})
	case MethodLocalTaskGetDetails:
		assertExactJSON(t, payload, localtask.Details{})
	case MethodLocalTaskList:
		assertExactJSON(t, payload, []localtask.Task{})
	case MethodLocalTaskListProjection:
		assertExactJSON(t, payload, localtask.ListProjection{})
	case MethodLocalTaskSearch:
		assertExactJSON(t, payload, []localtask.SearchResult{})
	case MethodLocalTaskGetContextDetails:
		assertExactJSON(t, payload, localtask.ContextDetails{})
	case MethodLocalTaskListTagCatalog:
		assertExactJSON(t, payload, []localtask.Tag{})
	case MethodLocalTaskUpdateTagColor, MethodLocalTaskCreateTag:
		assertExactJSON(t, payload, localtask.Tag{})
	case MethodLocalTaskRenameTag:
		assertExactJSON(t, payload, LocalTaskRenameTagResult{})
	case MethodLocalTaskDeleteTag:
		assertExactJSON(t, payload, LocalTaskDeleteTagResult{})
	default:
		t.Fatalf("unsupported fixture method %q", method)
	}
}

func assertExactJSON[T any](t *testing.T, expected json.RawMessage, decoded T) {
	t.Helper()
	if err := json.Unmarshal(expected, &decoded); err != nil {
		t.Fatal(err)
	}
	actual, err := json.Marshal(decoded)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != string(expected) {
		t.Fatalf("decoded JSON = %s, want %s", actual, expected)
	}
}

func readLocalTaskContractFixture(t *testing.T) localTaskContractFixture {
	t.Helper()
	fixturePath := filepath.Join("..", "..", "..", "..", "fixtures", "local-task-rpc-contract.json")
	contents, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	var fixture localTaskContractFixture
	if err := json.Unmarshal(contents, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture
}
