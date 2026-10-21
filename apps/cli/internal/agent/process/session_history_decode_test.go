package process

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func summaryDecodeFixture() string {
	return strings.Join([]string{
		`not json`,
		`{"type":"message","timestamp":true,"model":123,"message":{"role":"assistant","content":"fallback"}}`,
		`{"type":"message","timestamp":1780007205000,"modelId":"early","message":{"role":"user","content":"  "}}`,
		`{"type":"session","id":1,"sessionId":"alias","cwd":"/original","timestamp":"invalid"}`,
		`{"type":"session","session_id":"later-id","cwd":"/later","model":"later"}`,
		`{"message":{"role":"user","content":[{"type":"text","text":"first"},{"type":"image","text":"ignored"},{"type":"text","text":"second"}]}, "t\u0079pe" : "mess\u0061ge"}`,
		`{"type":"message","message":{"role":"toolResult","content":[{"type":"session_info","name":"fake"}],"type":"session_info"}}`,
		"\u00a0" + `{"type":"session_info","name":"old"}` + "\u2003",
		`{"name":"  new \"quoted\" name  ", "type" : " session_info "}`,
		`{"type":"session_info","name":" "}`,
		`{"type":"session_info","name":"invalid"} trailing`,
		`{"Type":"session_info","name":"wrong case"}`,
		`{"type":"message","message":{"role":"user","content":"later"}}`,
	}, "\n")
}

func TestReadSessionSummary_SelectiveDecodeEquivalence(t *testing.T) {
	body := summaryDecodeFixture()
	path := filepath.Join(t.TempDir(), "stamp_fallback.jsonl")
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	want := baselineSummaryForBody(t, body, "fallback")
	got, err := readSessionSummary(context.Background(), path)
	if err != nil || got != want {
		t.Fatalf("got %+v, err=%v; want %+v", got, err, want)
	}
	if got.SessionName != `new "quoted" name` || got.PreviewText != "first\n\nsecond" ||
		got.Model != "early" || got.SessionID != "later-id" || got.CWD != "/original" ||
		got.Timestamp.UnixMilli() != 1780007205000 {
		t.Fatalf("unexpected summary: %+v", got)
	}
}

func baselineSummaryForBody(t *testing.T, body, id string) SessionSummary {
	t.Helper()
	summary := SessionSummary{SessionID: id}
	collector := &sessionPreviewCollector{}
	for _, line := range strings.Split(body, "\n") {
		if top, ok := parseSessionLine(strings.TrimSpace(line)); ok {
			applySessionSummaryLine(&summary, top, collector)
		}
	}
	summary.PreviewText = collector.preview()
	return summary
}

func TestReadSessionSummary_LateHeaderAndScanLimit(t *testing.T) {
	for _, tc := range []struct{ name, tail string }{
		{"child", `{"type":"session","parentSession":"parent"}`},
		{"line limit", strings.Repeat("x", maxSessionSummaryScanLineBytes+1)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "main.jsonl")
			body := summaryDecodeFixture() + "\n" + tc.tail
			if err := os.WriteFile(path, []byte(body), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := readSessionSummary(context.Background(), path); err == nil {
				t.Fatal("expected exclusion/error after first user")
			}
		})
	}
}

func TestReadSessionSummary_AssistantFallback(t *testing.T) {
	body := `{"type":"message","message":{"role":"user","content":" "}}
{"type":"message","message":{"role":"assistant","content":"first assistant"}}
{"type":"message","message":{"role":"assistant","content":"later assistant"}}`
	path := filepath.Join(t.TempDir(), "fallback.jsonl")
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := readSessionSummary(context.Background(), path)
	if err != nil || got.PreviewText != "first assistant" || got.Timestamp.Before(time.Now().Add(-time.Minute)) {
		t.Fatalf("got %+v, err=%v", got, err)
	}
}

func TestParseSessionSummaryLine_SelectiveMessage(t *testing.T) {
	cases := []struct {
		name, line                              string
		shouldReadPreview, wantMessage, isValid bool
	}{
		{"user preview", `{"type":"message","message":{"role":"user","content":"hello"}}`, true, true, true},
		{"preview settled", `{"type":"message","modelId":"late","message":{"role":"user","content":"large"}}`, false, false, true},
		{"tool payload", `{"type":"message","message":{"role":"toolResult","content":{"type":"session_info","name":"fake"}}}`, true, false, true},
		{"escaped role", `{"type":"message","message":{"r\u006fle":" assista\u006et ","content":"hello"}}`, true, true, true},
		{"wrong role shape", `{"type":"message","message":{"role":{},"content":"hello"}}`, true, false, true},
		{"wrong message shape", `{"type":"message","message":[]}`, true, false, true},
		{"malformed", `{"type":"session_info","name":"bad"}x`, false, false, false},
		{"nested fake type", `{"message":{"type":"session_info","name":"fake"}}`, true, false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			top, isValid := parseSessionSummaryLine([]byte(tc.line), tc.shouldReadPreview)
			_, hasMessage := top["message"]
			if isValid != tc.isValid || hasMessage != tc.wantMessage {
				t.Fatalf("valid=%t message=%t; want valid=%t message=%t", isValid, hasMessage, tc.isValid, tc.wantMessage)
			}
		})
	}
}

func TestReadSessionSummary_SnapshotEquivalence(t *testing.T) {
	path := os.Getenv("SESSION_SUMMARY_PERF_SNAPSHOT")
	if path == "" {
		t.Skip("set SESSION_SUMMARY_PERF_SNAPSHOT for real transcript equivalence")
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := baselineSummaryForBody(t, string(body), sessionIDFromPath(path))
	got, err := readSessionSummary(context.Background(), path)
	if err != nil || got != want {
		t.Fatalf("snapshot differs from generic decoder: err=%v", err)
	}
}

func TestReadSessionSummary_LegacyOuterWhitespace(t *testing.T) {
	body := "\u00a0" + `{"type":"session_info","name":"trimmed"}` + "\u2003"
	path := filepath.Join(t.TempDir(), "main.jsonl")
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := readSessionSummary(context.Background(), path)
	if err != nil || got.SessionName != "trimmed" {
		t.Fatalf("got %+v, err=%v", got, err)
	}
}

func TestParseSessionSummaryLine_OverflowEquivalence(t *testing.T) {
	for _, line := range []string{
		`{"type":"session_info","name":"bad","unused":1e1000}`,
		`{"type":"session_info","unused":{"nested":[1e1000]},"unused":null}`,
		`{"type":"session_info","name":1e1000,"name":"bad"}`,
		`{"type":"message","message":{"role":"toolResult","content":[-1e999]}}`,
		`{"type":"message","message":{"role":"user","content":"ok","unused":1e1000}}`,
	} {
		for _, shouldReadPreview := range []bool{true, false} {
			_, wantValid := parseSessionLine(line)
			_, gotValid := parseSessionSummaryLine([]byte(line), shouldReadPreview)
			if gotValid != wantValid {
				t.Errorf("preview=%t valid=%t want=%t: %s", shouldReadPreview, gotValid, wantValid, line)
			}
		}
	}
}

func TestParseSessionSummaryLine_LegacyProbe(t *testing.T) {
	records := []string{
		`null`, `[]`, `42`, `"text"`, `{}`, `{"type":"session_info","name":"a"}{}`,
		`{"type":"session_info","name":[}`, `{"type":"message","message":{"role":"user"}`,
		`{"type":"session_info","name":"last","name":null}`,
		`{"type":"session_info","name":{},"name":"last"}`,
		`{"type":"message","message":{"role":"user","content":"a"},"message":null}`,
		`{"type":"message","message":{"role":"user","content":[{"type":"text","text":"\u2003 x \u00a0"}]}}`,
		`{"type":"session","id":"a","sessionId":"b","session_id":"c","parentSession":"parent"}`,
	}
	numbers := []string{"0", "-0", "1.7976931348623157e308", "1.7976931348623159e308", "1e-1000", "0e9999", strings.Repeat("9", 308), strings.Repeat("9", 309), "0." + strings.Repeat("0", 400) + "1"}
	for _, number := range numbers {
		records = append(records, `{"type":"session_info","name":"number","unused":{"numbers":[`+number+`]},"unused":null}`)
	}
	for _, key := range []string{`"type"`, `"t\u0079pe"`, `"Type"`} {
		for _, kind := range []string{`"session_info"`, `" session_info "`, `"session_\u0069nfo"`, `null`, `{}`} {
			records = append(records, "{\t"+key+"\r:\n"+kind+`,"name":"\u2003 escaped \\\" } [ \u263a \ud800 \u00a0","unused":{"type":"message","name":"fake"}}`)
		}
	}
	for _, record := range records {
		for _, shouldReadPreview := range []bool{true, false} {
			assertSummaryLineMatchesLegacy(t, record, shouldReadPreview)
		}
	}
}

func assertSummaryLineMatchesLegacy(t *testing.T, line string, shouldReadPreview bool) {
	t.Helper()
	legacy, wantValid := parseSessionLine(line)
	selected, gotValid := parseSessionSummaryLine([]byte(line), shouldReadPreview)
	if gotValid != wantValid {
		t.Fatalf("valid=%t want=%t: %s", gotValid, wantValid, line)
	}
	if !wantValid {
		return
	}
	want, got := SessionSummary{}, SessionSummary{}
	wantCollector, gotCollector := &sessionPreviewCollector{}, &sessionPreviewCollector{}
	if !shouldReadPreview {
		wantCollector.firstUserText, gotCollector.firstUserText = "settled", "settled"
	}
	applySessionSummaryLine(&want, legacy, wantCollector)
	applySessionSummaryLine(&got, selected, gotCollector)
	want.PreviewText, got.PreviewText = wantCollector.preview(), gotCollector.preview()
	if got != want || getString(selected, "parentSession") != getString(legacy, "parentSession") {
		t.Fatalf("preview=%t got=%+v want=%+v: %s", shouldReadPreview, got, want, line)
	}
}
