package memory

import (
	"bytes"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func TestHandleSummarizeResult_UsesDistinctLogsForSkippedAndNoOutput(t *testing.T) {
	service := &Service{}
	req := summarizeRequest{agent: "opencode", worktreePath: "/tmp/workspace"}

	skippedLogs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, SummarizeResult{Skipped: true})
	})
	if strings.Contains(skippedLogs, "session summarization produced no output") {
		t.Fatal("skipped summarization should not log produced no output")
	}
	if !strings.Contains(skippedLogs, "session summarization skipped") {
		t.Fatal("expected skipped summarization log")
	}

	noOutputLogs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, SummarizeResult{})
	})
	if !strings.Contains(noOutputLogs, "session summarization produced no output") {
		t.Fatal("expected no-output log")
	}
}

func captureMemoryLogs(t *testing.T, run func()) string {
	t.Helper()
	var buf bytes.Buffer
	previous := log.Logger
	log.Logger = zerolog.New(&buf).With().Timestamp().Logger().Level(zerolog.DebugLevel)
	t.Cleanup(func() {
		log.Logger = previous
	})
	run()
	return buf.String()
}
