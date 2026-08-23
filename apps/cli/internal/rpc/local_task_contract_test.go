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
		MethodLocalTaskList,
		MethodLocalTaskUpdate,
		MethodLocalTaskUpdate,
		MethodLocalTaskSearch,
		MethodLocalTaskGetContextDetails,
		MethodLocalTaskListTagCatalog,
		MethodLocalTaskUpdateTagColor,
		MethodLocalTaskUpdateTagColor,
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
			assertExactJSON(t, tagCase.Params, update)
		})
	}
}

func assertLocalTaskContractPayload(t *testing.T, method string, payload json.RawMessage) {
	t.Helper()
	switch method {
	case MethodLocalTaskCreate:
		assertExactJSON(t, payload, LocalTaskCreateParams{})
	case MethodLocalTaskGet, MethodLocalTaskGetContextDetails:
		assertExactJSON(t, payload, LocalTaskIDParams{})
	case MethodLocalTaskList:
		assertExactJSON(t, payload, LocalTaskListParams{})
	case MethodLocalTaskUpdate:
		assertExactJSON(t, payload, LocalTaskUpdateParams{})
	case MethodLocalTaskSearch:
		assertExactJSON(t, payload, LocalTaskSearchParams{})
	case MethodLocalTaskListTagCatalog:
		assertExactJSON(t, payload, struct{}{})
	case MethodLocalTaskUpdateTagColor:
		assertExactJSON(t, payload, LocalTaskUpdateTagColorParams{})
	default:
		t.Fatalf("unsupported fixture method %q", method)
	}
}

func assertLocalTaskContractResult(t *testing.T, method string, payload json.RawMessage) {
	t.Helper()
	switch method {
	case MethodLocalTaskCreate, MethodLocalTaskGet, MethodLocalTaskUpdate:
		assertExactJSON(t, payload, localtask.Task{})
	case MethodLocalTaskList:
		assertExactJSON(t, payload, []localtask.Task{})
	case MethodLocalTaskSearch:
		assertExactJSON(t, payload, []localtask.SearchResult{})
	case MethodLocalTaskGetContextDetails:
		assertExactJSON(t, payload, localtask.ContextDetails{})
	case MethodLocalTaskListTagCatalog:
		assertExactJSON(t, payload, []localtask.Tag{})
	case MethodLocalTaskUpdateTagColor:
		assertExactJSON(t, payload, localtask.Tag{})
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
