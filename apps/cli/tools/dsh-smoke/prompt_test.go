package main

import "testing"

func TestParsePromptResult_ReportsEndTurn(t *testing.T) {
	stopReason, err := parsePromptResult([]byte(`{"stopReason":"end_turn"}`))
	if err != nil {
		t.Fatalf("parse prompt result: %v", err)
	}
	if stopReason != "end_turn" {
		t.Fatalf("stop reason = %q, want end_turn", stopReason)
	}
}

func TestParsePromptResult_RejectsMissingStopReason(t *testing.T) {
	_, err := parsePromptResult([]byte(`{}`))
	if err == nil {
		t.Fatal("parse prompt result succeeded without stop reason")
	}
}
