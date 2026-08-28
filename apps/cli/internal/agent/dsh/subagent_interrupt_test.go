package dsh

import "testing"

func TestValidateSubagentInterruptRequest_RejectsMissingRequiredFields(t *testing.T) {
	testCases := []struct {
		name    string
		request SubagentInterruptRequest
	}{
		{name: "cwd", request: SubagentInterruptRequest{ParentSessionID: "parent", ChildSessionID: "child"}},
		{name: "parent", request: SubagentInterruptRequest{CWD: "/workspace", ChildSessionID: "child"}},
		{name: "child", request: SubagentInterruptRequest{CWD: "/workspace", ParentSessionID: "parent"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if err := validateSubagentInterruptRequest(testCase.request); err == nil {
				t.Fatal("accepted incomplete request")
			}
		})
	}
}

func TestSubagentInterruptWireResult_DecodesExactRuntimeResult(t *testing.T) {
	request := SubagentInterruptRequest{CWD: "/workspace", ParentSessionID: "parent", ChildSessionID: "child"}
	var response subagentInterruptWireResult
	if err := decodeStrictJSON([]byte(`{"parentSessionId":"parent","childSessionId":"child","interruptRequested":true}`), &response); err != nil {
		t.Fatalf("decode strict runtime result: %v", err)
	}
	result, err := response.validate(request)
	if err != nil {
		t.Fatalf("validate runtime result: %v", err)
	}
	want := SubagentInterruptResult{ParentSessionID: "parent", ChildSessionID: "child", InterruptRequested: true}
	if result != want {
		t.Fatalf("result = %#v, want %#v", result, want)
	}
}

func TestSubagentInterruptWireResult_RejectsInvalidWireDenials(t *testing.T) {
	request := SubagentInterruptRequest{CWD: "/workspace", ParentSessionID: "parent", ChildSessionID: "child"}
	requested := true
	notRequested := false
	testCases := []struct {
		name     string
		response subagentInterruptWireResult
	}{
		{name: "missing dispatch", response: subagentInterruptWireResult{ParentSessionID: "parent", ChildSessionID: "child"}},
		{name: "dispatch denied", response: subagentInterruptWireResult{ParentSessionID: "parent", ChildSessionID: "child", InterruptRequested: &notRequested}},
		{name: "wrong parent", response: subagentInterruptWireResult{ParentSessionID: "other", ChildSessionID: "child", InterruptRequested: &requested}},
		{name: "wrong child", response: subagentInterruptWireResult{ParentSessionID: "parent", ChildSessionID: "other", InterruptRequested: &requested}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := testCase.response.validate(request); err == nil {
				t.Fatal("accepted invalid response")
			}
		})
	}
}

func TestSubagentInterruptWireResult_RejectsMalformedJSON(t *testing.T) {
	var response subagentInterruptWireResult
	err := decodeStrictJSON([]byte(`{"parentSessionId":"parent","childSessionId":"child","interruptRequested":true,"extra":true}`), &response)
	if err == nil {
		t.Fatal("accepted unknown subagent interrupt response field")
	}
}
